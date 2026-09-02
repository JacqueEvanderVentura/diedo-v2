from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from datetime import UTC, date, datetime, time
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, TypeVar, cast
from uuid import UUID, uuid7
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.db.models import (
    AuditEntry,
    FinanceAccount,
    FinanceBudget,
    FinanceExpense,
    FinanceFixedExpense,
    FinanceFixedExpensePayment,
    FinanceLiability,
    FinanceManualIncome,
)
from app.repositories.finance import (
    AccountStatsRecord,
    BudgetRecord,
    BudgetStatsRecord,
    EntityPage,
    ExpenseViewRecord,
    FinanceRepository,
    FixedExpenseRecord,
    IncomeViewRecord,
    LiabilityStatsRecord,
)
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)

EntityT = TypeVar("EntityT")


class FinanceService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = FinanceRepository(session)

    def list_expenses(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID | None,
        search: str | None,
        status: str | None,
        date_from: date | None,
        date_to: date | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> EntityPage[ExpenseViewRecord]:
        self._validate_filters(grant, branch_id, date_from, date_to)
        workspace = self._required_workspace(grant.workspace_id)
        return self._repository.list_expenses(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            search=self._normalize_optional_text(search),
            status=status,
            date_from=date_from,
            date_to=date_to,
            timezone=workspace.timezone,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )

    def get_expense(self, grant: PermissionGrant, expense_id: UUID) -> FinanceExpense:
        expense = self._repository.get_expense(
            grant.workspace_id, expense_id, grant.allowed_branch_ids
        )
        if expense is None:
            raise ResourceNotFoundError("El gasto no existe.", "expenseId")
        return expense

    def create_expense(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> FinanceExpense:
        branch_id = cast(UUID, values["branch_id"])
        self._require_branch(grant, branch_id)
        budget_id = cast(UUID | None, values.get("budget_id"))
        self._validate_budget(grant, budget_id, branch_id)
        persistent = {
            "branch_id": branch_id,
            "concept": self._normalize_required_text(cast(str, values["concept"])),
            "amount": values["amount"],
            "category": values["category"],
            "expense_date": values["date"],
            "payment_status": values["status"],
            "budget_id": budget_id,
        }
        fingerprint = self._fingerprint(persistent)
        return self._create_idempotent(
            model=FinanceExpense,
            workspace_id=grant.workspace_id,
            idempotency_key=idempotency_key,
            fingerprint=fingerprint,
            branch_id=branch_id,
            factory=lambda entity_id: FinanceExpense(
                id=entity_id,
                workspace_id=grant.workspace_id,
                **persistent,
                creation_idempotency_key=idempotency_key,
                request_fingerprint=fingerprint,
                created_by_platform_user_id=principal.platform_user_id,
                updated_by_platform_user_id=principal.platform_user_id,
            ),
            principal=principal,
            action="finance.expense.create",
            target_type="finance_expense",
        )

    def update_expense(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        expense_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> FinanceExpense:
        expense = self._required_for_update(
            lambda: self._repository.get_expense(
                grant.workspace_id, expense_id, grant.allowed_branch_ids, for_update=True
            ),
            "El gasto no existe.",
            "expenseId",
            expected_version,
        )
        branch_id = cast(UUID, changes.get("branch_id", expense.branch_id))
        self._require_branch(grant, branch_id)
        budget_id = changes.get("budget_id", expense.budget_id)
        self._validate_budget(grant, cast(UUID | None, budget_id), branch_id)
        mapping = {
            "concept": "concept",
            "amount": "amount",
            "category": "category",
            "date": "expense_date",
            "branch_id": "branch_id",
            "status": "payment_status",
            "budget_id": "budget_id",
        }
        self._apply_changes(expense, changes, mapping)
        if "concept" in changes:
            expense.concept = self._normalize_required_text(expense.concept)
        return self._finish_update(
            expense,
            principal,
            "finance.expense.update",
            "finance_expense",
        )

    def void_expense(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        expense_id: UUID,
        expected_version: int,
    ) -> None:
        expense = self._required_for_update(
            lambda: self._repository.get_expense(
                grant.workspace_id, expense_id, grant.allowed_branch_ids, for_update=True
            ),
            "El gasto no existe.",
            "expenseId",
            expected_version,
        )
        expense.record_status = "voided"
        expense.voided_at = datetime.now(UTC)
        expense.voided_by_platform_user_id = principal.platform_user_id
        self._finish_update(
            expense,
            principal,
            "finance.expense.void",
            "finance_expense",
        )

    def list_fixed_expenses(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID | None,
        search: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> EntityPage[FixedExpenseRecord]:
        self._validate_filters(grant, branch_id)
        return self._repository.list_fixed_expenses(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            search=self._normalize_optional_text(search),
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )

    def get_fixed_expense(self, grant: PermissionGrant, expense_id: UUID) -> FixedExpenseRecord:
        record = self._repository.fixed_expense_record(
            grant.workspace_id, expense_id, grant.allowed_branch_ids
        )
        if record is None:
            raise ResourceNotFoundError("El gasto fijo no existe.", "fixedExpenseId")
        return record

    def create_fixed_expense(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> FinanceFixedExpense:
        branch_id = cast(UUID, values["branch_id"])
        self._require_branch(grant, branch_id)
        concept = self._normalize_required_text(cast(str, values["concept"]))
        persistent = {
            "branch_id": branch_id,
            "concept": concept,
            "normalized_concept": concept.casefold(),
            "amount": values["amount"],
            "category": values["category"],
            "day_of_month": values["day_of_month"],
        }
        fingerprint = self._fingerprint(persistent)
        return self._create_idempotent(
            model=FinanceFixedExpense,
            workspace_id=grant.workspace_id,
            idempotency_key=idempotency_key,
            fingerprint=fingerprint,
            branch_id=branch_id,
            factory=lambda entity_id: FinanceFixedExpense(
                id=entity_id,
                workspace_id=grant.workspace_id,
                **persistent,
                creation_idempotency_key=idempotency_key,
                request_fingerprint=fingerprint,
                created_by_platform_user_id=principal.platform_user_id,
                updated_by_platform_user_id=principal.platform_user_id,
            ),
            principal=principal,
            action="finance.fixed_expense.create",
            target_type="finance_fixed_expense",
        )

    def update_fixed_expense(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        expense_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> FinanceFixedExpense:
        expense = self._required_for_update(
            lambda: self._repository.get_fixed_expense(
                grant.workspace_id, expense_id, grant.allowed_branch_ids, for_update=True
            ),
            "El gasto fijo no existe.",
            "fixedExpenseId",
            expected_version,
        )
        branch_id = cast(UUID, changes.get("branch_id", expense.branch_id))
        self._require_branch(grant, branch_id)
        mapping = {
            "concept": "concept",
            "amount": "amount",
            "category": "category",
            "branch_id": "branch_id",
            "day_of_month": "day_of_month",
        }
        self._apply_changes(expense, changes, mapping)
        if "concept" in changes:
            expense.concept = self._normalize_required_text(expense.concept)
            expense.normalized_concept = expense.concept.casefold()
        return self._finish_update(
            expense,
            principal,
            "finance.fixed_expense.update",
            "finance_fixed_expense",
        )

    def archive_fixed_expense(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        expense_id: UUID,
        expected_version: int,
    ) -> None:
        expense = self._required_for_update(
            lambda: self._repository.get_fixed_expense(
                grant.workspace_id, expense_id, grant.allowed_branch_ids, for_update=True
            ),
            "El gasto fijo no existe.",
            "fixedExpenseId",
            expected_version,
        )
        expense.status = "archived"
        self._finish_update(
            expense,
            principal,
            "finance.fixed_expense.archive",
            "finance_fixed_expense",
        )

    def pay_fixed_expense(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        expense_id: UUID,
        period: date | None,
        paid_on: date | None,
        idempotency_key: str,
    ) -> FixedExpenseRecord:
        expense = self._repository.get_fixed_expense(
            grant.workspace_id, expense_id, grant.allowed_branch_ids, for_update=True
        )
        if expense is None:
            raise ResourceNotFoundError("El gasto fijo no existe.", "fixedExpenseId")
        workspace = self._required_workspace(grant.workspace_id)
        today = datetime.now(ZoneInfo(workspace.timezone)).date()
        payment_period = period or date(today.year, today.month, 1)
        if payment_period.day != 1:
            raise InvalidOperationError("El período debe usar el primer día del mes.", "period")
        payment_date = paid_on or today
        fingerprint = self._fingerprint(
            {
                "fixed_expense_id": expense.id,
                "period": payment_period,
                "paid_on": payment_date,
                "amount": expense.amount,
            }
        )
        by_key = self._repository.find_by_idempotency(
            FinanceFixedExpensePayment, grant.workspace_id, idempotency_key
        )
        if by_key is not None:
            if by_key.request_fingerprint != fingerprint:
                raise ConflictError(
                    "Idempotency-Key ya fue usado con otro contenido.", "Idempotency-Key"
                )
            return self.get_fixed_expense(grant, expense_id)
        existing = self._repository.fixed_payment_for_period(
            grant.workspace_id, expense_id, payment_period
        )
        if existing is not None:
            raise ConflictError("Este gasto fijo ya fue pagado en el período.", "period")
        payment = FinanceFixedExpensePayment(
            id=uuid7(),
            workspace_id=grant.workspace_id,
            branch_id=expense.branch_id,
            fixed_expense_id=expense.id,
            period=payment_period,
            amount=expense.amount,
            paid_on=payment_date,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            created_by_platform_user_id=principal.platform_user_id,
        )
        self._repository.add(payment)
        self._add_audit(
            workspace_id=grant.workspace_id,
            principal=principal,
            action="finance.fixed_expense.pay",
            target_type="finance_fixed_expense_payment",
            target_id=payment.id,
            details={"fixedExpenseId": str(expense.id), "period": str(payment_period)},
        )
        self._commit_or_conflict("No se pudo registrar el pago del gasto fijo.")
        return self.get_fixed_expense(grant, expense_id)

    def list_liabilities(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID | None,
        search: str | None,
        liability_type: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> EntityPage[FinanceLiability]:
        self._validate_filters(grant, branch_id)
        return self._repository.list_liabilities(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            search=self._normalize_optional_text(search),
            liability_type=liability_type,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )

    def get_liability(self, grant: PermissionGrant, liability_id: UUID) -> FinanceLiability:
        liability = self._repository.get_liability(
            grant.workspace_id, liability_id, grant.allowed_branch_ids
        )
        if liability is None:
            raise ResourceNotFoundError("El pasivo no existe.", "liabilityId")
        return liability

    def create_liability(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> FinanceLiability:
        branch_id = cast(UUID, values["branch_id"])
        self._require_branch(grant, branch_id)
        name = self._normalize_required_text(cast(str, values["name"]))
        pending = values.get("pending_amount")
        values["pending_amount"] = values["initial_amount"] if pending is None else pending
        self._validate_liability(values)
        persistent = {
            "branch_id": branch_id,
            "name": name,
            "normalized_name": name.casefold(),
            "liability_type": values["type"],
            "initial_amount": values["initial_amount"],
            "pending_amount": values["pending_amount"],
            "pay_day": values["pay_day"],
            "cut_day": values.get("cut_day"),
            "installment": values.get("installment"),
            "paid_installments": values.get("paid_installments", 0),
            "total_installments": values.get("total_installments"),
            "category_ids": values.get("category_ids", []),
        }
        fingerprint = self._fingerprint(persistent)
        return self._create_idempotent(
            model=FinanceLiability,
            workspace_id=grant.workspace_id,
            idempotency_key=idempotency_key,
            fingerprint=fingerprint,
            branch_id=branch_id,
            factory=lambda entity_id: FinanceLiability(
                id=entity_id,
                workspace_id=grant.workspace_id,
                **persistent,
                creation_idempotency_key=idempotency_key,
                request_fingerprint=fingerprint,
                created_by_platform_user_id=principal.platform_user_id,
                updated_by_platform_user_id=principal.platform_user_id,
            ),
            principal=principal,
            action="finance.liability.create",
            target_type="finance_liability",
        )

    def update_liability(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        liability_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> FinanceLiability:
        liability = self._required_for_update(
            lambda: self._repository.get_liability(
                grant.workspace_id, liability_id, grant.allowed_branch_ids, for_update=True
            ),
            "El pasivo no existe.",
            "liabilityId",
            expected_version,
        )
        branch_id = cast(UUID, changes.get("branch_id", liability.branch_id))
        self._require_branch(grant, branch_id)
        merged = {
            "type": changes.get("type", liability.liability_type),
            "initial_amount": changes.get("initial_amount", liability.initial_amount),
            "pending_amount": changes.get("pending_amount", liability.pending_amount),
            "cut_day": changes.get("cut_day", liability.cut_day),
            "installment": changes.get("installment", liability.installment),
            "paid_installments": changes.get("paid_installments", liability.paid_installments),
            "total_installments": changes.get("total_installments", liability.total_installments),
        }
        self._validate_liability(merged)
        mapping = {
            "name": "name",
            "type": "liability_type",
            "initial_amount": "initial_amount",
            "pending_amount": "pending_amount",
            "branch_id": "branch_id",
            "pay_day": "pay_day",
            "cut_day": "cut_day",
            "installment": "installment",
            "paid_installments": "paid_installments",
            "total_installments": "total_installments",
            "category_ids": "category_ids",
        }
        self._apply_changes(liability, changes, mapping)
        if "name" in changes:
            liability.name = self._normalize_required_text(liability.name)
            liability.normalized_name = liability.name.casefold()
        return self._finish_update(
            liability,
            principal,
            "finance.liability.update",
            "finance_liability",
        )

    def archive_liability(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        liability_id: UUID,
        expected_version: int,
    ) -> None:
        liability = self._required_for_update(
            lambda: self._repository.get_liability(
                grant.workspace_id, liability_id, grant.allowed_branch_ids, for_update=True
            ),
            "El pasivo no existe.",
            "liabilityId",
            expected_version,
        )
        liability.status = "archived"
        self._finish_update(
            liability,
            principal,
            "finance.liability.archive",
            "finance_liability",
        )

    def list_budgets(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID | None,
        search: str | None,
        budget_group: str | None,
        period: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> EntityPage[BudgetRecord]:
        self._validate_filters(grant, branch_id)
        start, end, _, _ = self._month_bounds(grant.workspace_id, period)
        return self._repository.list_budgets(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            search=self._normalize_optional_text(search),
            budget_group=budget_group,
            period_start=start,
            period_end=end,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )

    def get_budget(
        self, grant: PermissionGrant, budget_id: UUID, period: str | None = None
    ) -> BudgetRecord:
        start, end, _, _ = self._month_bounds(grant.workspace_id, period)
        record = self._repository.budget_record(
            grant.workspace_id, budget_id, grant.allowed_branch_ids, start, end
        )
        if record is None:
            raise ResourceNotFoundError("El presupuesto no existe.", "budgetId")
        return record

    def create_budget(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> FinanceBudget:
        branch_id = cast(UUID, values["branch_id"])
        self._require_branch(grant, branch_id)
        name = self._normalize_required_text(cast(str, values["name"]))
        persistent = {
            "branch_id": branch_id,
            "name": name,
            "normalized_name": name.casefold(),
            "budget_group": values["group"],
            "monthly_limit": values["monthly_limit"],
        }
        fingerprint = self._fingerprint(persistent)
        return self._create_idempotent(
            model=FinanceBudget,
            workspace_id=grant.workspace_id,
            idempotency_key=idempotency_key,
            fingerprint=fingerprint,
            branch_id=branch_id,
            factory=lambda entity_id: FinanceBudget(
                id=entity_id,
                workspace_id=grant.workspace_id,
                **persistent,
                creation_idempotency_key=idempotency_key,
                request_fingerprint=fingerprint,
                created_by_platform_user_id=principal.platform_user_id,
                updated_by_platform_user_id=principal.platform_user_id,
            ),
            principal=principal,
            action="finance.budget.create",
            target_type="finance_budget",
        )

    def update_budget(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        budget_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> FinanceBudget:
        budget = self._required_for_update(
            lambda: self._repository.get_budget(
                grant.workspace_id, budget_id, grant.allowed_branch_ids, for_update=True
            ),
            "El presupuesto no existe.",
            "budgetId",
            expected_version,
        )
        branch_id = cast(UUID, changes.get("branch_id", budget.branch_id))
        self._require_branch(grant, branch_id)
        mapping = {
            "name": "name",
            "group": "budget_group",
            "monthly_limit": "monthly_limit",
            "branch_id": "branch_id",
        }
        self._apply_changes(budget, changes, mapping)
        if "name" in changes:
            budget.name = self._normalize_required_text(budget.name)
            budget.normalized_name = budget.name.casefold()
        return self._finish_update(
            budget,
            principal,
            "finance.budget.update",
            "finance_budget",
        )

    def archive_budget(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        budget_id: UUID,
        expected_version: int,
    ) -> None:
        budget = self._required_for_update(
            lambda: self._repository.get_budget(
                grant.workspace_id, budget_id, grant.allowed_branch_ids, for_update=True
            ),
            "El presupuesto no existe.",
            "budgetId",
            expected_version,
        )
        budget.status = "archived"
        self._finish_update(
            budget,
            principal,
            "finance.budget.archive",
            "finance_budget",
        )

    def list_accounts(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID | None,
        search: str | None,
        account_type: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> EntityPage[FinanceAccount]:
        self._validate_filters(grant, branch_id)
        return self._repository.list_accounts(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            search=self._normalize_optional_text(search),
            account_type=account_type,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )

    def get_account(self, grant: PermissionGrant, account_id: UUID) -> FinanceAccount:
        account = self._repository.get_account(
            grant.workspace_id, account_id, grant.allowed_branch_ids
        )
        if account is None:
            raise ResourceNotFoundError("La cuenta financiera no existe.", "accountId")
        return account

    def create_account(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> FinanceAccount:
        branch_id = cast(UUID, values["branch_id"])
        self._require_branch(grant, branch_id)
        name = self._normalize_required_text(cast(str, values["name"]))
        persistent = {
            "branch_id": branch_id,
            "name": name,
            "normalized_name": name.casefold(),
            "account_type": values["type"],
            "bank": self._normalize_text(cast(str, values.get("bank", ""))),
            "account_number_masked": self._mask_account_number(
                cast(str, values.get("account_number", ""))
            ),
            "balance": values["balance"],
            "currency_code": values["currency"],
            "notes": self._normalize_text(cast(str, values.get("notes", ""))),
        }
        fingerprint = self._fingerprint(persistent)
        return self._create_idempotent(
            model=FinanceAccount,
            workspace_id=grant.workspace_id,
            idempotency_key=idempotency_key,
            fingerprint=fingerprint,
            branch_id=branch_id,
            factory=lambda entity_id: FinanceAccount(
                id=entity_id,
                workspace_id=grant.workspace_id,
                **persistent,
                creation_idempotency_key=idempotency_key,
                request_fingerprint=fingerprint,
                created_by_platform_user_id=principal.platform_user_id,
                updated_by_platform_user_id=principal.platform_user_id,
            ),
            principal=principal,
            action="finance.account.create",
            target_type="finance_account",
        )

    def update_account(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        account_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> FinanceAccount:
        account = self._required_for_update(
            lambda: self._repository.get_account(
                grant.workspace_id, account_id, grant.allowed_branch_ids, for_update=True
            ),
            "La cuenta financiera no existe.",
            "accountId",
            expected_version,
        )
        branch_id = cast(UUID, changes.get("branch_id", account.branch_id))
        self._require_branch(grant, branch_id)
        mapping = {
            "name": "name",
            "type": "account_type",
            "bank": "bank",
            "balance": "balance",
            "currency": "currency_code",
            "branch_id": "branch_id",
            "notes": "notes",
        }
        self._apply_changes(account, changes, mapping)
        if "name" in changes:
            account.name = self._normalize_required_text(account.name)
            account.normalized_name = account.name.casefold()
        if "account_number" in changes:
            account.account_number_masked = self._mask_account_number(
                cast(str, changes["account_number"])
            )
        if "bank" in changes:
            account.bank = self._normalize_text(account.bank)
        if "notes" in changes:
            account.notes = self._normalize_text(account.notes)
        return self._finish_update(
            account,
            principal,
            "finance.account.update",
            "finance_account",
        )

    def archive_account(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        account_id: UUID,
        expected_version: int,
    ) -> None:
        account = self._required_for_update(
            lambda: self._repository.get_account(
                grant.workspace_id, account_id, grant.allowed_branch_ids, for_update=True
            ),
            "La cuenta financiera no existe.",
            "accountId",
            expected_version,
        )
        account.status = "archived"
        self._finish_update(
            account,
            principal,
            "finance.account.archive",
            "finance_account",
        )

    def list_incomes(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID | None,
        search: str | None,
        status: str | None,
        date_from: date | None,
        date_to: date | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> EntityPage[IncomeViewRecord]:
        self._validate_filters(grant, branch_id, date_from, date_to)
        workspace = self._required_workspace(grant.workspace_id)
        return self._repository.list_incomes(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            search=self._normalize_optional_text(search),
            status=status,
            date_from=date_from,
            date_to=date_to,
            timezone=workspace.timezone,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )

    def get_manual_income(self, grant: PermissionGrant, income_id: UUID) -> FinanceManualIncome:
        income = self._repository.get_manual_income(
            grant.workspace_id, income_id, grant.allowed_branch_ids
        )
        if income is None:
            raise ResourceNotFoundError("El ingreso manual no existe.", "incomeId")
        return income

    def create_manual_income(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> FinanceManualIncome:
        branch_id = cast(UUID, values["branch_id"])
        self._require_branch(grant, branch_id)
        persistent = {
            "branch_id": branch_id,
            "category": values["category"],
            "amount": values["amount"],
            "income_date": values["date"],
            "customer": self._normalize_text(cast(str, values.get("customer", ""))),
            "source": self._normalize_required_text(cast(str, values["source"])),
            "payment_status": values["status"],
        }
        fingerprint = self._fingerprint(persistent)
        return self._create_idempotent(
            model=FinanceManualIncome,
            workspace_id=grant.workspace_id,
            idempotency_key=idempotency_key,
            fingerprint=fingerprint,
            branch_id=branch_id,
            factory=lambda entity_id: FinanceManualIncome(
                id=entity_id,
                workspace_id=grant.workspace_id,
                **persistent,
                creation_idempotency_key=idempotency_key,
                request_fingerprint=fingerprint,
                created_by_platform_user_id=principal.platform_user_id,
                updated_by_platform_user_id=principal.platform_user_id,
            ),
            principal=principal,
            action="finance.income.create",
            target_type="finance_manual_income",
        )

    def update_manual_income(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        income_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> FinanceManualIncome:
        income = self._required_for_update(
            lambda: self._repository.get_manual_income(
                grant.workspace_id, income_id, grant.allowed_branch_ids, for_update=True
            ),
            "El ingreso manual no existe.",
            "incomeId",
            expected_version,
        )
        branch_id = cast(UUID, changes.get("branch_id", income.branch_id))
        self._require_branch(grant, branch_id)
        mapping = {
            "category": "category",
            "branch_id": "branch_id",
            "amount": "amount",
            "date": "income_date",
            "customer": "customer",
            "source": "source",
            "status": "payment_status",
        }
        self._apply_changes(income, changes, mapping)
        if "customer" in changes:
            income.customer = self._normalize_text(income.customer)
        if "source" in changes:
            income.source = self._normalize_required_text(income.source)
        return self._finish_update(
            income,
            principal,
            "finance.income.update",
            "finance_manual_income",
        )

    def void_manual_income(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        income_id: UUID,
        expected_version: int,
    ) -> None:
        income = self._required_for_update(
            lambda: self._repository.get_manual_income(
                grant.workspace_id, income_id, grant.allowed_branch_ids, for_update=True
            ),
            "El ingreso manual no existe.",
            "incomeId",
            expected_version,
        )
        income.record_status = "voided"
        income.voided_at = datetime.now(UTC)
        income.voided_by_platform_user_id = principal.platform_user_id
        self._finish_update(
            income,
            principal,
            "finance.income.void",
            "finance_manual_income",
        )

    def liability_stats(
        self, grant: PermissionGrant, branch_id: UUID | None
    ) -> LiabilityStatsRecord:
        self._validate_filters(grant, branch_id)
        return self._repository.liability_stats(
            grant.workspace_id, grant.allowed_branch_ids, branch_id
        )

    def budget_stats(
        self, grant: PermissionGrant, branch_id: UUID | None, period: str | None
    ) -> BudgetStatsRecord:
        self._validate_filters(grant, branch_id)
        start, end, _, _ = self._month_bounds(grant.workspace_id, period)
        return self._repository.budget_stats(
            grant.workspace_id, grant.allowed_branch_ids, branch_id, start, end
        )

    def account_stats(self, grant: PermissionGrant, branch_id: UUID | None) -> AccountStatsRecord:
        self._validate_filters(grant, branch_id)
        return self._repository.account_stats(
            grant.workspace_id, grant.allowed_branch_ids, branch_id
        )

    def overview(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID | None,
        period: str | None,
        trend_months: int,
    ) -> dict[str, Any]:
        self._validate_filters(grant, branch_id)
        start, end, starts_at, ends_at = self._month_bounds(grant.workspace_id, period)
        workspace = self._required_workspace(grant.workspace_id)
        incomes = self._repository.income_total(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            date_start=start,
            date_end=end,
            starts_at=starts_at,
            ends_at=ends_at,
        )
        expenses = self._repository.expense_total(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            date_start=start,
            date_end=end,
            starts_at=starts_at,
            ends_at=ends_at,
        )
        liabilities = self._repository.liability_stats(
            grant.workspace_id, grant.allowed_branch_ids, branch_id
        )
        budgets = self._repository.budget_stats(
            grant.workspace_id, grant.allowed_branch_ids, branch_id, start, end
        )
        balance = incomes - expenses
        margin = (
            (balance / incomes * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if incomes
            else Decimal("0")
        )
        trend: list[dict[str, Any]] = []
        current = start
        periods: list[date] = []
        for _ in range(trend_months - 1):
            current = self._previous_month(current)
        for _ in range(trend_months):
            periods.append(current)
            current = self._next_month(current)
        labels = (
            "ene",
            "feb",
            "mar",
            "abr",
            "may",
            "jun",
            "jul",
            "ago",
            "sep",
            "oct",
            "nov",
            "dic",
        )
        zone = ZoneInfo(workspace.timezone)
        for month_start in periods:
            month_end = self._next_month(month_start)
            utc_start = datetime.combine(month_start, time.min, tzinfo=zone).astimezone(UTC)
            utc_end = datetime.combine(month_end, time.min, tzinfo=zone).astimezone(UTC)
            value = self._repository.income_total(
                workspace_id=grant.workspace_id,
                visible_branch_ids=grant.allowed_branch_ids,
                branch_id=branch_id,
                date_start=month_start,
                date_end=month_end,
                starts_at=utc_start,
                ends_at=utc_end,
            )
            trend.append(
                {
                    "period": month_start.strftime("%Y-%m"),
                    "label": labels[month_start.month - 1],
                    "value": value,
                }
            )
        return {
            "period": start.strftime("%Y-%m"),
            "branch_id": branch_id,
            "currency": workspace.default_currency,
            "incomes": incomes,
            "expenses": expenses,
            "balance": balance,
            "alerts": liabilities.cards + liabilities.loans + budgets.over_budget,
            "gross_profit_estimate": (incomes * Decimal("0.70")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            ),
            "net_margin_percent": margin,
            "trend": trend,
        }

    def _create_idempotent(
        self,
        *,
        model: type[EntityT],
        workspace_id: UUID,
        idempotency_key: str,
        fingerprint: str,
        branch_id: UUID,
        factory: Callable[[UUID], EntityT],
        principal: AuthPrincipal,
        action: str,
        target_type: str,
    ) -> EntityT:
        existing = self._repository.find_by_idempotency(model, workspace_id, idempotency_key)
        if existing is not None:
            if cast(Any, existing).request_fingerprint != fingerprint:
                raise ConflictError(
                    "Idempotency-Key ya fue usado con otro contenido.", "Idempotency-Key"
                )
            if cast(Any, existing).branch_id != branch_id:
                raise AuthorizationError("No tienes acceso a este recurso financiero.")
            return existing
        entity_id = uuid7()
        entity = factory(entity_id)
        self._repository.add(entity)
        self._add_audit(
            workspace_id=workspace_id,
            principal=principal,
            action=action,
            target_type=target_type,
            target_id=entity_id,
            details={"branchId": str(branch_id)},
        )
        try:
            self._repository.commit()
            return entity
        except IntegrityError as exc:
            self._repository.rollback()
            replay = self._repository.find_by_idempotency(model, workspace_id, idempotency_key)
            if replay is not None:
                if cast(Any, replay).request_fingerprint != fingerprint:
                    raise ConflictError(
                        "Idempotency-Key ya fue usado con otro contenido.",
                        "Idempotency-Key",
                    ) from exc
                return replay
            raise ConflictError("No se pudo guardar el recurso por un conflicto de datos.") from exc

    def _finish_update(
        self,
        entity: EntityT,
        principal: AuthPrincipal,
        action: str,
        target_type: str,
    ) -> EntityT:
        resource = cast(Any, entity)
        resource.version += 1
        resource.updated_by_platform_user_id = principal.platform_user_id
        self._add_audit(
            workspace_id=resource.workspace_id,
            principal=principal,
            action=action,
            target_type=target_type,
            target_id=resource.id,
            details={"version": resource.version},
        )
        self._commit_or_conflict("No se pudo actualizar el recurso financiero.")
        return entity

    def _required_for_update(
        self,
        loader: Callable[[], EntityT | None],
        message: str,
        parameter: str,
        expected_version: int,
    ) -> EntityT:
        entity = loader()
        if entity is None:
            raise ResourceNotFoundError(message, parameter)
        if cast(Any, entity).version != expected_version:
            raise ConflictError("El recurso cambió; vuelve a cargarlo antes de guardar.", "version")
        return entity

    def _commit_or_conflict(self, message: str) -> None:
        try:
            self._repository.commit()
        except IntegrityError as exc:
            self._repository.rollback()
            raise ConflictError(message) from exc

    def _add_audit(
        self,
        *,
        workspace_id: UUID,
        principal: AuthPrincipal,
        action: str,
        target_type: str,
        target_id: UUID,
        details: dict[str, Any],
    ) -> None:
        self._repository.add(
            AuditEntry(
                workspace_id=workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                outcome="success",
                request_id=get_request_id(),
                details=details,
            )
        )

    def _required_workspace(self, workspace_id: UUID) -> Any:
        workspace = self._repository.workspace(workspace_id)
        if workspace is None:
            raise ResourceNotFoundError("El espacio de trabajo no existe.", "workspaceId")
        return workspace

    def _require_branch(self, grant: PermissionGrant, branch_id: UUID) -> None:
        if grant.allowed_branch_ids is not None and branch_id not in grant.allowed_branch_ids:
            raise AuthorizationError("No tienes acceso a la sucursal seleccionada.")
        if not self._repository.branch_exists(grant.workspace_id, branch_id):
            raise ResourceNotFoundError("La sucursal no existe.", "branchId")

    def _validate_budget(
        self, grant: PermissionGrant, budget_id: UUID | None, branch_id: UUID
    ) -> None:
        if budget_id is None:
            return
        budget = self._repository.get_budget(
            grant.workspace_id, budget_id, grant.allowed_branch_ids
        )
        if budget is None:
            raise ResourceNotFoundError("El presupuesto no existe.", "budgetId")
        if budget.branch_id != branch_id:
            raise InvalidOperationError(
                "El presupuesto debe pertenecer a la misma sucursal.", "budgetId"
            )

    def _validate_filters(
        self,
        grant: PermissionGrant,
        branch_id: UUID | None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> None:
        if branch_id is not None:
            self._require_branch(grant, branch_id)
        if date_from is not None and date_to is not None and date_from > date_to:
            raise InvalidOperationError(
                "La fecha inicial no puede ser posterior a la final.", "dateTo"
            )

    @staticmethod
    def _validate_liability(values: dict[str, Any]) -> None:
        initial = Decimal(values["initial_amount"])
        pending = Decimal(values["pending_amount"])
        if pending > initial:
            raise InvalidOperationError(
                "El monto pendiente no puede superar el monto inicial.", "pendingAmount"
            )
        liability_type = values["type"]
        cut_day = values.get("cut_day")
        installment = values.get("installment")
        paid = int(values.get("paid_installments") or 0)
        total = values.get("total_installments")
        if liability_type == "tarjeta":
            if cut_day is None:
                raise InvalidOperationError("La tarjeta requiere día de corte.", "cutDay")
            if installment is not None or total is not None or paid:
                raise InvalidOperationError(
                    "Las tarjetas no usan cuotas de préstamo.", "installment"
                )
        elif cut_day is not None:
            raise InvalidOperationError("Los préstamos no usan día de corte.", "cutDay")
        if total is not None and paid > int(total):
            raise InvalidOperationError(
                "Las cuotas pagadas no pueden superar el total.", "paidInstallments"
            )

    def _month_bounds(
        self, workspace_id: UUID, period: str | None
    ) -> tuple[date, date, datetime, datetime]:
        workspace = self._required_workspace(workspace_id)
        zone = ZoneInfo(workspace.timezone)
        if period is None:
            local_today = datetime.now(zone).date()
            start = date(local_today.year, local_today.month, 1)
        else:
            try:
                parsed = datetime.strptime(period, "%Y-%m").date()
            except ValueError as exc:
                raise InvalidOperationError(
                    "El período debe tener formato YYYY-MM.", "period"
                ) from exc
            start = date(parsed.year, parsed.month, 1)
        end = self._next_month(start)
        starts_at = datetime.combine(start, time.min, tzinfo=zone).astimezone(UTC)
        ends_at = datetime.combine(end, time.min, tzinfo=zone).astimezone(UTC)
        return start, end, starts_at, ends_at

    @staticmethod
    def _next_month(value: date) -> date:
        next_month = 1 if value.month == 12 else value.month + 1
        return date(value.year + (value.month == 12), next_month, 1)

    @staticmethod
    def _previous_month(value: date) -> date:
        return date(value.year - (value.month == 1), 12 if value.month == 1 else value.month - 1, 1)

    @staticmethod
    def _apply_changes(entity: object, changes: dict[str, Any], mapping: dict[str, str]) -> None:
        for public_name, internal_name in mapping.items():
            if public_name in changes:
                setattr(entity, internal_name, changes[public_name])

    @staticmethod
    def _fingerprint(values: dict[str, Any]) -> str:
        canonical = json.dumps(
            values,
            default=str,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @staticmethod
    def _normalize_required_text(value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise InvalidOperationError("El texto no puede estar vacío.")
        return normalized

    @staticmethod
    def _normalize_text(value: str) -> str:
        return " ".join(value.split())

    @staticmethod
    def _normalize_optional_text(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        return normalized or None

    @staticmethod
    def _mask_account_number(value: str) -> str:
        normalized = "".join(character for character in value if character.isalnum())
        if not normalized:
            return ""
        return f"****{normalized[-4:]}"


def page_count(total_items: int, page_size: int) -> int:
    return (total_items + page_size - 1) // page_size if total_items else 0
