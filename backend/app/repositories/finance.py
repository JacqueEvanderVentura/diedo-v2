from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, TypeVar
from typing import cast as typing_cast
from uuid import UUID

from sqlalchemy import (
    Date,
    Integer,
    Uuid,
    case,
    cast,
    exists,
    func,
    literal,
    or_,
    select,
    union_all,
)
from sqlalchemy.orm import Session, aliased

from app.db.models import (
    Branch,
    CashMovement,
    FinanceAccount,
    FinanceBudget,
    FinanceExpense,
    FinanceFixedExpense,
    FinanceFixedExpensePayment,
    FinanceLiability,
    FinanceManualIncome,
    Sale,
    Workspace,
)

EntityT = TypeVar("EntityT")


@dataclass(frozen=True)
class EntityPage[EntityT]:
    items: tuple[EntityT, ...]
    total_items: int


@dataclass(frozen=True)
class ExpenseViewRecord:
    id: UUID
    concept: str
    amount: Decimal
    category: str
    date: date
    branch_id: UUID
    status: str
    budget_id: UUID | None
    source: str
    editable: bool
    version: int | None
    created_at: datetime | None
    updated_at: datetime | None


@dataclass(frozen=True)
class FixedExpenseRecord:
    expense: FinanceFixedExpense
    payments: tuple[FinanceFixedExpensePayment, ...]


@dataclass(frozen=True)
class BudgetRecord:
    budget: FinanceBudget
    transactions: tuple[FinanceExpense, ...]
    spent: Decimal


@dataclass(frozen=True)
class IncomeViewRecord:
    id: UUID
    date: date
    customer: str
    category: str
    branch_id: UUID
    status: str
    amount: Decimal
    source: str
    reference: str | None
    editable: bool
    version: int | None
    created_at: datetime | None
    updated_at: datetime | None


@dataclass(frozen=True)
class LiabilityStatsRecord:
    total_debt: Decimal
    cards: int
    loans: int


@dataclass(frozen=True)
class BudgetStatsRecord:
    total_budget: Decimal
    spent: Decimal
    remaining: Decimal
    over_budget: int


@dataclass(frozen=True)
class AccountStatsRecord:
    total: Decimal
    bank: Decimal
    investment: Decimal
    shareholders: Decimal


class FinanceRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def workspace(self, workspace_id: UUID) -> Workspace | None:
        return self._session.scalar(
            select(Workspace).where(Workspace.id == workspace_id, Workspace.status == "active")
        )

    def branch_exists(self, workspace_id: UUID, branch_id: UUID) -> bool:
        return bool(
            self._session.scalar(
                select(Branch.id).where(
                    Branch.workspace_id == workspace_id,
                    Branch.id == branch_id,
                    Branch.status == "active",
                )
            )
        )

    @staticmethod
    def _branch_predicate(
        column: Any,
        *,
        branch_id: UUID | None,
        visible_branch_ids: frozenset[UUID] | None,
    ) -> Any | None:
        if branch_id is not None:
            return column == branch_id
        if visible_branch_ids is not None:
            return column.in_(visible_branch_ids)
        return None

    @staticmethod
    def _order(column: Any, direction: str) -> Any:
        return column.desc() if direction == "desc" else column.asc()

    def list_expenses(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        search: str | None,
        status: str | None,
        date_from: date | None,
        date_to: date | None,
        timezone: str,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> EntityPage[ExpenseViewRecord]:
        manual_conditions: list[Any] = [
            FinanceExpense.workspace_id == workspace_id,
            FinanceExpense.record_status == "active",
        ]
        cash_conditions: list[Any] = [
            CashMovement.workspace_id == workspace_id,
            CashMovement.movement_type == "expense",
        ]
        manual_branch = self._branch_predicate(
            FinanceExpense.branch_id,
            branch_id=branch_id,
            visible_branch_ids=visible_branch_ids,
        )
        cash_branch = self._branch_predicate(
            CashMovement.branch_id,
            branch_id=branch_id,
            visible_branch_ids=visible_branch_ids,
        )
        if manual_branch is not None:
            manual_conditions.append(manual_branch)
        if cash_branch is not None:
            cash_conditions.append(cash_branch)
        reversal = aliased(CashMovement)
        cash_conditions.append(
            ~exists(
                select(reversal.id).where(
                    reversal.workspace_id == CashMovement.workspace_id,
                    reversal.reversal_of_movement_id == CashMovement.id,
                )
            )
        )
        local_cash_date = cast(func.timezone(timezone, CashMovement.created_at), Date)
        manual = select(
            FinanceExpense.id.label("id"),
            FinanceExpense.concept.label("concept"),
            FinanceExpense.amount.label("amount"),
            FinanceExpense.category.label("category"),
            FinanceExpense.expense_date.label("date"),
            FinanceExpense.branch_id.label("branch_id"),
            FinanceExpense.payment_status.label("status"),
            FinanceExpense.budget_id.label("budget_id"),
            literal("finanzas").label("source"),
            literal(True).label("editable"),
            FinanceExpense.version.label("version"),
            FinanceExpense.created_at.label("created_at"),
            FinanceExpense.updated_at.label("updated_at"),
        ).where(*manual_conditions)
        cash = select(
            CashMovement.id.label("id"),
            CashMovement.concept.label("concept"),
            CashMovement.amount.label("amount"),
            literal("otros").label("category"),
            local_cash_date.label("date"),
            CashMovement.branch_id.label("branch_id"),
            literal("pagado").label("status"),
            cast(literal(None), Uuid()).label("budget_id"),
            literal("caja").label("source"),
            literal(False).label("editable"),
            cast(literal(None), Integer).label("version"),
            CashMovement.created_at.label("created_at"),
            CashMovement.created_at.label("updated_at"),
        ).where(*cash_conditions)
        rows = union_all(manual, cash).subquery("finance_expense_rows")
        predicates: list[Any] = []
        if search:
            pattern = f"%{search.casefold()}%"
            predicates.append(
                or_(
                    func.lower(rows.c.concept).like(pattern),
                    func.lower(rows.c.category).like(pattern),
                )
            )
        if status is not None:
            predicates.append(rows.c.status == status)
        if date_from is not None:
            predicates.append(rows.c.date >= date_from)
        if date_to is not None:
            predicates.append(rows.c.date <= date_to)
        total = self._session.scalar(select(func.count()).select_from(rows).where(*predicates)) or 0
        order_fields = {
            "date": rows.c.date,
            "category": rows.c.category,
            "concept": rows.c.concept,
            "amount": rows.c.amount,
            "status": rows.c.status,
        }
        selected = self._session.execute(
            select(rows)
            .where(*predicates)
            .order_by(
                self._order(order_fields[sort_by], sort_direction),
                rows.c.id,
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return EntityPage(
            items=tuple(ExpenseViewRecord(**dict(row._mapping)) for row in selected),
            total_items=int(total),
        )

    def list_fixed_expenses(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        search: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> EntityPage[FixedExpenseRecord]:
        predicates: list[Any] = [
            FinanceFixedExpense.workspace_id == workspace_id,
            FinanceFixedExpense.status == "active",
        ]
        branch = self._branch_predicate(
            FinanceFixedExpense.branch_id,
            branch_id=branch_id,
            visible_branch_ids=visible_branch_ids,
        )
        if branch is not None:
            predicates.append(branch)
        if search:
            pattern = f"%{search.casefold()}%"
            predicates.append(
                or_(
                    func.lower(FinanceFixedExpense.concept).like(pattern),
                    func.lower(FinanceFixedExpense.category).like(pattern),
                )
            )
        total = (
            self._session.scalar(select(func.count(FinanceFixedExpense.id)).where(*predicates)) or 0
        )
        order_fields = {
            "dayOfMonth": FinanceFixedExpense.day_of_month,
            "concept": func.lower(FinanceFixedExpense.concept),
            "category": FinanceFixedExpense.category,
            "amount": FinanceFixedExpense.amount,
            "createdAt": FinanceFixedExpense.created_at,
        }
        expenses = tuple(
            self._session.scalars(
                select(FinanceFixedExpense)
                .where(*predicates)
                .order_by(
                    self._order(order_fields[sort_by], sort_direction),
                    FinanceFixedExpense.id,
                )
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        payments_by_expense: dict[UUID, list[FinanceFixedExpensePayment]] = defaultdict(list)
        if expenses:
            payments = self._session.scalars(
                select(FinanceFixedExpensePayment)
                .where(
                    FinanceFixedExpensePayment.workspace_id == workspace_id,
                    FinanceFixedExpensePayment.fixed_expense_id.in_([item.id for item in expenses]),
                )
                .order_by(FinanceFixedExpensePayment.period.desc())
            )
            for payment in payments:
                payments_by_expense[payment.fixed_expense_id].append(payment)
        return EntityPage(
            items=tuple(
                FixedExpenseRecord(item, tuple(payments_by_expense[item.id])) for item in expenses
            ),
            total_items=int(total),
        )

    def list_liabilities(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        search: str | None,
        liability_type: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> EntityPage[FinanceLiability]:
        predicates: list[Any] = [
            FinanceLiability.workspace_id == workspace_id,
            FinanceLiability.status == "active",
        ]
        branch = self._branch_predicate(
            FinanceLiability.branch_id,
            branch_id=branch_id,
            visible_branch_ids=visible_branch_ids,
        )
        if branch is not None:
            predicates.append(branch)
        if search:
            pattern = f"%{search.casefold()}%"
            predicates.append(
                or_(
                    func.lower(FinanceLiability.name).like(pattern),
                    func.lower(FinanceLiability.liability_type).like(pattern),
                )
            )
        if liability_type:
            predicates.append(FinanceLiability.liability_type == liability_type)
        order_fields = {
            "name": func.lower(FinanceLiability.name),
            "type": FinanceLiability.liability_type,
            "initialAmount": FinanceLiability.initial_amount,
            "pendingAmount": FinanceLiability.pending_amount,
            "createdAt": FinanceLiability.created_at,
        }
        return self._entity_page(
            FinanceLiability,
            predicates,
            order_fields[sort_by],
            sort_direction,
            page,
            page_size,
        )

    def list_budgets(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        search: str | None,
        budget_group: str | None,
        period_start: date,
        period_end: date,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> EntityPage[BudgetRecord]:
        predicates: list[Any] = [
            FinanceBudget.workspace_id == workspace_id,
            FinanceBudget.status == "active",
        ]
        branch = self._branch_predicate(
            FinanceBudget.branch_id,
            branch_id=branch_id,
            visible_branch_ids=visible_branch_ids,
        )
        if branch is not None:
            predicates.append(branch)
        if search:
            predicates.append(func.lower(FinanceBudget.name).like(f"%{search.casefold()}%"))
        if budget_group:
            predicates.append(FinanceBudget.budget_group == budget_group)
        total = self._session.scalar(select(func.count(FinanceBudget.id)).where(*predicates)) or 0
        order_fields = {
            "name": func.lower(FinanceBudget.name),
            "group": FinanceBudget.budget_group,
            "monthlyLimit": FinanceBudget.monthly_limit,
            "createdAt": FinanceBudget.created_at,
        }
        budgets = tuple(
            self._session.scalars(
                select(FinanceBudget)
                .where(*predicates)
                .order_by(self._order(order_fields[sort_by], sort_direction), FinanceBudget.id)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        transactions_by_budget: dict[UUID, list[FinanceExpense]] = defaultdict(list)
        if budgets:
            transactions = self._session.scalars(
                select(FinanceExpense)
                .where(
                    FinanceExpense.workspace_id == workspace_id,
                    FinanceExpense.budget_id.in_([budget.id for budget in budgets]),
                    FinanceExpense.record_status == "active",
                    FinanceExpense.expense_date >= period_start,
                    FinanceExpense.expense_date < period_end,
                )
                .order_by(FinanceExpense.expense_date.desc(), FinanceExpense.id)
            )
            for expense in transactions:
                if expense.budget_id is not None:
                    transactions_by_budget[expense.budget_id].append(expense)
        return EntityPage(
            items=tuple(
                BudgetRecord(
                    budget=budget,
                    transactions=tuple(transactions_by_budget[budget.id]),
                    spent=sum(
                        (item.amount for item in transactions_by_budget[budget.id]),
                        Decimal("0"),
                    ),
                )
                for budget in budgets
            ),
            total_items=int(total),
        )

    def list_accounts(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        search: str | None,
        account_type: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> EntityPage[FinanceAccount]:
        predicates: list[Any] = [
            FinanceAccount.workspace_id == workspace_id,
            FinanceAccount.status == "active",
        ]
        branch = self._branch_predicate(
            FinanceAccount.branch_id,
            branch_id=branch_id,
            visible_branch_ids=visible_branch_ids,
        )
        if branch is not None:
            predicates.append(branch)
        if search:
            pattern = f"%{search.casefold()}%"
            predicates.append(
                or_(
                    func.lower(FinanceAccount.name).like(pattern),
                    func.lower(FinanceAccount.bank).like(pattern),
                )
            )
        if account_type:
            predicates.append(FinanceAccount.account_type == account_type)
        order_fields = {
            "name": func.lower(FinanceAccount.name),
            "type": FinanceAccount.account_type,
            "bank": func.lower(FinanceAccount.bank),
            "balance": FinanceAccount.balance,
            "createdAt": FinanceAccount.created_at,
        }
        return self._entity_page(
            FinanceAccount,
            predicates,
            order_fields[sort_by],
            sort_direction,
            page,
            page_size,
        )

    def list_incomes(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        search: str | None,
        status: str | None,
        date_from: date | None,
        date_to: date | None,
        timezone: str,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> EntityPage[IncomeViewRecord]:
        manual_conditions: list[Any] = [
            FinanceManualIncome.workspace_id == workspace_id,
            FinanceManualIncome.record_status == "active",
        ]
        sale_conditions: list[Any] = [
            Sale.workspace_id == workspace_id,
            Sale.status == "completed",
        ]
        manual_branch = self._branch_predicate(
            FinanceManualIncome.branch_id,
            branch_id=branch_id,
            visible_branch_ids=visible_branch_ids,
        )
        sale_branch = self._branch_predicate(
            Sale.branch_id, branch_id=branch_id, visible_branch_ids=visible_branch_ids
        )
        if manual_branch is not None:
            manual_conditions.append(manual_branch)
        if sale_branch is not None:
            sale_conditions.append(sale_branch)
        local_sale_date = cast(func.timezone(timezone, Sale.completed_at), Date)
        manual = select(
            FinanceManualIncome.id.label("id"),
            FinanceManualIncome.income_date.label("date"),
            FinanceManualIncome.customer.label("customer"),
            FinanceManualIncome.category.label("category"),
            FinanceManualIncome.branch_id.label("branch_id"),
            FinanceManualIncome.payment_status.label("status"),
            FinanceManualIncome.amount.label("amount"),
            FinanceManualIncome.source.label("source"),
            cast(literal(None), FinanceManualIncome.source.type).label("reference"),
            literal(True).label("editable"),
            FinanceManualIncome.version.label("version"),
            FinanceManualIncome.created_at.label("created_at"),
            FinanceManualIncome.updated_at.label("updated_at"),
        ).where(*manual_conditions)
        sales = select(
            Sale.id.label("id"),
            local_sale_date.label("date"),
            func.coalesce(Sale.customer_name, "Cliente Mostrador").label("customer"),
            Sale.payment_method_code.label("category"),
            Sale.branch_id.label("branch_id"),
            case((Sale.settlement_policy == "immediate", "pagado"), else_="pendiente").label(
                "status"
            ),
            Sale.total.label("amount"),
            literal("POS").label("source"),
            Sale.sale_number.label("reference"),
            literal(False).label("editable"),
            cast(literal(None), Integer).label("version"),
            Sale.completed_at.label("created_at"),
            Sale.completed_at.label("updated_at"),
        ).where(*sale_conditions)
        rows = union_all(manual, sales).subquery("finance_income_rows")
        predicates: list[Any] = []
        if search:
            pattern = f"%{search.casefold()}%"
            predicates.append(
                or_(
                    func.lower(rows.c.customer).like(pattern),
                    func.lower(rows.c.category).like(pattern),
                    func.lower(func.coalesce(rows.c.reference, "")).like(pattern),
                )
            )
        if status is not None:
            predicates.append(rows.c.status == status)
        if date_from is not None:
            predicates.append(rows.c.date >= date_from)
        if date_to is not None:
            predicates.append(rows.c.date <= date_to)
        total = self._session.scalar(select(func.count()).select_from(rows).where(*predicates)) or 0
        order_fields = {
            "date": rows.c.date,
            "customer": rows.c.customer,
            "category": rows.c.category,
            "amount": rows.c.amount,
            "status": rows.c.status,
        }
        selected = self._session.execute(
            select(rows)
            .where(*predicates)
            .order_by(self._order(order_fields[sort_by], sort_direction), rows.c.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return EntityPage(
            items=tuple(IncomeViewRecord(**dict(row._mapping)) for row in selected),
            total_items=int(total),
        )

    def liability_stats(
        self,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> LiabilityStatsRecord:
        predicates: list[Any] = [
            FinanceLiability.workspace_id == workspace_id,
            FinanceLiability.status == "active",
        ]
        branch = self._branch_predicate(
            FinanceLiability.branch_id,
            branch_id=branch_id,
            visible_branch_ids=visible_branch_ids,
        )
        if branch is not None:
            predicates.append(branch)
        row = self._session.execute(
            select(
                func.coalesce(func.sum(FinanceLiability.pending_amount), 0),
                func.count(FinanceLiability.id).filter(
                    FinanceLiability.liability_type == "tarjeta"
                ),
                func.count(FinanceLiability.id).filter(
                    FinanceLiability.liability_type == "prestamo"
                ),
            ).where(*predicates)
        ).one()
        return LiabilityStatsRecord(Decimal(row[0]), int(row[1]), int(row[2]))

    def budget_stats(
        self,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        period_start: date,
        period_end: date,
    ) -> BudgetStatsRecord:
        page = self.list_budgets(
            workspace_id=workspace_id,
            visible_branch_ids=visible_branch_ids,
            branch_id=branch_id,
            search=None,
            budget_group=None,
            period_start=period_start,
            period_end=period_end,
            page=1,
            page_size=10_000,
            sort_by="name",
            sort_direction="asc",
        )
        total_budget = sum((item.budget.monthly_limit for item in page.items), Decimal("0"))
        spent = sum((item.spent for item in page.items), Decimal("0"))
        return BudgetStatsRecord(
            total_budget=total_budget,
            spent=spent,
            remaining=total_budget - spent,
            over_budget=sum(1 for item in page.items if item.spent > item.budget.monthly_limit),
        )

    def account_stats(
        self,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> AccountStatsRecord:
        predicates: list[Any] = [
            FinanceAccount.workspace_id == workspace_id,
            FinanceAccount.status == "active",
        ]
        branch = self._branch_predicate(
            FinanceAccount.branch_id,
            branch_id=branch_id,
            visible_branch_ids=visible_branch_ids,
        )
        if branch is not None:
            predicates.append(branch)
        row = self._session.execute(
            select(
                func.coalesce(func.sum(FinanceAccount.balance), 0),
                func.coalesce(
                    func.sum(
                        case(
                            (FinanceAccount.account_type == "banco", FinanceAccount.balance),
                            else_=0,
                        )
                    ),
                    0,
                ),
                func.coalesce(
                    func.sum(
                        case(
                            (FinanceAccount.account_type == "inversion", FinanceAccount.balance),
                            else_=0,
                        )
                    ),
                    0,
                ),
                func.coalesce(
                    func.sum(
                        case(
                            (FinanceAccount.account_type == "accionistas", FinanceAccount.balance),
                            else_=0,
                        )
                    ),
                    0,
                ),
            ).where(*predicates)
        ).one()
        return AccountStatsRecord(*(Decimal(value) for value in row))

    def income_total(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        date_start: date,
        date_end: date,
        starts_at: datetime,
        ends_at: datetime,
    ) -> Decimal:
        manual_predicates: list[Any] = [
            FinanceManualIncome.workspace_id == workspace_id,
            FinanceManualIncome.record_status == "active",
            FinanceManualIncome.income_date >= date_start,
            FinanceManualIncome.income_date < date_end,
        ]
        sale_predicates: list[Any] = [
            Sale.workspace_id == workspace_id,
            Sale.status == "completed",
            Sale.completed_at >= starts_at,
            Sale.completed_at < ends_at,
        ]
        manual_branch = self._branch_predicate(
            FinanceManualIncome.branch_id,
            branch_id=branch_id,
            visible_branch_ids=visible_branch_ids,
        )
        sale_branch = self._branch_predicate(
            Sale.branch_id, branch_id=branch_id, visible_branch_ids=visible_branch_ids
        )
        if manual_branch is not None:
            manual_predicates.append(manual_branch)
        if sale_branch is not None:
            sale_predicates.append(sale_branch)
        manual = self._session.scalar(
            select(func.coalesce(func.sum(FinanceManualIncome.amount), 0)).where(*manual_predicates)
        ) or Decimal("0")
        sales = self._session.scalar(
            select(func.coalesce(func.sum(Sale.total), 0)).where(*sale_predicates)
        ) or Decimal("0")
        return Decimal(manual) + Decimal(sales)

    def expense_total(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        date_start: date,
        date_end: date,
        starts_at: datetime,
        ends_at: datetime,
    ) -> Decimal:
        manual_predicates: list[Any] = [
            FinanceExpense.workspace_id == workspace_id,
            FinanceExpense.record_status == "active",
            FinanceExpense.expense_date >= date_start,
            FinanceExpense.expense_date < date_end,
        ]
        cash_predicates: list[Any] = [
            CashMovement.workspace_id == workspace_id,
            CashMovement.movement_type == "expense",
            CashMovement.created_at >= starts_at,
            CashMovement.created_at < ends_at,
        ]
        fixed_predicates: list[Any] = [
            FinanceFixedExpense.workspace_id == workspace_id,
            FinanceFixedExpense.status == "active",
        ]
        for column, predicates in (
            (FinanceExpense.branch_id, manual_predicates),
            (CashMovement.branch_id, cash_predicates),
            (FinanceFixedExpense.branch_id, fixed_predicates),
        ):
            branch = self._branch_predicate(
                column, branch_id=branch_id, visible_branch_ids=visible_branch_ids
            )
            if branch is not None:
                predicates.append(branch)
        reversal = aliased(CashMovement)
        cash_predicates.append(
            ~exists(
                select(reversal.id).where(
                    reversal.workspace_id == CashMovement.workspace_id,
                    reversal.reversal_of_movement_id == CashMovement.id,
                )
            )
        )
        manual = self._session.scalar(
            select(func.coalesce(func.sum(FinanceExpense.amount), 0)).where(*manual_predicates)
        ) or Decimal("0")
        cash = self._session.scalar(
            select(func.coalesce(func.sum(CashMovement.amount), 0)).where(*cash_predicates)
        ) or Decimal("0")
        fixed = self._session.scalar(
            select(func.coalesce(func.sum(FinanceFixedExpense.amount), 0)).where(*fixed_predicates)
        ) or Decimal("0")
        return Decimal(manual) + Decimal(cash) + Decimal(fixed)

    def get_expense(
        self,
        workspace_id: UUID,
        expense_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        *,
        for_update: bool = False,
    ) -> FinanceExpense | None:
        return self._get_active(
            FinanceExpense,
            workspace_id,
            expense_id,
            visible_branch_ids,
            FinanceExpense.record_status == "active",
            for_update,
        )

    def get_fixed_expense(
        self,
        workspace_id: UUID,
        expense_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        *,
        for_update: bool = False,
    ) -> FinanceFixedExpense | None:
        return self._get_active(
            FinanceFixedExpense,
            workspace_id,
            expense_id,
            visible_branch_ids,
            FinanceFixedExpense.status == "active",
            for_update,
        )

    def fixed_expense_record(
        self,
        workspace_id: UUID,
        expense_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
    ) -> FixedExpenseRecord | None:
        expense = self.get_fixed_expense(workspace_id, expense_id, visible_branch_ids)
        if expense is None:
            return None
        payments = tuple(
            self._session.scalars(
                select(FinanceFixedExpensePayment)
                .where(
                    FinanceFixedExpensePayment.workspace_id == workspace_id,
                    FinanceFixedExpensePayment.fixed_expense_id == expense_id,
                )
                .order_by(FinanceFixedExpensePayment.period.desc())
            )
        )
        return FixedExpenseRecord(expense, payments)

    def get_liability(
        self,
        workspace_id: UUID,
        liability_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        *,
        for_update: bool = False,
    ) -> FinanceLiability | None:
        return self._get_active(
            FinanceLiability,
            workspace_id,
            liability_id,
            visible_branch_ids,
            FinanceLiability.status == "active",
            for_update,
        )

    def get_budget(
        self,
        workspace_id: UUID,
        budget_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        *,
        for_update: bool = False,
    ) -> FinanceBudget | None:
        return self._get_active(
            FinanceBudget,
            workspace_id,
            budget_id,
            visible_branch_ids,
            FinanceBudget.status == "active",
            for_update,
        )

    def budget_record(
        self,
        workspace_id: UUID,
        budget_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        period_start: date,
        period_end: date,
    ) -> BudgetRecord | None:
        budget = self.get_budget(workspace_id, budget_id, visible_branch_ids)
        if budget is None:
            return None
        transactions = tuple(
            self._session.scalars(
                select(FinanceExpense)
                .where(
                    FinanceExpense.workspace_id == workspace_id,
                    FinanceExpense.budget_id == budget_id,
                    FinanceExpense.record_status == "active",
                    FinanceExpense.expense_date >= period_start,
                    FinanceExpense.expense_date < period_end,
                )
                .order_by(FinanceExpense.expense_date.desc())
            )
        )
        return BudgetRecord(
            budget,
            transactions,
            sum((item.amount for item in transactions), Decimal("0")),
        )

    def get_account(
        self,
        workspace_id: UUID,
        account_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        *,
        for_update: bool = False,
    ) -> FinanceAccount | None:
        return self._get_active(
            FinanceAccount,
            workspace_id,
            account_id,
            visible_branch_ids,
            FinanceAccount.status == "active",
            for_update,
        )

    def get_manual_income(
        self,
        workspace_id: UUID,
        income_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        *,
        for_update: bool = False,
    ) -> FinanceManualIncome | None:
        return self._get_active(
            FinanceManualIncome,
            workspace_id,
            income_id,
            visible_branch_ids,
            FinanceManualIncome.record_status == "active",
            for_update,
        )

    def find_by_idempotency(
        self, model: type[EntityT], workspace_id: UUID, key: str
    ) -> EntityT | None:
        model_columns = typing_cast(Any, model)
        key_column = (
            FinanceFixedExpensePayment.idempotency_key
            if model is FinanceFixedExpensePayment
            else getattr(model, "creation_idempotency_key")
        )
        return self._session.scalar(
            select(model).where(model_columns.workspace_id == workspace_id, key_column == key)
        )

    def fixed_payment_for_period(
        self, workspace_id: UUID, fixed_expense_id: UUID, period: date
    ) -> FinanceFixedExpensePayment | None:
        return self._session.scalar(
            select(FinanceFixedExpensePayment).where(
                FinanceFixedExpensePayment.workspace_id == workspace_id,
                FinanceFixedExpensePayment.fixed_expense_id == fixed_expense_id,
                FinanceFixedExpensePayment.period == period,
            )
        )

    def add(self, entity: object) -> None:
        self._session.add(entity)

    def flush(self) -> None:
        self._session.flush()

    def commit(self) -> None:
        self._session.commit()

    def rollback(self) -> None:
        self._session.rollback()

    def _entity_page(
        self,
        model: type[EntityT],
        predicates: list[Any],
        order_field: Any,
        sort_direction: str,
        page: int,
        page_size: int,
    ) -> EntityPage[EntityT]:
        model_columns = typing_cast(Any, model)
        total = self._session.scalar(select(func.count(model_columns.id)).where(*predicates)) or 0
        items = tuple(
            self._session.scalars(
                select(model)
                .where(*predicates)
                .order_by(self._order(order_field, sort_direction), model_columns.id)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return EntityPage(items, int(total))

    def _get_active(
        self,
        model: type[EntityT],
        workspace_id: UUID,
        entity_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        active_predicate: Any,
        for_update: bool,
    ) -> EntityT | None:
        model_columns = typing_cast(Any, model)
        predicates: list[Any] = [
            model_columns.workspace_id == workspace_id,
            model_columns.id == entity_id,
            active_predicate,
        ]
        if visible_branch_ids is not None:
            predicates.append(model_columns.branch_id.in_(visible_branch_ids))
        statement = select(model).where(*predicates)
        if for_update:
            statement = statement.with_for_update()
        return self._session.scalar(statement)
