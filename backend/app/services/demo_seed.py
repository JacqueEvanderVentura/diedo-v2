from __future__ import annotations

import base64
import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any, cast
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import (
    AccessScope,
    Appointment,
    AppointmentEvent,
    AppointmentResource,
    Asset,
    AssetCategory,
    Branch,
    CrmActivity,
    CrmLead,
    CrmOpportunity,
    CrmSettings,
    Customer,
    CustomerBranchAssignment,
    CustomerCrmProfile,
    DemoSeedRegistry,
    Employee,
    EmployeeBranchAssignment,
    EmployeeDebt,
    EmployeeDebtPayment,
    EmployeeHrProfile,
    EmployeeSchedule,
    EmployeeSupervisor,
    FinanceAccount,
    FinanceBudget,
    FinanceExpense,
    FinanceFixedExpense,
    FinanceFixedExpensePayment,
    FinanceLiability,
    FinanceManualIncome,
    HrDocumentRecord,
    HrLeaveRequest,
    Incident,
    IncidentActivity,
    IncidentAttachment,
    IncidentCounter,
    IncidentParticipant,
    InventoryItemProfile,
    InventoryMovement,
    InventoryMovementLine,
    InventoryStockBalance,
    InventoryWarehouse,
    Item,
    ItemBranchAssignment,
    ItemCategory,
    PaymentMethod,
    Permission,
    PlatformUser,
    PurchaseRequest,
    PurchaseRequestItem,
    PurchasingSettings,
    Role,
    RoleAssignment,
    RolePermission,
    Supplier,
    SupplierBranchAssignment,
    Task,
    UnitOfMeasure,
    WorkspaceMembership,
)
from app.db.models.agenda import DEFAULT_APPOINTMENT_RESOURCES
from app.services.crm_scoring import DEFAULT_SCORING_WEIGHTS, compute_auto_score
from app.services.demo_manifest import (
    DemoBundle,
    DemoEmployeeFixture,
    DemoInventoryItemProfileFixture,
    load_demo_bundle,
)
from app.services.demo_pos_seed import seed_pos_demo_data
from app.services.demo_seed_registry import (
    checksum_payload as _checksum,
)
from app.services.demo_seed_registry import (
    register_entity as _register,
)
from app.services.demo_seed_registry import (
    registered_entity as _registered_entity,
)
from app.services.demo_seed_registry import (
    stable_demo_id as _stable_id,
)
from app.services.local_bootstrap import bootstrap_local_foundation


@dataclass(frozen=True)
class DemoSeedSummary:
    enabled: bool
    seed_version: str
    workspace_id: UUID | None
    branch_count: int
    demo_user_count: int
    payment_method_count: int
    customer_count: int = 0
    crm_profile_count: int = 0
    crm_lead_count: int = 0
    crm_opportunity_count: int = 0
    crm_activity_count: int = 0
    employee_count: int = 0
    leave_request_count: int = 0
    debt_count: int = 0
    document_count: int = 0
    catalog_category_count: int = 0
    catalog_item_count: int = 0
    catalog_assignment_count: int = 0
    inventory_warehouse_count: int = 0
    inventory_profile_count: int = 0
    inventory_stock_balance_count: int = 0
    inventory_asset_count: int = 0
    inventory_movement_count: int = 0
    purchasing_supplier_count: int = 0
    purchase_request_count: int = 0
    incident_count: int = 0
    incident_attachment_count: int = 0
    pos_register_count: int = 0
    pos_quote_count: int = 0
    pos_sale_count: int = 0
    pos_receivable_count: int = 0
    pos_payment_count: int = 0
    pos_cash_movement_count: int = 0
    pos_inventory_movement_count: int = 0
    appointment_count: int = 0
    dashboard_task_count: int = 0
    finance_budget_count: int = 0
    finance_expense_count: int = 0
    finance_fixed_expense_count: int = 0
    finance_fixed_payment_count: int = 0
    finance_liability_count: int = 0
    finance_account_count: int = 0
    finance_income_count: int = 0


def seed_demo_data(
    session: Session,
    password_hash: str | None,
    *,
    enabled: bool | None = None,
    production_authorized: bool = False,
) -> DemoSeedSummary:
    should_seed = settings.demo_seed_enabled if enabled is None else enabled
    bundle = load_demo_bundle()
    if not should_seed:
        return DemoSeedSummary(
            enabled=False,
            seed_version=bundle.manifest.seed_version,
            workspace_id=None,
            branch_count=0,
            demo_user_count=0,
            payment_method_count=0,
        )
    environment_allowed = settings.app_env in {"development", "test"} or (
        settings.app_env == "production" and production_authorized
    )
    if not environment_allowed:
        raise RuntimeError("Demo seeding is disabled outside development and test.")
    if password_hash is None:
        raise RuntimeError("A local demo password is required when demo seeding is enabled.")

    foundation = bootstrap_local_foundation(session, password_hash)
    _seed_role_permissions(session, bundle, foundation.workspace_id)
    branches = _seed_branches(
        session,
        bundle,
        foundation.workspace_id,
        foundation.legal_entity_id,
    )
    _seed_users(session, bundle, foundation.workspace_id, branches, password_hash)
    _seed_purchasing(session, bundle, foundation.workspace_id, branches)
    _seed_payment_methods(session, bundle, foundation.workspace_id)
    catalog_assignment_count = _seed_catalog(
        session,
        bundle,
        foundation.workspace_id,
        branches,
    )
    inventory_counts = _seed_inventory(
        session,
        bundle,
        foundation.workspace_id,
        branches,
    )
    _seed_employees(session, bundle, foundation.workspace_id, branches)
    incident_counts = _seed_incidents(
        session,
        bundle,
        foundation.workspace_id,
        branches,
    )
    _seed_customers(session, bundle, foundation.workspace_id, branches)
    crm_counts = _seed_crm(session, bundle, foundation.workspace_id, branches)
    appointment_count = _seed_agenda(
        session,
        bundle,
        foundation.workspace_id,
        branches,
    )
    usage_movement_count = _seed_inventory_usage_movements(
        session,
        bundle,
        foundation.workspace_id,
        branches,
    )
    dashboard_task_count = _seed_dashboard_tasks(
        session,
        bundle,
        foundation.workspace_id,
        branches,
    )
    _seed_hr(session, bundle, foundation.workspace_id)
    pos_counts = seed_pos_demo_data(
        session,
        bundle,
        foundation.workspace_id,
        branches,
    )
    finance_counts = _seed_finance(
        session,
        bundle,
        foundation.workspace_id,
        branches,
    )
    return DemoSeedSummary(
        enabled=True,
        seed_version=bundle.manifest.seed_version,
        workspace_id=foundation.workspace_id,
        branch_count=len(branches),
        demo_user_count=len(bundle.iam.users),
        payment_method_count=len(bundle.configuration.payment_methods),
        customer_count=len(bundle.customers.items),
        crm_profile_count=crm_counts[0],
        crm_lead_count=crm_counts[1],
        crm_opportunity_count=crm_counts[2],
        crm_activity_count=crm_counts[3],
        employee_count=len(bundle.employees.items),
        leave_request_count=len(bundle.hr.leave_requests),
        debt_count=len(bundle.hr.debts),
        document_count=len(bundle.hr.documents),
        catalog_category_count=len(bundle.catalog.categories),
        catalog_item_count=len(bundle.catalog.items),
        catalog_assignment_count=catalog_assignment_count,
        inventory_warehouse_count=inventory_counts[0],
        inventory_profile_count=inventory_counts[1],
        inventory_stock_balance_count=inventory_counts[2],
        inventory_asset_count=inventory_counts[3],
        inventory_movement_count=inventory_counts[4] + usage_movement_count,
        purchasing_supplier_count=len(bundle.purchasing.suppliers),
        purchase_request_count=len(bundle.purchasing.requests),
        incident_count=incident_counts[0],
        incident_attachment_count=incident_counts[1],
        pos_register_count=pos_counts.registers,
        pos_quote_count=pos_counts.quotes,
        pos_sale_count=pos_counts.sales,
        pos_receivable_count=pos_counts.receivables,
        pos_payment_count=pos_counts.payments,
        pos_cash_movement_count=pos_counts.cash_movements,
        pos_inventory_movement_count=pos_counts.inventory_movements,
        appointment_count=appointment_count,
        dashboard_task_count=dashboard_task_count,
        finance_budget_count=finance_counts[0],
        finance_expense_count=finance_counts[1],
        finance_fixed_expense_count=finance_counts[2],
        finance_fixed_payment_count=finance_counts[3],
        finance_liability_count=finance_counts[4],
        finance_account_count=finance_counts[5],
        finance_income_count=finance_counts[6],
    )


def _seed_finance(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> tuple[int, int, int, int, int, int, int]:
    seed_version = bundle.manifest.seed_version
    actor_id = _stable_id(seed_version, "platform_user", "admin")
    budgets: dict[str, FinanceBudget] = {}

    def branch_for(code: str) -> Branch:
        branch = branches.get(code)
        if branch is None:
            raise RuntimeError(f"Demo finance fixture references unknown branch {code!r}.")
        return branch

    def upsert[ModelT](
        *,
        model: type[ModelT],
        entity_type: str,
        seed_key: str,
        payload: dict[str, object],
        values: dict[str, object],
    ) -> ModelT:
        entity_id = _stable_id(seed_version, entity_type, seed_key)
        entity = _registered_entity(
            session,
            workspace_id,
            entity_type,
            seed_key,
            entity_id,
            payload,
            model,
        )
        if entity is None:
            entity = cast(ModelT, cast(Any, model)(id=entity_id, **values))
            session.add(entity)
            session.flush()
            _register(
                session,
                workspace_id,
                entity_type,
                seed_key,
                entity_id,
                seed_version,
                payload,
            )
        else:
            _assign_demo_values(entity, values)
        return entity

    for budget_fixture in bundle.finance.budgets:
        branch = branch_for(budget_fixture.branch_code)
        payload = budget_fixture.model_dump(mode="json")
        budget = upsert(
            model=FinanceBudget,
            entity_type="finance_budget",
            seed_key=budget_fixture.seed_key,
            payload=payload,
            values={
                "workspace_id": workspace_id,
                "branch_id": branch.id,
                "name": budget_fixture.name,
                "normalized_name": " ".join(budget_fixture.name.casefold().split()),
                "budget_group": budget_fixture.group,
                "monthly_limit": budget_fixture.monthly_limit,
                "status": "active",
                "creation_idempotency_key": (
                    f"demo:{seed_version}:budget:{budget_fixture.seed_key}"
                ),
                "request_fingerprint": _checksum(payload),
                "created_by_platform_user_id": actor_id,
                "updated_by_platform_user_id": actor_id,
                "created_at": budget_fixture.created_at,
                "updated_at": budget_fixture.created_at,
            },
        )
        budgets[budget_fixture.seed_key] = budget

    for expense_fixture in bundle.finance.expenses:
        branch = branch_for(expense_fixture.branch_code)
        linked_budget = (
            budgets.get(expense_fixture.budget_seed_key)
            if expense_fixture.budget_seed_key
            else None
        )
        if expense_fixture.budget_seed_key and linked_budget is None:
            raise RuntimeError("Demo finance expense references an unknown budget.")
        if linked_budget is not None and linked_budget.branch_id != branch.id:
            raise RuntimeError("Demo finance expense and budget belong to different branches.")
        payload = expense_fixture.model_dump(mode="json")
        upsert(
            model=FinanceExpense,
            entity_type="finance_expense",
            seed_key=expense_fixture.seed_key,
            payload=payload,
            values={
                "workspace_id": workspace_id,
                "branch_id": branch.id,
                "concept": expense_fixture.concept,
                "amount": expense_fixture.amount,
                "category": expense_fixture.category,
                "expense_date": expense_fixture.date,
                "payment_status": expense_fixture.status,
                "budget_id": linked_budget.id if linked_budget else None,
                "record_status": "active",
                "creation_idempotency_key": (
                    f"demo:{seed_version}:expense:{expense_fixture.seed_key}"
                ),
                "request_fingerprint": _checksum(payload),
                "created_by_platform_user_id": actor_id,
                "updated_by_platform_user_id": actor_id,
                "created_at": expense_fixture.created_at,
                "updated_at": expense_fixture.created_at,
            },
        )

    fixed_payment_count = 0
    for fixed_fixture in bundle.finance.fixed_expenses:
        branch = branch_for(fixed_fixture.branch_code)
        payload = fixed_fixture.model_dump(mode="json")
        fixed_expense = upsert(
            model=FinanceFixedExpense,
            entity_type="finance_fixed_expense",
            seed_key=fixed_fixture.seed_key,
            payload=payload,
            values={
                "workspace_id": workspace_id,
                "branch_id": branch.id,
                "concept": fixed_fixture.concept,
                "normalized_concept": " ".join(fixed_fixture.concept.casefold().split()),
                "amount": fixed_fixture.amount,
                "category": fixed_fixture.category,
                "day_of_month": fixed_fixture.day_of_month,
                "status": "active",
                "creation_idempotency_key": (
                    f"demo:{seed_version}:fixed-expense:{fixed_fixture.seed_key}"
                ),
                "request_fingerprint": _checksum(payload),
                "created_by_platform_user_id": actor_id,
                "updated_by_platform_user_id": actor_id,
                "created_at": fixed_fixture.created_at,
                "updated_at": fixed_fixture.created_at,
            },
        )
        for payment_fixture in fixed_fixture.payments:
            payment_payload = {
                "fixedExpenseSeedKey": fixed_fixture.seed_key,
                **payment_fixture.model_dump(mode="json"),
            }
            upsert(
                model=FinanceFixedExpensePayment,
                entity_type="finance_fixed_payment",
                seed_key=payment_fixture.seed_key,
                payload=payment_payload,
                values={
                    "workspace_id": workspace_id,
                    "branch_id": branch.id,
                    "fixed_expense_id": fixed_expense.id,
                    "period": payment_fixture.period,
                    "amount": fixed_fixture.amount,
                    "paid_on": payment_fixture.paid_on,
                    "idempotency_key": (
                        f"demo:{seed_version}:fixed-payment:{payment_fixture.seed_key}"
                    ),
                    "request_fingerprint": _checksum(payment_payload),
                    "created_by_platform_user_id": actor_id,
                    "created_at": payment_fixture.created_at,
                },
            )
            fixed_payment_count += 1

    for liability_fixture in bundle.finance.liabilities:
        branch = branch_for(liability_fixture.branch_code)
        payload = liability_fixture.model_dump(mode="json")
        upsert(
            model=FinanceLiability,
            entity_type="finance_liability",
            seed_key=liability_fixture.seed_key,
            payload=payload,
            values={
                "workspace_id": workspace_id,
                "branch_id": branch.id,
                "name": liability_fixture.name,
                "normalized_name": " ".join(liability_fixture.name.casefold().split()),
                "liability_type": liability_fixture.type,
                "initial_amount": liability_fixture.initial_amount,
                "pending_amount": liability_fixture.pending_amount,
                "pay_day": liability_fixture.pay_day,
                "cut_day": liability_fixture.cut_day,
                "installment": liability_fixture.installment,
                "paid_installments": liability_fixture.paid_installments,
                "total_installments": liability_fixture.total_installments,
                "category_ids": liability_fixture.category_ids,
                "status": "active",
                "creation_idempotency_key": (
                    f"demo:{seed_version}:liability:{liability_fixture.seed_key}"
                ),
                "request_fingerprint": _checksum(payload),
                "created_by_platform_user_id": actor_id,
                "updated_by_platform_user_id": actor_id,
                "created_at": liability_fixture.created_at,
                "updated_at": liability_fixture.created_at,
            },
        )

    for account_fixture in bundle.finance.accounts:
        branch = branch_for(account_fixture.branch_code)
        payload = account_fixture.model_dump(mode="json")
        upsert(
            model=FinanceAccount,
            entity_type="finance_account",
            seed_key=account_fixture.seed_key,
            payload=payload,
            values={
                "workspace_id": workspace_id,
                "branch_id": branch.id,
                "name": account_fixture.name,
                "normalized_name": " ".join(account_fixture.name.casefold().split()),
                "account_type": account_fixture.type,
                "bank": account_fixture.bank,
                "account_number_masked": account_fixture.account_number_masked,
                "balance": account_fixture.balance,
                "currency_code": account_fixture.currency,
                "notes": account_fixture.notes,
                "status": "active",
                "creation_idempotency_key": (
                    f"demo:{seed_version}:account:{account_fixture.seed_key}"
                ),
                "request_fingerprint": _checksum(payload),
                "created_by_platform_user_id": actor_id,
                "updated_by_platform_user_id": actor_id,
                "created_at": account_fixture.created_at,
                "updated_at": account_fixture.created_at,
            },
        )

    for income_fixture in bundle.finance.manual_incomes:
        branch = branch_for(income_fixture.branch_code)
        payload = income_fixture.model_dump(mode="json")
        upsert(
            model=FinanceManualIncome,
            entity_type="finance_income",
            seed_key=income_fixture.seed_key,
            payload=payload,
            values={
                "workspace_id": workspace_id,
                "branch_id": branch.id,
                "category": income_fixture.category,
                "amount": income_fixture.amount,
                "income_date": income_fixture.date,
                "customer": income_fixture.customer,
                "source": income_fixture.source,
                "payment_status": income_fixture.status,
                "record_status": "active",
                "creation_idempotency_key": (
                    f"demo:{seed_version}:income:{income_fixture.seed_key}"
                ),
                "request_fingerprint": _checksum(payload),
                "created_by_platform_user_id": actor_id,
                "updated_by_platform_user_id": actor_id,
                "created_at": income_fixture.created_at,
                "updated_at": income_fixture.created_at,
            },
        )
    session.flush()
    return (
        len(bundle.finance.budgets),
        len(bundle.finance.expenses),
        len(bundle.finance.fixed_expenses),
        fixed_payment_count,
        len(bundle.finance.liabilities),
        len(bundle.finance.accounts),
        len(bundle.finance.manual_incomes),
    )


def _seed_agenda(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> int:
    actor_id = _stable_id(bundle.manifest.seed_version, "platform_user", "admin")
    for fixture in bundle.agenda.items:
        branch = branches.get(fixture.branch_code)
        if branch is None:
            raise RuntimeError("Demo appointment references an unknown branch.")
        resource = session.scalar(
            select(AppointmentResource).where(
                AppointmentResource.workspace_id == workspace_id,
                AppointmentResource.branch_id == branch.id,
                AppointmentResource.code == fixture.resource_code,
            )
        )
        if resource is None:
            raise RuntimeError("Demo appointment references an unknown resource.")
        customer = (
            session.get(
                Customer,
                _stable_id(
                    bundle.manifest.seed_version,
                    "customer",
                    fixture.customer_seed_key,
                ),
            )
            if fixture.customer_seed_key
            else None
        )
        employee = (
            session.get(
                Employee,
                _stable_id(
                    bundle.manifest.seed_version,
                    "employee",
                    fixture.employee_seed_key,
                ),
            )
            if fixture.employee_seed_key
            else None
        )
        service = (
            session.get(
                Item,
                _stable_id(
                    bundle.manifest.seed_version,
                    "item",
                    fixture.service_seed_key,
                ),
            )
            if fixture.service_seed_key
            else None
        )
        if fixture.customer_seed_key and customer is None:
            raise RuntimeError("Demo appointment references an unknown customer.")
        if fixture.employee_seed_key and employee is None:
            raise RuntimeError("Demo appointment references an unknown employee.")
        if fixture.service_seed_key and service is None:
            raise RuntimeError("Demo appointment references an unknown service.")

        payload = fixture.model_dump(mode="json")
        entity_id = _stable_id(bundle.manifest.seed_version, "appointment", fixture.seed_key)
        appointment = _registered_entity(
            session,
            workspace_id,
            "appointment",
            fixture.seed_key,
            entity_id,
            payload,
            Appointment,
        )
        starts_at = datetime.combine(
            fixture.date,
            fixture.time,
            tzinfo=ZoneInfo(branch.timezone),
        ).astimezone(UTC)
        values: dict[str, object] = {
            "workspace_id": workspace_id,
            "branch_id": branch.id,
            "resource_id": resource.id,
            "customer_id": customer.id if customer else None,
            "employee_id": employee.id if employee else None,
            "service_id": service.id if service else None,
            "scheduled_date": fixture.date,
            "scheduled_time": fixture.time,
            "timezone": branch.timezone,
            "starts_at": starts_at,
            "ends_at": starts_at + timedelta(minutes=fixture.duration_minutes),
            "duration_minutes": fixture.duration_minutes,
            "customer_name": customer.display_name if customer else "Cliente Mostrador",
            "customer_phone": customer.phone if customer else None,
            "service_name": service.name if service else "Sin servicio",
            "price": Decimal("0"),
            "status": fixture.status,
            "notes": "Cita de demostración para el dashboard.",
            "pending_payment": False,
            "pending_amount": Decimal("0"),
            "first_time": False,
            "free_trial": False,
            "reminder_sent": False,
            "source": "staff",
            "recurrence": "none",
            "recurrence_group_id": None,
            "occurrence_index": 0,
            "repeat_count": 1,
            "idempotency_key": (
                f"demo:{bundle.manifest.seed_version}:appointment:{fixture.seed_key}"
            ),
            "request_fingerprint": _checksum(payload),
            "created_by_platform_user_id": actor_id,
            "updated_by_platform_user_id": actor_id,
            "created_at": fixture.created_at,
            "updated_at": fixture.created_at,
        }
        if appointment is None:
            appointment = Appointment(id=entity_id, **values)
            session.add(appointment)
            session.flush()
            _register(
                session,
                workspace_id,
                "appointment",
                fixture.seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            for field, value in values.items():
                setattr(appointment, field, value)

        event_id = _stable_id(
            bundle.manifest.seed_version,
            "appointment_event",
            fixture.seed_key,
        )
        event = session.get(AppointmentEvent, event_id)
        event_values: dict[str, object] = {
            "workspace_id": workspace_id,
            "appointment_id": appointment.id,
            "actor_platform_user_id": actor_id,
            "actor_name": "Alex Demo",
            "action": "create",
            "changes": {"seeded": True},
            "request_id": None,
            "occurred_at": fixture.created_at,
        }
        if event is None:
            session.add(AppointmentEvent(id=event_id, **event_values))
        else:
            for event_field, event_value in event_values.items():
                setattr(event, event_field, event_value)
    session.flush()
    return len(bundle.agenda.items)


def _seed_dashboard_tasks(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> int:
    for fixture in bundle.dashboard.tasks:
        branch = branches.get(fixture.branch_code)
        if branch is None:
            raise RuntimeError("Demo dashboard task references an unknown branch.")
        payload = fixture.model_dump(mode="json")
        entity_id = _stable_id(bundle.manifest.seed_version, "task", fixture.seed_key)
        task = _registered_entity(
            session,
            workspace_id,
            "task",
            fixture.seed_key,
            entity_id,
            payload,
            Task,
        )
        values: dict[str, object] = {
            "workspace_id": workspace_id,
            "branch_id": branch.id,
            "title": fixture.title,
            "description": fixture.description,
            "status": fixture.status,
            "priority": fixture.priority,
            "due_at": fixture.due_at,
            "completed_at": fixture.completed_at,
            "assigned_to_name": fixture.assigned_to_name,
            "source": fixture.source,
            "source_route": fixture.source_route,
            "created_at": fixture.created_at,
            "updated_at": fixture.completed_at or fixture.created_at,
        }
        if task is None:
            task = Task(id=entity_id, **values)
            session.add(task)
            session.flush()
            _register(
                session,
                workspace_id,
                "task",
                fixture.seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            for field, value in values.items():
                setattr(task, field, value)
    session.flush()
    return len(bundle.dashboard.tasks)


def _seed_purchasing(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> None:
    admin_user_id = _stable_id(bundle.manifest.seed_version, "platform_user", "admin")
    suppliers: dict[str, Supplier] = {}
    for supplier_fixture in bundle.purchasing.suppliers:
        unknown_branches = set(supplier_fixture.branch_codes) - branches.keys()
        if unknown_branches:
            unknown = ", ".join(sorted(unknown_branches))
            raise RuntimeError(f"Demo supplier references unknown branches: {unknown}.")
        payload = supplier_fixture.model_dump(mode="json")
        supplier_id = _stable_id(
            bundle.manifest.seed_version, "supplier", supplier_fixture.seed_key
        )
        supplier = _registered_entity(
            session,
            workspace_id,
            "supplier",
            supplier_fixture.seed_key,
            supplier_id,
            payload,
            Supplier,
        )
        values = {
            "workspace_id": workspace_id,
            "name": supplier_fixture.name,
            "normalized_name": " ".join(supplier_fixture.name.casefold().split()),
            "tax_identifier": supplier_fixture.rnc,
            "contact_name": supplier_fixture.contact_name,
            "phone": supplier_fixture.phone,
            "email": str(supplier_fixture.email) if supplier_fixture.email else None,
            "address": supplier_fixture.address,
            "product_count": supplier_fixture.product_count,
            "status": "active" if supplier_fixture.active else "inactive",
            "creation_idempotency_key": (
                f"demo:{bundle.manifest.seed_version}:{supplier_fixture.seed_key}"
            ),
            "request_fingerprint": _checksum(payload),
            "created_by_platform_user_id": admin_user_id,
            "updated_by_platform_user_id": admin_user_id,
        }
        if supplier is None:
            supplier = Supplier(id=supplier_id, **values)
            session.add(supplier)
            session.flush()
            _register(
                session,
                workspace_id,
                "supplier",
                supplier_fixture.seed_key,
                supplier_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            for field, value in values.items():
                setattr(supplier, field, value)
        suppliers[supplier_fixture.seed_key] = supplier
        session.execute(
            delete(SupplierBranchAssignment).where(
                SupplierBranchAssignment.workspace_id == workspace_id,
                SupplierBranchAssignment.supplier_id == supplier.id,
            )
        )
        session.add_all(
            SupplierBranchAssignment(
                id=_stable_id(
                    bundle.manifest.seed_version,
                    "supplier_branch_assignment",
                    f"{supplier_fixture.seed_key}:{code}",
                ),
                workspace_id=workspace_id,
                supplier_id=supplier.id,
                branch_id=branches[code].id,
            )
            for code in supplier_fixture.branch_codes
        )
    session.flush()

    for request_fixture in bundle.purchasing.requests:
        supplier = suppliers.get(request_fixture.supplier_seed_key)
        branch = branches.get(request_fixture.branch_code)
        if supplier is None or branch is None:
            raise RuntimeError("Demo purchase request references an unknown supplier or branch.")
        requester_user_id = _stable_id(
            bundle.manifest.seed_version,
            "platform_user",
            request_fixture.requester_user_seed_key,
        )
        requester_membership_id = _stable_id(
            bundle.manifest.seed_version,
            "membership",
            request_fixture.requester_user_seed_key,
        )
        reviewer_membership_id = (
            _stable_id(
                bundle.manifest.seed_version,
                "membership",
                request_fixture.reviewer_user_seed_key,
            )
            if request_fixture.reviewer_user_seed_key
            else None
        )
        reviewer_user_id = (
            _stable_id(
                bundle.manifest.seed_version,
                "platform_user",
                request_fixture.reviewer_user_seed_key,
            )
            if request_fixture.reviewer_user_seed_key
            else None
        )
        payload = request_fixture.model_dump(mode="json")
        entity_id = _stable_id(
            bundle.manifest.seed_version, "purchase_request", request_fixture.seed_key
        )
        request = _registered_entity(
            session,
            workspace_id,
            "purchase_request",
            request_fixture.seed_key,
            entity_id,
            payload,
            PurchaseRequest,
        )
        values = {
            "workspace_id": workspace_id,
            "request_number": request_fixture.number,
            "supplier_id": supplier.id,
            "branch_id": branch.id,
            "requester_membership_id": requester_membership_id,
            "requester_name": request_fixture.requester_name,
            "status": request_fixture.status,
            "priority": request_fixture.priority,
            "notes": request_fixture.notes,
            "quote_file_name": request_fixture.quote_file_name,
            "reviewer_membership_id": reviewer_membership_id,
            "reviewed_at": request_fixture.reviewed_at,
            "delivered_at": request_fixture.delivered_at,
            "creation_idempotency_key": (
                f"demo:{bundle.manifest.seed_version}:request:{request_fixture.seed_key}"
            ),
            "request_fingerprint": _checksum(payload),
            "created_by_platform_user_id": requester_user_id,
            "updated_by_platform_user_id": reviewer_user_id or requester_user_id,
            "created_at": request_fixture.created_at,
            "updated_at": request_fixture.reviewed_at or request_fixture.created_at,
        }
        if request is None:
            request = PurchaseRequest(id=entity_id, **values)
            session.add(request)
            session.flush()
            _register(
                session,
                workspace_id,
                "purchase_request",
                request_fixture.seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            for field, value in values.items():
                setattr(request, field, value)
        session.execute(
            delete(PurchaseRequestItem).where(
                PurchaseRequestItem.workspace_id == workspace_id,
                PurchaseRequestItem.purchase_request_id == request.id,
            )
        )
        session.add_all(
            PurchaseRequestItem(
                id=_stable_id(
                    bundle.manifest.seed_version,
                    "purchase_request_item",
                    f"{request_fixture.seed_key}:{position}",
                ),
                workspace_id=workspace_id,
                purchase_request_id=request.id,
                position=position,
                name=item.name,
                quantity=item.qty,
                unit=item.unit,
                unit_price=item.price,
            )
            for position, item in enumerate(request_fixture.items, start=1)
        )

    settings = session.scalar(
        select(PurchasingSettings).where(PurchasingSettings.workspace_id == workspace_id)
    )
    if settings is None:
        raise RuntimeError("Purchasing settings were not installed for the demo workspace.")
    approver_key = bundle.purchasing.settings.approver_user_seed_key
    settings.approver_membership_id = (
        _stable_id(bundle.manifest.seed_version, "membership", approver_key)
        if approver_key
        else None
    )
    settings.notify_on_request = bundle.purchasing.settings.notify_on_request
    settings.updated_by_platform_user_id = admin_user_id
    session.flush()


def _seed_catalog(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> int:
    categories = _seed_catalog_categories(session, bundle, workspace_id)
    units = {
        unit.code: unit
        for unit in session.scalars(
            select(UnitOfMeasure).where(UnitOfMeasure.workspace_id == workspace_id)
        )
    }
    assignment_count = 0
    for fixture in bundle.catalog.items:
        category = categories.get(fixture.category_seed_key)
        if category is None:
            raise RuntimeError(
                f"Demo catalog category {fixture.category_seed_key!r} is not installed."
            )
        unit = units.get(fixture.unit_code)
        if unit is None:
            raise RuntimeError(f"Demo unit of measure {fixture.unit_code!r} is not installed.")
        unknown_branch_codes = set(fixture.branch_codes) - branches.keys()
        if unknown_branch_codes:
            unknown = ", ".join(sorted(unknown_branch_codes))
            raise RuntimeError(f"Demo catalog item references unknown branches: {unknown}.")

        payload = fixture.model_dump(mode="json")
        item_id = _stable_id(bundle.manifest.seed_version, "item", fixture.seed_key)
        item = _registered_entity(
            session,
            workspace_id,
            "item",
            fixture.seed_key,
            item_id,
            payload,
            Item,
        )
        sku = fixture.sku.strip().upper() if fixture.sku else None
        if item is None:
            item = Item(
                id=item_id,
                workspace_id=workspace_id,
                category_id=category.id,
                unit_of_measure_id=unit.id,
                item_type=fixture.item_type,
                name=_normalized_catalog_name(fixture.name),
                description=fixture.description,
                sku=sku,
                status=fixture.status,
            )
            session.add(item)
            session.flush()
            _register(
                session,
                workspace_id,
                "item",
                fixture.seed_key,
                item_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            item.category_id = category.id
            item.unit_of_measure_id = unit.id
            item.item_type = fixture.item_type
            item.name = _normalized_catalog_name(fixture.name)
            item.description = fixture.description
            item.sku = sku
            item.status = fixture.status

        selected_branch_codes = set(fixture.branch_codes)
        for branch_code, branch in branches.items():
            assignment_key = f"{fixture.seed_key}:{branch_code}"
            assignment_id = _stable_id(
                bundle.manifest.seed_version,
                "item_branch_assignment",
                assignment_key,
            )
            assignment = session.get(ItemBranchAssignment, assignment_id)
            if branch_code not in selected_branch_codes:
                if assignment is not None:
                    assignment.status = "inactive"
                continue

            assignment_payload = {
                "itemSeedKey": fixture.seed_key,
                "branchCode": branch_code,
            }
            assignment = _registered_entity(
                session,
                workspace_id,
                "item_branch_assignment",
                assignment_key,
                assignment_id,
                assignment_payload,
                ItemBranchAssignment,
            )
            if assignment is None:
                assignment = ItemBranchAssignment(
                    id=assignment_id,
                    workspace_id=workspace_id,
                    item_id=item.id,
                    branch_id=branch.id,
                    status="active",
                )
                session.add(assignment)
                session.flush()
                _register(
                    session,
                    workspace_id,
                    "item_branch_assignment",
                    assignment_key,
                    assignment_id,
                    bundle.manifest.seed_version,
                    assignment_payload,
                )
            else:
                assignment.item_id = item.id
                assignment.branch_id = branch.id
                assignment.status = "active"
            assignment_count += 1
    session.flush()
    return assignment_count


def _seed_catalog_categories(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
) -> dict[str, ItemCategory]:
    categories: dict[str, ItemCategory] = {}
    for fixture in bundle.catalog.categories:
        payload = fixture.model_dump(mode="json")
        category_id = _stable_id(
            bundle.manifest.seed_version,
            "item_category",
            fixture.seed_key,
        )
        category = _registered_entity(
            session,
            workspace_id,
            "item_category",
            fixture.seed_key,
            category_id,
            payload,
            ItemCategory,
        )
        name = _normalized_catalog_name(fixture.name)
        if category is None:
            category = ItemCategory(
                id=category_id,
                workspace_id=workspace_id,
                name=name,
                normalized_name=name.casefold(),
                description=fixture.description,
                status=fixture.status,
            )
            session.add(category)
            session.flush()
            _register(
                session,
                workspace_id,
                "item_category",
                fixture.seed_key,
                category_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            category.name = name
            category.normalized_name = name.casefold()
            category.description = fixture.description
            category.status = fixture.status
        categories[fixture.seed_key] = category
    session.flush()
    return categories


def _normalized_catalog_name(value: str) -> str:
    return " ".join(value.split())


def _seed_inventory(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> tuple[int, int, int, int, int]:
    inventory_branch_codes = {
        branch_code
        for fixture in bundle.inventory.item_profiles
        for branch_code in fixture.stock_by_branch
    } | {fixture.branch_code for fixture in bundle.inventory.assets}
    unknown_branch_codes = inventory_branch_codes - branches.keys()
    if unknown_branch_codes:
        unknown = ", ".join(sorted(unknown_branch_codes))
        raise RuntimeError(f"Demo inventory references unknown branches: {unknown}.")
    inventory_branches = {
        branch_code: branches[branch_code] for branch_code in inventory_branch_codes
    }
    warehouses = _ensure_demo_warehouses(
        session,
        bundle.manifest.seed_version,
        workspace_id,
        inventory_branches,
    )
    items = {
        fixture.seed_key: session.get(
            Item,
            _stable_id(bundle.manifest.seed_version, "item", fixture.seed_key),
        )
        for fixture in bundle.catalog.items
    }
    stock_balance_count = 0
    movement_count = 0
    for fixture in bundle.inventory.item_profiles:
        item = items.get(fixture.item_seed_key)
        if item is None:
            raise RuntimeError(
                f"Demo inventory profile references unknown item {fixture.item_seed_key!r}."
            )
        _validate_demo_inventory_profile(fixture, item.item_type, inventory_branches)
        profile_payload = fixture.model_dump(mode="json")
        profile_key = fixture.item_seed_key
        profile = session.scalar(
            select(InventoryItemProfile).where(
                InventoryItemProfile.workspace_id == workspace_id,
                InventoryItemProfile.item_id == item.id,
            )
        )
        profile_registry_id = session.scalar(
            select(DemoSeedRegistry.entity_id).where(
                DemoSeedRegistry.workspace_id == workspace_id,
                DemoSeedRegistry.entity_type == "inventory_item_profile",
                DemoSeedRegistry.seed_key == profile_key,
            )
        )
        profile_id = (
            profile_registry_id
            or (profile.id if profile is not None else None)
            or _stable_id(bundle.manifest.seed_version, "inventory_item_profile", profile_key)
        )
        if profile_registry_id is None and profile is not None:
            _register(
                session,
                workspace_id,
                "inventory_item_profile",
                profile_key,
                profile.id,
                bundle.manifest.seed_version,
                profile_payload,
            )
        else:
            profile = _registered_entity(
                session,
                workspace_id,
                "inventory_item_profile",
                profile_key,
                profile_id,
                profile_payload,
                InventoryItemProfile,
            )
        if profile is None:
            profile = InventoryItemProfile(
                id=profile_id,
                workspace_id=workspace_id,
                item_id=item.id,
            )
            session.add(profile)
            session.flush()
            _register(
                session,
                workspace_id,
                "inventory_item_profile",
                profile_key,
                profile.id,
                bundle.manifest.seed_version,
                profile_payload,
            )
        profile.sale_price = fixture.sale_price
        profile.unit_cost = fixture.unit_cost
        profile.tax_rate = fixture.tax_rate
        profile.request_fingerprint = _checksum(profile_payload)

        for branch_code, quantity in fixture.stock_by_branch.items():
            branch = branches[branch_code]
            assignment = session.scalar(
                select(ItemBranchAssignment).where(
                    ItemBranchAssignment.workspace_id == workspace_id,
                    ItemBranchAssignment.item_id == item.id,
                    ItemBranchAssignment.branch_id == branch.id,
                    ItemBranchAssignment.status == "active",
                )
            )
            if assignment is None:
                raise RuntimeError(
                    f"Demo stock item {fixture.item_seed_key!r} is not assigned to "
                    f"branch {branch_code!r}."
                )
            warehouse = warehouses[branch_code]
            balance_key = f"{fixture.item_seed_key}:{branch_code}"
            balance_payload = {
                "itemSeedKey": fixture.item_seed_key,
                "branchCode": branch_code,
                "quantity": str(quantity),
                "minimumStock": str(fixture.minimum_stock),
            }
            balance = session.scalar(
                select(InventoryStockBalance).where(
                    InventoryStockBalance.workspace_id == workspace_id,
                    InventoryStockBalance.warehouse_id == warehouse.id,
                    InventoryStockBalance.item_id == item.id,
                )
            )
            balance_registry_id = session.scalar(
                select(DemoSeedRegistry.entity_id).where(
                    DemoSeedRegistry.workspace_id == workspace_id,
                    DemoSeedRegistry.entity_type == "inventory_stock_balance",
                    DemoSeedRegistry.seed_key == balance_key,
                )
            )
            balance_id = (
                balance_registry_id
                or (balance.id if balance is not None else None)
                or _stable_id(
                    bundle.manifest.seed_version,
                    "inventory_stock_balance",
                    balance_key,
                )
            )
            if balance_registry_id is None and balance is not None:
                _register(
                    session,
                    workspace_id,
                    "inventory_stock_balance",
                    balance_key,
                    balance.id,
                    bundle.manifest.seed_version,
                    balance_payload,
                )
            else:
                balance = _registered_entity(
                    session,
                    workspace_id,
                    "inventory_stock_balance",
                    balance_key,
                    balance_id,
                    balance_payload,
                    InventoryStockBalance,
                )
            if balance is None:
                balance = InventoryStockBalance(
                    id=balance_id,
                    workspace_id=workspace_id,
                    branch_id=branch.id,
                    warehouse_id=warehouse.id,
                    item_id=item.id,
                )
                session.add(balance)
                session.flush()
                _register(
                    session,
                    workspace_id,
                    "inventory_stock_balance",
                    balance_key,
                    balance.id,
                    bundle.manifest.seed_version,
                    balance_payload,
                )
            balance.branch_id = branch.id
            balance.warehouse_id = warehouse.id
            balance.item_id = item.id
            balance.quantity = quantity
            balance.minimum_quantity = fixture.minimum_stock
            stock_balance_count += 1
            if quantity > 0:
                _seed_opening_movement(
                    session=session,
                    bundle=bundle,
                    workspace_id=workspace_id,
                    branch=branch,
                    warehouse=warehouse,
                    item=item,
                    profile=profile,
                    item_seed_key=fixture.item_seed_key,
                    quantity=quantity,
                )
                movement_count += 1

    asset_count = _seed_demo_assets(session, bundle, workspace_id, branches)
    session.flush()
    return (
        len(warehouses),
        len(bundle.inventory.item_profiles),
        stock_balance_count,
        asset_count,
        movement_count,
    )


def _seed_incidents(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> tuple[int, int]:
    users: dict[str, tuple[PlatformUser, WorkspaceMembership]] = {}
    for user_fixture in bundle.iam.users:
        platform_user = session.get(
            PlatformUser,
            _stable_id(
                bundle.manifest.seed_version,
                "platform_user",
                user_fixture.seed_key,
            ),
        )
        membership = session.get(
            WorkspaceMembership,
            _stable_id(
                bundle.manifest.seed_version,
                "membership",
                user_fixture.seed_key,
            ),
        )
        if platform_user is None or membership is None:
            raise RuntimeError(f"Demo incident user {user_fixture.seed_key!r} is missing.")
        users[user_fixture.seed_key] = (platform_user, membership)

    assets = {
        fixture.seed_key: session.get(
            Asset,
            _stable_id(bundle.manifest.seed_version, "asset", fixture.seed_key),
        )
        for fixture in bundle.inventory.assets
    }
    attachment_count = 0
    maximum_code = 0
    for fixture in bundle.incidents.items:
        branch = branches.get(fixture.branch_code)
        if branch is None:
            raise RuntimeError(f"Demo incident references unknown branch {fixture.branch_code!r}.")
        reporter = users.get(fixture.reporter_user_seed_key)
        if reporter is None or reporter[1].status != "active":
            raise RuntimeError("Demo incidents require an active reporter.")
        referenced_user_keys = set(fixture.participant_user_seed_keys)
        referenced_user_keys.update(
            activity.author_user_seed_key for activity in fixture.activities
        )
        referenced_user_keys.update(
            attachment.uploaded_by_user_seed_key for attachment in fixture.attachments
        )
        missing_user_keys = referenced_user_keys - users.keys()
        if missing_user_keys:
            missing = ", ".join(sorted(missing_user_keys))
            raise RuntimeError(f"Demo incident references unknown users: {missing}.")
        if any(users[key][1].status != "active" for key in referenced_user_keys):
            raise RuntimeError("Demo incident participants and authors must be active.")

        asset = assets.get(fixture.asset_seed_key) if fixture.asset_seed_key else None
        if fixture.asset_seed_key and asset is None:
            raise RuntimeError(
                f"Demo incident references unknown asset {fixture.asset_seed_key!r}."
            )
        if asset is not None and asset.branch_id != branch.id:
            raise RuntimeError("Demo incident asset must belong to its branch.")
        employee = (
            session.get(
                Employee,
                _stable_id(
                    bundle.manifest.seed_version,
                    "employee",
                    fixture.employee_seed_key,
                ),
            )
            if fixture.employee_seed_key
            else None
        )
        if fixture.employee_seed_key and employee is None:
            raise RuntimeError("Demo incident references an unknown employee.")
        if employee is not None:
            assignment = session.scalar(
                select(EmployeeBranchAssignment).where(
                    EmployeeBranchAssignment.workspace_id == workspace_id,
                    EmployeeBranchAssignment.employee_id == employee.id,
                    EmployeeBranchAssignment.branch_id == branch.id,
                    EmployeeBranchAssignment.status == "active",
                )
            )
            if assignment is None:
                raise RuntimeError("Demo incident employee is not assigned to its branch.")

        payload = fixture.model_dump(mode="json")
        incident_id = _stable_id(bundle.manifest.seed_version, "incident", fixture.seed_key)
        incident = _registered_entity(
            session,
            workspace_id,
            "incident",
            fixture.seed_key,
            incident_id,
            payload,
            Incident,
        )
        last_author_key = max(fixture.activities, key=lambda item: item.created_at)
        last_author = users[last_author_key.author_user_seed_key][0]
        incident_values = {
            "workspace_id": workspace_id,
            "branch_id": branch.id,
            "asset_id": asset.id if asset is not None else None,
            "employee_id": employee.id if employee is not None else None,
            "employee_incident_kind": fixture.employee_incident_kind,
            "reported_by_membership_id": reporter[1].id,
            "reported_by_name": reporter[0].display_name,
            "code": fixture.code,
            "title": fixture.title,
            "description": fixture.description,
            "incident_type": fixture.type,
            "priority": fixture.priority,
            "status": fixture.status,
            "creation_idempotency_key": (
                f"demo:{bundle.manifest.seed_version}:incident:{fixture.seed_key}"
            ),
            "request_fingerprint": _checksum(payload),
            "updated_by_platform_user_id": last_author.id,
            "created_at": fixture.created_at,
            "updated_at": fixture.updated_at,
        }
        if incident is None:
            incident = Incident(id=incident_id, **incident_values)
            session.add(incident)
            session.flush()
            _register(
                session,
                workspace_id,
                "incident",
                fixture.seed_key,
                incident.id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            for field, incident_value in incident_values.items():
                setattr(incident, field, incident_value)

        for participant_user_seed_key in fixture.participant_user_seed_keys:
            participant_user, participant_membership = users[participant_user_seed_key]
            participant_key = f"{fixture.seed_key}:{participant_user_seed_key}"
            participant_payload = {
                "incidentSeedKey": fixture.seed_key,
                "userSeedKey": participant_user_seed_key,
            }
            participant_id = _stable_id(
                bundle.manifest.seed_version,
                "incident_participant",
                participant_key,
            )
            participant = _registered_entity(
                session,
                workspace_id,
                "incident_participant",
                participant_key,
                participant_id,
                participant_payload,
                IncidentParticipant,
            )
            participant_values = {
                "workspace_id": workspace_id,
                "incident_id": incident.id,
                "membership_id": participant_membership.id,
                "participant_name": participant_user.display_name,
                "created_at": fixture.created_at,
                "updated_at": fixture.updated_at,
            }
            if participant is None:
                participant = IncidentParticipant(id=participant_id, **participant_values)
                session.add(participant)
                session.flush()
                _register(
                    session,
                    workspace_id,
                    "incident_participant",
                    participant_key,
                    participant.id,
                    bundle.manifest.seed_version,
                    participant_payload,
                )
            else:
                for field, participant_value in participant_values.items():
                    setattr(participant, field, participant_value)

        for activity_fixture in fixture.activities:
            author_user, author_membership = users[activity_fixture.author_user_seed_key]
            activity_key = f"{fixture.seed_key}:{activity_fixture.seed_key}"
            activity_payload = {
                "incidentSeedKey": fixture.seed_key,
                **activity_fixture.model_dump(mode="json"),
            }
            activity_id = _stable_id(
                bundle.manifest.seed_version,
                "incident_activity",
                activity_key,
            )
            activity = _registered_entity(
                session,
                workspace_id,
                "incident_activity",
                activity_key,
                activity_id,
                activity_payload,
                IncidentActivity,
            )
            activity_values = {
                "workspace_id": workspace_id,
                "incident_id": incident.id,
                "activity_type": activity_fixture.type,
                "author_membership_id": author_membership.id,
                "author_name": author_user.display_name,
                "message": activity_fixture.message,
                "created_at": activity_fixture.created_at,
            }
            if activity is None:
                activity = IncidentActivity(id=activity_id, **activity_values)
                session.add(activity)
                session.flush()
                _register(
                    session,
                    workspace_id,
                    "incident_activity",
                    activity_key,
                    activity.id,
                    bundle.manifest.seed_version,
                    activity_payload,
                )
            else:
                for field, activity_value in activity_values.items():
                    setattr(activity, field, activity_value)

        for attachment_fixture in fixture.attachments:
            _, uploader_membership = users[attachment_fixture.uploaded_by_user_seed_key]
            content = base64.b64decode(attachment_fixture.content_base64, validate=True)
            _validate_demo_incident_image(attachment_fixture.content_type, content)
            attachment_key = f"{fixture.seed_key}:{attachment_fixture.seed_key}"
            attachment_payload = {
                "incidentSeedKey": fixture.seed_key,
                **attachment_fixture.model_dump(mode="json"),
            }
            attachment_id = _stable_id(
                bundle.manifest.seed_version,
                "incident_attachment",
                attachment_key,
            )
            attachment = _registered_entity(
                session,
                workspace_id,
                "incident_attachment",
                attachment_key,
                attachment_id,
                attachment_payload,
                IncidentAttachment,
            )
            attachment_values = {
                "workspace_id": workspace_id,
                "incident_id": incident.id,
                "uploaded_by_membership_id": uploader_membership.id,
                "original_filename": attachment_fixture.original_filename,
                "content_type": attachment_fixture.content_type,
                "size_bytes": len(content),
                "checksum_sha256": hashlib.sha256(content).hexdigest(),
                "content": content,
                "created_at": attachment_fixture.created_at,
            }
            if attachment is None:
                attachment = IncidentAttachment(id=attachment_id, **attachment_values)
                session.add(attachment)
                session.flush()
                _register(
                    session,
                    workspace_id,
                    "incident_attachment",
                    attachment_key,
                    attachment.id,
                    bundle.manifest.seed_version,
                    attachment_payload,
                )
            else:
                for field, attachment_value in attachment_values.items():
                    setattr(attachment, field, attachment_value)
            attachment_count += 1

        maximum_code = max(maximum_code, int(fixture.code.removeprefix("INC-")))

    counter = session.get(IncidentCounter, workspace_id)
    if counter is None:
        session.add(IncidentCounter(workspace_id=workspace_id, last_value=maximum_code))
    else:
        counter.last_value = max(counter.last_value, maximum_code)
    session.flush()
    return len(bundle.incidents.items), attachment_count


def _validate_demo_incident_image(content_type: str, content: bytes) -> None:
    valid = {
        "image/jpeg": content.startswith(b"\xff\xd8\xff"),
        "image/png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/gif": content.startswith((b"GIF87a", b"GIF89a")),
        "image/webp": (
            content.startswith(b"RIFF") and len(content) >= 12 and content[8:12] == b"WEBP"
        ),
    }
    if not valid.get(content_type, False):
        raise RuntimeError("Demo incident image content does not match its content type.")
    if len(content) > settings.incident_image_max_bytes:
        raise RuntimeError("Demo incident image exceeds the configured size limit.")


def _validate_demo_inventory_profile(
    fixture: DemoInventoryItemProfileFixture,
    item_type: str,
    branches: dict[str, Branch],
) -> None:
    unknown_branches = set(fixture.stock_by_branch) - branches.keys()
    if unknown_branches:
        unknown = ", ".join(sorted(unknown_branches))
        raise RuntimeError(f"Demo inventory profile references unknown branches: {unknown}.")
    if item_type in {"service", "membership"}:
        if fixture.sale_price is None or fixture.unit_cost is not None or fixture.stock_by_branch:
            raise RuntimeError(
                "Demo services and memberships require a sale price and cannot control stock."
            )
    elif item_type == "product":
        if fixture.sale_price is None or fixture.unit_cost is None:
            raise RuntimeError("Demo products require sale price and unit cost.")
    elif item_type == "supply":
        if fixture.sale_price is not None or fixture.unit_cost is None or fixture.tax_rate != 0:
            raise RuntimeError("Demo supplies require only unit cost and zero tax.")
    else:
        raise RuntimeError(f"Item type {item_type!r} cannot have an inventory profile.")


def _ensure_demo_warehouses(
    session: Session,
    seed_version: str,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> dict[str, InventoryWarehouse]:
    warehouses: dict[str, InventoryWarehouse] = {}
    for branch_code, branch in branches.items():
        warehouse = session.scalar(
            select(InventoryWarehouse).where(
                InventoryWarehouse.workspace_id == workspace_id,
                InventoryWarehouse.branch_id == branch.id,
                InventoryWarehouse.code == "main",
            )
        )
        if warehouse is None:
            warehouse = InventoryWarehouse(
                id=_stable_id(seed_version, "inventory_warehouse", branch_code),
                workspace_id=workspace_id,
                branch_id=branch.id,
                code="main",
                name="Almacén principal",
                is_default=True,
                status="active",
            )
            session.add(warehouse)
            session.flush()
        else:
            warehouse.name = "Almacén principal"
            warehouse.is_default = True
            warehouse.status = "active"
        warehouses[branch_code] = warehouse
    return warehouses


def _seed_opening_movement(
    *,
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branch: Branch,
    warehouse: InventoryWarehouse,
    item: Item,
    profile: InventoryItemProfile,
    item_seed_key: str,
    quantity: Decimal,
) -> None:
    movement_key = f"{item_seed_key}:{branch.code}"
    movement_payload = {
        "itemSeedKey": item_seed_key,
        "branchCode": branch.code,
        "quantity": str(quantity),
    }
    movement_id = _stable_id(
        bundle.manifest.seed_version,
        "inventory_opening_movement",
        movement_key,
    )
    movement = _registered_entity(
        session,
        workspace_id,
        "inventory_opening_movement",
        movement_key,
        movement_id,
        movement_payload,
        InventoryMovement,
    )
    if movement is None:
        movement = InventoryMovement(
            id=movement_id,
            workspace_id=workspace_id,
            branch_id=branch.id,
            warehouse_id=warehouse.id,
            movement_type="opening",
            employee_id=None,
            appointment_id=None,
            comment="Existencia inicial demo",
            idempotency_key=(
                f"demo:{bundle.manifest.seed_version}:opening:{item_seed_key}:{branch.code}"
            ),
            request_fingerprint=_checksum(movement_payload),
            created_by_platform_user_id=_stable_id(
                bundle.manifest.seed_version, "platform_user", "admin"
            ),
            created_at=datetime(2026, 8, 1, 9, tzinfo=UTC),
        )
        session.add(movement)
        session.flush()
        _register(
            session,
            workspace_id,
            "inventory_opening_movement",
            movement_key,
            movement.id,
            bundle.manifest.seed_version,
            movement_payload,
        )
    else:
        movement.branch_id = branch.id
        movement.warehouse_id = warehouse.id
        movement.movement_type = "opening"
        movement.comment = "Existencia inicial demo"
        movement.request_fingerprint = _checksum(movement_payload)

    line_key = movement_key
    line_payload = {**movement_payload, "unitCost": str(profile.unit_cost or 0)}
    line_id = _stable_id(
        bundle.manifest.seed_version,
        "inventory_opening_line",
        line_key,
    )
    line = _registered_entity(
        session,
        workspace_id,
        "inventory_opening_line",
        line_key,
        line_id,
        line_payload,
        InventoryMovementLine,
    )
    unit = session.get(UnitOfMeasure, item.unit_of_measure_id)
    if unit is None:
        raise RuntimeError("Demo inventory item unit of measure is missing.")
    if line is None:
        line = InventoryMovementLine(
            id=line_id,
            workspace_id=workspace_id,
            movement_id=movement.id,
            item_id=item.id,
            quantity_delta=quantity,
            quantity_before=Decimal("0"),
            quantity_after=quantity,
            unit_cost_snapshot=profile.unit_cost,
            item_name=item.name,
            item_sku=item.sku,
            unit_symbol=unit.symbol,
        )
        session.add(line)
        session.flush()
        _register(
            session,
            workspace_id,
            "inventory_opening_line",
            line_key,
            line.id,
            bundle.manifest.seed_version,
            line_payload,
        )
    else:
        line.movement_id = movement.id
        line.item_id = item.id
        line.quantity_delta = quantity
        line.quantity_before = Decimal("0")
        line.quantity_after = quantity
        line.unit_cost_snapshot = profile.unit_cost
        line.item_name = item.name
        line.item_sku = item.sku
        line.unit_symbol = unit.symbol


def _seed_inventory_usage_movements(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> int:
    if not bundle.inventory.usage_movements:
        return 0
    warehouses = _ensure_demo_warehouses(
        session,
        bundle.manifest.seed_version,
        workspace_id,
        branches,
    )
    for fixture in bundle.inventory.usage_movements:
        branch = branches.get(fixture.branch_code)
        if branch is None:
            raise RuntimeError(
                f"Demo usage movement references unknown branch {fixture.branch_code!r}."
            )
        employee = session.get(
            Employee,
            _stable_id(bundle.manifest.seed_version, "employee", fixture.employee_seed_key),
        )
        if employee is None:
            raise RuntimeError("Demo usage movement references an unknown employee.")
        assignment = session.scalar(
            select(EmployeeBranchAssignment).where(
                EmployeeBranchAssignment.workspace_id == workspace_id,
                EmployeeBranchAssignment.employee_id == employee.id,
                EmployeeBranchAssignment.branch_id == branch.id,
                EmployeeBranchAssignment.status == "active",
            )
        )
        if assignment is None:
            raise RuntimeError("Demo usage employee is not assigned to the movement branch.")
        appointment = None
        if fixture.appointment_seed_key:
            appointment = session.get(
                Appointment,
                _stable_id(
                    bundle.manifest.seed_version,
                    "appointment",
                    fixture.appointment_seed_key,
                ),
            )
            if (
                appointment is None
                or appointment.branch_id != branch.id
                or appointment.employee_id != employee.id
            ):
                raise RuntimeError("Demo usage appointment must belong to the employee and branch.")
        creator = session.get(
            PlatformUser,
            _stable_id(
                bundle.manifest.seed_version,
                "platform_user",
                fixture.created_by_user_seed_key,
            ),
        )
        if creator is None:
            raise RuntimeError("Demo usage movement creator is missing.")

        payload = fixture.model_dump(mode="json")
        movement_id = _stable_id(
            bundle.manifest.seed_version, "inventory_usage_movement", fixture.seed_key
        )
        movement = _registered_entity(
            session,
            workspace_id,
            "inventory_usage_movement",
            fixture.seed_key,
            movement_id,
            payload,
            InventoryMovement,
        )
        movement_values = {
            "workspace_id": workspace_id,
            "branch_id": branch.id,
            "warehouse_id": warehouses[fixture.branch_code].id,
            "movement_type": "outbound",
            "employee_id": employee.id,
            "appointment_id": appointment.id if appointment else None,
            "comment": fixture.comment,
            "idempotency_key": (f"demo:{bundle.manifest.seed_version}:usage:{fixture.seed_key}"),
            "request_fingerprint": _checksum(payload),
            "created_by_platform_user_id": creator.id,
            "created_at": fixture.created_at,
        }
        if movement is None:
            movement = InventoryMovement(id=movement_id, **movement_values)
            session.add(movement)
            session.flush()
            _register(
                session,
                workspace_id,
                "inventory_usage_movement",
                fixture.seed_key,
                movement.id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            for field, value in movement_values.items():
                setattr(movement, field, value)

        for line_fixture in fixture.lines:
            item = session.get(
                Item,
                _stable_id(bundle.manifest.seed_version, "item", line_fixture.item_seed_key),
            )
            if item is None or item.item_type != "supply":
                raise RuntimeError("Demo usage movements may only contain known supplies.")
            balance = session.scalar(
                select(InventoryStockBalance).where(
                    InventoryStockBalance.workspace_id == workspace_id,
                    InventoryStockBalance.warehouse_id == warehouses[fixture.branch_code].id,
                    InventoryStockBalance.item_id == item.id,
                )
            )
            profile = session.scalar(
                select(InventoryItemProfile).where(
                    InventoryItemProfile.workspace_id == workspace_id,
                    InventoryItemProfile.item_id == item.id,
                )
            )
            unit = session.get(UnitOfMeasure, item.unit_of_measure_id)
            if balance is None or profile is None or unit is None:
                raise RuntimeError("Demo usage supply inventory configuration is incomplete.")
            before = balance.quantity
            after = before - line_fixture.quantity
            if after < 0:
                raise RuntimeError("Demo usage movement would produce negative stock.")
            balance.quantity = after

            line_key = f"{fixture.seed_key}:{line_fixture.item_seed_key}"
            line_payload = {
                **line_fixture.model_dump(mode="json"),
                "movementSeedKey": fixture.seed_key,
                "quantityBefore": str(before),
                "quantityAfter": str(after),
            }
            line_id = _stable_id(bundle.manifest.seed_version, "inventory_usage_line", line_key)
            line = _registered_entity(
                session,
                workspace_id,
                "inventory_usage_line",
                line_key,
                line_id,
                line_payload,
                InventoryMovementLine,
            )
            line_values = {
                "workspace_id": workspace_id,
                "movement_id": movement.id,
                "item_id": item.id,
                "quantity_delta": -line_fixture.quantity,
                "quantity_before": before,
                "quantity_after": after,
                "unit_cost_snapshot": profile.unit_cost,
                "item_name": item.name,
                "item_sku": item.sku,
                "unit_symbol": unit.symbol,
            }
            if line is None:
                line = InventoryMovementLine(id=line_id, **line_values)
                session.add(line)
                session.flush()
                _register(
                    session,
                    workspace_id,
                    "inventory_usage_line",
                    line_key,
                    line.id,
                    bundle.manifest.seed_version,
                    line_payload,
                )
            else:
                for field, value in line_values.items():
                    setattr(line, field, value)
    session.flush()
    return len(bundle.inventory.usage_movements)


def _seed_demo_assets(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> int:
    categories = {
        category.code: category
        for category in session.scalars(
            select(AssetCategory).where(
                AssetCategory.workspace_id == workspace_id,
                AssetCategory.status == "active",
            )
        )
    }
    actor_id = _stable_id(bundle.manifest.seed_version, "platform_user", "admin")
    for fixture in bundle.inventory.assets:
        branch = branches.get(fixture.branch_code)
        if branch is None:
            raise RuntimeError(f"Demo asset references unknown branch {fixture.branch_code!r}.")
        category = categories.get(fixture.category_code)
        if category is None:
            raise RuntimeError(f"Demo asset references unknown category {fixture.category_code!r}.")
        payload = fixture.model_dump(mode="json")
        asset_id = _stable_id(bundle.manifest.seed_version, "asset", fixture.seed_key)
        asset = _registered_entity(
            session,
            workspace_id,
            "asset",
            fixture.seed_key,
            asset_id,
            payload,
            Asset,
        )
        if asset is None:
            asset = Asset(
                id=asset_id,
                workspace_id=workspace_id,
                category_id=category.id,
                branch_id=branch.id,
                name=fixture.name,
                code=fixture.code.strip().upper(),
                acquisition_value=fixture.acquisition_value,
                status=fixture.status,
                location=fixture.location,
                purchase_date=fixture.purchase_date,
                notes=fixture.notes,
                creation_idempotency_key=(
                    f"demo:{bundle.manifest.seed_version}:asset:{fixture.seed_key}"
                ),
                request_fingerprint=_checksum(payload),
                created_by_platform_user_id=actor_id,
                updated_by_platform_user_id=actor_id,
            )
            session.add(asset)
            session.flush()
            _register(
                session,
                workspace_id,
                "asset",
                fixture.seed_key,
                asset.id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            asset.category_id = category.id
            asset.branch_id = branch.id
            asset.name = fixture.name
            asset.code = fixture.code.strip().upper()
            asset.acquisition_value = fixture.acquisition_value
            asset.status = fixture.status
            asset.location = fixture.location
            asset.purchase_date = fixture.purchase_date
            asset.notes = fixture.notes
            asset.request_fingerprint = _checksum(payload)
            asset.updated_by_platform_user_id = actor_id
    session.flush()
    return len(bundle.inventory.assets)


def _seed_customers(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> None:
    actor_id = _stable_id(bundle.manifest.seed_version, "platform_user", "admin")
    for fixture in bundle.customers.items:
        payload = fixture.model_dump(mode="json")
        customer_id = _stable_id(bundle.manifest.seed_version, "customer", fixture.seed_key)
        customer = _registered_entity(
            session,
            workspace_id,
            "customer",
            fixture.seed_key,
            customer_id,
            payload,
            Customer,
        )
        normalized_email = str(fixture.email).casefold() if fixture.email else None
        normalized_phone = (
            "".join(character for character in fixture.phone if character.isdigit())
            if fixture.phone
            else None
        )
        if customer is None:
            customer = Customer(
                id=customer_id,
                workspace_id=workspace_id,
                customer_type=fixture.customer_type,
                display_name=fixture.display_name,
                normalized_name=fixture.display_name.casefold(),
                first_name=fixture.first_name,
                last_name=fixture.last_name,
                business_name=fixture.business_name,
                email=str(fixture.email) if fixture.email else None,
                normalized_email=normalized_email,
                phone=fixture.phone,
                normalized_phone=normalized_phone,
                status=fixture.status,
                created_by_platform_user_id=actor_id,
                updated_by_platform_user_id=actor_id,
            )
            session.add(customer)
            session.flush()
            _register(
                session,
                workspace_id,
                "customer",
                fixture.seed_key,
                customer_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            customer.customer_type = fixture.customer_type
            customer.display_name = fixture.display_name
            customer.normalized_name = fixture.display_name.casefold()
            customer.first_name = fixture.first_name
            customer.last_name = fixture.last_name
            customer.business_name = fixture.business_name
            customer.email = str(fixture.email) if fixture.email else None
            customer.normalized_email = normalized_email
            customer.phone = fixture.phone
            customer.normalized_phone = normalized_phone
            customer.status = fixture.status
            customer.updated_by_platform_user_id = actor_id
        _sync_customer_branches(
            session,
            bundle,
            workspace_id,
            fixture.seed_key,
            customer,
            branches,
            fixture.branch_codes,
        )
    session.flush()


def _sync_customer_branches(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    customer_seed_key: str,
    customer: Customer,
    branches: dict[str, Branch],
    branch_codes: list[str],
) -> None:
    existing = {
        row.branch_id: row
        for row in session.scalars(
            select(CustomerBranchAssignment).where(
                CustomerBranchAssignment.workspace_id == workspace_id,
                CustomerBranchAssignment.customer_id == customer.id,
            )
        )
    }
    selected_ids = {branches[code].id for code in branch_codes}
    for branch_id, assignment in existing.items():
        assignment.status = "active" if branch_id in selected_ids else "inactive"
    for code in branch_codes:
        branch = branches[code]
        if branch.id in existing:
            continue
        seed_key = f"{customer_seed_key}:{code}"
        payload = {"customerSeedKey": customer_seed_key, "branchCode": code}
        entity_id = _stable_id(bundle.manifest.seed_version, "customer_branch", seed_key)
        registered_assignment = _registered_entity(
            session,
            workspace_id,
            "customer_branch",
            seed_key,
            entity_id,
            payload,
            CustomerBranchAssignment,
        )
        if registered_assignment is None:
            session.add(
                CustomerBranchAssignment(
                    id=entity_id,
                    workspace_id=workspace_id,
                    customer_id=customer.id,
                    branch_id=branch.id,
                    status="active",
                )
            )
            session.flush()
            _register(
                session,
                workspace_id,
                "customer_branch",
                seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )


def _seed_crm(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> tuple[int, int, int, int]:
    """Seed an understandable CRM journey before quotes and sales are installed."""

    weights = {**DEFAULT_SCORING_WEIGHTS, **bundle.crm.scoring_weights}
    admin_id = _stable_id(bundle.manifest.seed_version, "platform_user", "admin")
    settings_row = session.scalar(
        select(CrmSettings).where(CrmSettings.workspace_id == workspace_id)
    )
    if settings_row is None:
        settings_row = CrmSettings(
            id=_stable_id(bundle.manifest.seed_version, "crm_settings", "default"),
            workspace_id=workspace_id,
            scoring_weights=weights,
            updated_by_platform_user_id=admin_id,
        )
        session.add(settings_row)
    else:
        settings_row.scoring_weights = weights
        settings_row.updated_by_platform_user_id = admin_id

    customer_fixtures = {item.seed_key: item for item in bundle.customers.items}
    for profile_fixture in bundle.crm.customer_profiles:
        customer = _required_demo_customer(
            session, bundle.manifest.seed_version, profile_fixture.customer_seed_key
        )
        payload = profile_fixture.model_dump(mode="json")
        profile_registry = session.scalar(
            select(DemoSeedRegistry).where(
                DemoSeedRegistry.workspace_id == workspace_id,
                DemoSeedRegistry.entity_type == "customer_crm_profile",
                DemoSeedRegistry.seed_key == profile_fixture.customer_seed_key,
            )
        )
        existing_profile = session.scalar(
            select(CustomerCrmProfile).where(
                CustomerCrmProfile.workspace_id == workspace_id,
                CustomerCrmProfile.customer_id == customer.id,
            )
        )
        entity_id = (
            profile_registry.entity_id
            if profile_registry is not None
            else (
                existing_profile.id
                if existing_profile is not None
                else _stable_id(
                    bundle.manifest.seed_version,
                    "customer_crm_profile",
                    profile_fixture.customer_seed_key,
                )
            )
        )
        profile = (
            _registered_entity(
                session,
                workspace_id,
                "customer_crm_profile",
                profile_fixture.customer_seed_key,
                entity_id,
                payload,
                CustomerCrmProfile,
            )
            if profile_registry is not None
            else existing_profile
        )
        profile_values: dict[str, object] = {
            "workspace_id": workspace_id,
            "customer_id": customer.id,
            "lifecycle_status": profile_fixture.lifecycle_status,
            "loyalty_points": customer_fixtures[profile_fixture.customer_seed_key].points,
            "notes": profile_fixture.notes,
            "created_by_platform_user_id": admin_id,
            "updated_by_platform_user_id": admin_id,
        }
        if profile is None:
            profile = CustomerCrmProfile(id=entity_id, **profile_values)
            session.add(profile)
            session.flush()
        else:
            _assign_demo_values(profile, profile_values)
        if profile_registry is None:
            _register(
                session,
                workspace_id,
                "customer_crm_profile",
                profile_fixture.customer_seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )

    leads: dict[str, CrmLead] = {}
    for lead_fixture in bundle.crm.leads:
        payload = lead_fixture.model_dump(mode="json")
        scoring = compute_auto_score(payload, weights)
        converted_customer = (
            _required_demo_customer(
                session,
                bundle.manifest.seed_version,
                lead_fixture.converted_customer_seed_key,
            )
            if lead_fixture.converted_customer_seed_key
            else None
        )
        actor_id = _stable_id(
            bundle.manifest.seed_version,
            "platform_user",
            lead_fixture.assigned_user_seed_key,
        )
        conversion_payload = {
            "leadSeedKey": lead_fixture.seed_key,
            "customerSeedKey": lead_fixture.converted_customer_seed_key,
        }
        score = (
            lead_fixture.score_manual if lead_fixture.score_manual is not None else scoring.score
        )
        lead_values: dict[str, object] = {
            "workspace_id": workspace_id,
            "branch_id": branches[lead_fixture.branch_code].id,
            "assigned_membership_id": _stable_id(
                bundle.manifest.seed_version,
                "membership",
                lead_fixture.assigned_user_seed_key,
            ),
            "name": lead_fixture.name,
            "company": lead_fixture.company,
            "email": str(lead_fixture.email) if lead_fixture.email else None,
            "phone": lead_fixture.phone,
            "website": lead_fixture.website,
            "location": lead_fixture.location,
            "source": lead_fixture.source,
            "source_url": lead_fixture.source_url,
            "scraped_at": lead_fixture.scraped_at,
            "raw_snippet": lead_fixture.raw_snippet,
            "status": lead_fixture.status,
            "score_auto": scoring.score,
            "score_manual": lead_fixture.score_manual,
            "score": score,
            "module_fits": scoring.module_fits,
            "score_reasons": scoring.reasons,
            "score_notes": lead_fixture.score_notes,
            "converted_customer_id": converted_customer.id if converted_customer else None,
            "converted_at": lead_fixture.updated_at if converted_customer else None,
            "creation_idempotency_key": (
                f"demo:{bundle.manifest.seed_version}:lead:{lead_fixture.seed_key}"
            ),
            "request_fingerprint": _checksum(payload),
            "conversion_idempotency_key": (
                f"demo:{bundle.manifest.seed_version}:convert:{lead_fixture.seed_key}"
                if converted_customer
                else None
            ),
            "conversion_request_fingerprint": (
                _checksum(conversion_payload) if converted_customer else None
            ),
            "created_by_platform_user_id": actor_id,
            "updated_by_platform_user_id": actor_id,
            "created_at": lead_fixture.created_at,
            "updated_at": lead_fixture.updated_at,
        }
        entity_id = _stable_id(bundle.manifest.seed_version, "crm_lead", lead_fixture.seed_key)
        lead = _registered_entity(
            session,
            workspace_id,
            "crm_lead",
            lead_fixture.seed_key,
            entity_id,
            payload,
            CrmLead,
        )
        if lead is None:
            lead = CrmLead(id=entity_id, **lead_values)
            session.add(lead)
            session.flush()
            _register(
                session,
                workspace_id,
                "crm_lead",
                lead_fixture.seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            _assign_demo_values(lead, lead_values)
        leads[lead_fixture.seed_key] = lead

    opportunities: dict[str, CrmOpportunity] = {}
    for opportunity_fixture in bundle.crm.opportunities:
        payload = opportunity_fixture.model_dump(mode="json")
        actor_id = _stable_id(
            bundle.manifest.seed_version,
            "platform_user",
            opportunity_fixture.assigned_user_seed_key,
        )
        opportunity_customer = (
            _required_demo_customer(
                session,
                bundle.manifest.seed_version,
                opportunity_fixture.customer_seed_key,
            )
            if opportunity_fixture.customer_seed_key
            else None
        )
        opportunity_values: dict[str, object] = {
            "workspace_id": workspace_id,
            "branch_id": branches[opportunity_fixture.branch_code].id,
            "lead_id": (
                leads[opportunity_fixture.lead_seed_key].id
                if opportunity_fixture.lead_seed_key
                else None
            ),
            "customer_id": opportunity_customer.id if opportunity_customer else None,
            "assigned_membership_id": _stable_id(
                bundle.manifest.seed_version,
                "membership",
                opportunity_fixture.assigned_user_seed_key,
            ),
            "title": opportunity_fixture.title,
            "customer_name": opportunity_fixture.customer_name,
            "stage": opportunity_fixture.stage,
            "value": opportunity_fixture.value,
            "currency_code": opportunity_fixture.currency_code.upper(),
            "notes": opportunity_fixture.notes,
            "lost_reason": opportunity_fixture.lost_reason,
            "closed_at": opportunity_fixture.closed_at,
            "creation_idempotency_key": (
                f"demo:{bundle.manifest.seed_version}:opportunity:{opportunity_fixture.seed_key}"
            ),
            "request_fingerprint": _checksum(payload),
            "created_by_platform_user_id": actor_id,
            "updated_by_platform_user_id": actor_id,
            "created_at": opportunity_fixture.created_at,
            "updated_at": opportunity_fixture.updated_at,
        }
        entity_id = _stable_id(
            bundle.manifest.seed_version,
            "crm_opportunity",
            opportunity_fixture.seed_key,
        )
        opportunity = _registered_entity(
            session,
            workspace_id,
            "crm_opportunity",
            opportunity_fixture.seed_key,
            entity_id,
            payload,
            CrmOpportunity,
        )
        if opportunity is None:
            opportunity = CrmOpportunity(id=entity_id, **opportunity_values)
            session.add(opportunity)
            session.flush()
            _register(
                session,
                workspace_id,
                "crm_opportunity",
                opportunity_fixture.seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            _assign_demo_values(opportunity, opportunity_values)
        opportunities[opportunity_fixture.seed_key] = opportunity

    for activity_fixture in bundle.crm.activities:
        payload = activity_fixture.model_dump(mode="json")
        actor_id = _stable_id(
            bundle.manifest.seed_version,
            "platform_user",
            activity_fixture.assigned_user_seed_key,
        )
        activity_customer = (
            _required_demo_customer(
                session, bundle.manifest.seed_version, activity_fixture.customer_seed_key
            )
            if activity_fixture.customer_seed_key
            else None
        )
        activity_values: dict[str, object] = {
            "workspace_id": workspace_id,
            "branch_id": branches[activity_fixture.branch_code].id,
            "lead_id": (
                leads[activity_fixture.lead_seed_key].id if activity_fixture.lead_seed_key else None
            ),
            "opportunity_id": (
                opportunities[activity_fixture.opportunity_seed_key].id
                if activity_fixture.opportunity_seed_key
                else None
            ),
            "customer_id": activity_customer.id if activity_customer else None,
            "assigned_membership_id": _stable_id(
                bundle.manifest.seed_version,
                "membership",
                activity_fixture.assigned_user_seed_key,
            ),
            "activity_type": activity_fixture.activity_type,
            "title": activity_fixture.title,
            "description": activity_fixture.description,
            "customer_name": activity_fixture.customer_name,
            "due_at": activity_fixture.due_at,
            "completed_at": activity_fixture.completed_at,
            "creation_idempotency_key": (
                f"demo:{bundle.manifest.seed_version}:activity:{activity_fixture.seed_key}"
            ),
            "request_fingerprint": _checksum(payload),
            "created_by_platform_user_id": actor_id,
            "updated_by_platform_user_id": actor_id,
            "created_at": activity_fixture.created_at,
            "updated_at": activity_fixture.updated_at,
        }
        entity_id = _stable_id(
            bundle.manifest.seed_version, "crm_activity", activity_fixture.seed_key
        )
        activity = _registered_entity(
            session,
            workspace_id,
            "crm_activity",
            activity_fixture.seed_key,
            entity_id,
            payload,
            CrmActivity,
        )
        if activity is None:
            activity = CrmActivity(id=entity_id, **activity_values)
            session.add(activity)
            session.flush()
            _register(
                session,
                workspace_id,
                "crm_activity",
                activity_fixture.seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            _assign_demo_values(activity, activity_values)
    session.flush()
    return (
        len(bundle.crm.customer_profiles),
        len(bundle.crm.leads),
        len(bundle.crm.opportunities),
        len(bundle.crm.activities),
    )


def _required_demo_customer(session: Session, seed_version: str, seed_key: str) -> Customer:
    customer = session.get(Customer, _stable_id(seed_version, "customer", seed_key))
    if customer is None:
        raise RuntimeError(f"Demo customer {seed_key!r} is missing.")
    return customer


def _assign_demo_values(entity: object, values: dict[str, object]) -> None:
    for field_name, value in values.items():
        setattr(entity, field_name, value)


def _seed_employees(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> None:
    actor_id = _stable_id(bundle.manifest.seed_version, "platform_user", "admin")
    employees: dict[str, Employee] = {}
    for fixture in bundle.employees.items:
        payload = fixture.model_dump(mode="json")
        employee_id = _stable_id(bundle.manifest.seed_version, "employee", fixture.seed_key)
        employee = _registered_entity(
            session,
            workspace_id,
            "employee",
            fixture.seed_key,
            employee_id,
            payload,
            Employee,
        )
        platform_user_id = (
            _stable_id(bundle.manifest.seed_version, "platform_user", fixture.user_seed_key)
            if fixture.user_seed_key
            else None
        )
        normalized_email = str(fixture.email).casefold() if fixture.email else None
        normalized_phone = (
            "".join(character for character in fixture.phone if character.isdigit())
            if fixture.phone
            else None
        )
        if employee is None:
            employee = Employee(
                id=employee_id,
                workspace_id=workspace_id,
                employee_number=fixture.employee_number,
                first_name=fixture.first_name,
                last_name=fixture.last_name,
                normalized_name=f"{fixture.first_name} {fixture.last_name}".casefold(),
                email=str(fixture.email) if fixture.email else None,
                normalized_email=normalized_email,
                phone=fixture.phone,
                normalized_phone=normalized_phone,
                position=fixture.position,
                department=fixture.department,
                contract_type=fixture.contract_type,
                hire_date=fixture.hire_date,
                platform_user_id=platform_user_id,
                status=fixture.status,
                created_by_platform_user_id=actor_id,
                updated_by_platform_user_id=actor_id,
            )
            session.add(employee)
            session.flush()
            _register(
                session,
                workspace_id,
                "employee",
                fixture.seed_key,
                employee_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            employee.employee_number = fixture.employee_number
            employee.first_name = fixture.first_name
            employee.last_name = fixture.last_name
            employee.normalized_name = f"{fixture.first_name} {fixture.last_name}".casefold()
            employee.email = str(fixture.email) if fixture.email else None
            employee.normalized_email = normalized_email
            employee.phone = fixture.phone
            employee.normalized_phone = normalized_phone
            employee.position = fixture.position
            employee.department = fixture.department
            employee.contract_type = fixture.contract_type
            employee.hire_date = fixture.hire_date
            employee.platform_user_id = platform_user_id
            employee.status = fixture.status
            employee.updated_by_platform_user_id = actor_id
        employees[fixture.seed_key] = employee
        _sync_employee_branches(
            session,
            bundle,
            workspace_id,
            fixture.seed_key,
            employee,
            branches,
            fixture.branch_codes,
        )
        _sync_employee_schedule(session, bundle, workspace_id, fixture, employee, actor_id)
        _sync_employee_hr_profile(session, bundle, workspace_id, fixture, employee, actor_id)

    for fixture in bundle.employees.items:
        _sync_employee_supervisors(
            session,
            bundle,
            workspace_id,
            fixture.seed_key,
            employees[fixture.seed_key],
            employees,
            fixture.supervisor_seed_keys,
        )
    session.flush()


def _sync_employee_hr_profile(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    fixture: DemoEmployeeFixture,
    employee: Employee,
    actor_id: UUID,
) -> None:
    payload = fixture.future_hr
    entity_id = _stable_id(bundle.manifest.seed_version, "employee_hr_profile", fixture.seed_key)
    profile = _registered_entity(
        session,
        workspace_id,
        "employee_hr_profile",
        fixture.seed_key,
        entity_id,
        payload,
        EmployeeHrProfile,
    )
    values = {
        "initial_salary": Decimal(str(payload.get("initialSalary", 0))),
        "current_salary": Decimal(str(payload.get("salary", 0))),
        "vacation_days": int(payload.get("vacationDays", 0)),
        "bank_name": payload.get("bankName"),
        "bank_account_type": payload.get("bankAccountType"),
        "bank_account_number": payload.get("bankAccountNumber"),
        "bank_document": payload.get("bankDocument"),
    }
    if profile is None:
        profile = session.scalar(
            select(EmployeeHrProfile).where(
                EmployeeHrProfile.workspace_id == workspace_id,
                EmployeeHrProfile.employee_id == employee.id,
            )
        )
        if profile is None:
            profile = EmployeeHrProfile(
                id=entity_id,
                workspace_id=workspace_id,
                employee_id=employee.id,
                updated_by_platform_user_id=actor_id,
                **values,
            )
            session.add(profile)
        else:
            profile.id = entity_id
            for field, value in values.items():
                setattr(profile, field, value)
            profile.updated_by_platform_user_id = actor_id
        session.flush()
        _register(
            session,
            workspace_id,
            "employee_hr_profile",
            fixture.seed_key,
            entity_id,
            bundle.manifest.seed_version,
            payload,
        )
    else:
        for field, value in values.items():
            setattr(profile, field, value)
        profile.updated_by_platform_user_id = actor_id


def _seed_hr(session: Session, bundle: DemoBundle, workspace_id: UUID) -> None:
    for leave_fixture in bundle.hr.leave_requests:
        payload = leave_fixture.model_dump(mode="json")
        entity_id = _stable_id(
            bundle.manifest.seed_version, "hr_leave_request", leave_fixture.seed_key
        )
        record = _registered_entity(
            session,
            workspace_id,
            "hr_leave_request",
            leave_fixture.seed_key,
            entity_id,
            payload,
            HrLeaveRequest,
        )
        employee_id = _stable_id(
            bundle.manifest.seed_version, "employee", leave_fixture.employee_seed_key
        )
        requester_id = _stable_id(
            bundle.manifest.seed_version,
            "platform_user",
            leave_fixture.requested_by_user_seed_key,
        )
        reviewer_id = (
            _stable_id(
                bundle.manifest.seed_version,
                "platform_user",
                leave_fixture.reviewed_by_user_seed_key,
            )
            if leave_fixture.reviewed_by_user_seed_key
            else None
        )
        if record is None:
            record = HrLeaveRequest(
                id=entity_id,
                workspace_id=workspace_id,
                employee_id=employee_id,
                start_date=leave_fixture.start_date,
                end_date=leave_fixture.end_date,
                reason=leave_fixture.reason,
                status=leave_fixture.status,
                requested_by_platform_user_id=requester_id,
                reviewed_by_platform_user_id=reviewer_id,
                reviewed_at=leave_fixture.reviewed_at,
            )
            session.add(record)
            session.flush()
            _register(
                session,
                workspace_id,
                "hr_leave_request",
                leave_fixture.seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            record.employee_id = employee_id
            record.start_date = leave_fixture.start_date
            record.end_date = leave_fixture.end_date
            record.reason = leave_fixture.reason
            record.status = leave_fixture.status
            record.requested_by_platform_user_id = requester_id
            record.reviewed_by_platform_user_id = reviewer_id
            record.reviewed_at = leave_fixture.reviewed_at

    for debt_fixture in bundle.hr.debts:
        payload = debt_fixture.model_dump(mode="json")
        debt_id = _stable_id(bundle.manifest.seed_version, "employee_debt", debt_fixture.seed_key)
        debt = _registered_entity(
            session,
            workspace_id,
            "employee_debt",
            debt_fixture.seed_key,
            debt_id,
            payload,
            EmployeeDebt,
        )
        employee_id = _stable_id(
            bundle.manifest.seed_version, "employee", debt_fixture.employee_seed_key
        )
        actor_id = _stable_id(
            bundle.manifest.seed_version,
            "platform_user",
            debt_fixture.created_by_user_seed_key,
        )
        if debt is None:
            debt = EmployeeDebt(
                id=debt_id,
                workspace_id=workspace_id,
                employee_id=employee_id,
                concept=debt_fixture.concept,
                client_name=debt_fixture.client_name,
                amount=debt_fixture.amount,
                idempotency_key=(
                    f"demo:{bundle.manifest.seed_version}:debt:{debt_fixture.seed_key}"
                ),
                created_by_platform_user_id=actor_id,
            )
            session.add(debt)
            session.flush()
            _register(
                session,
                workspace_id,
                "employee_debt",
                debt_fixture.seed_key,
                debt_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            debt.employee_id = employee_id
            debt.concept = debt_fixture.concept
            debt.client_name = debt_fixture.client_name
            debt.amount = debt_fixture.amount
            debt.created_by_platform_user_id = actor_id

        for payment_fixture in debt_fixture.payments:
            payment_payload = payment_fixture.model_dump(mode="json")
            payment_id = _stable_id(
                bundle.manifest.seed_version,
                "employee_debt_payment",
                payment_fixture.seed_key,
            )
            payment = _registered_entity(
                session,
                workspace_id,
                "employee_debt_payment",
                payment_fixture.seed_key,
                payment_id,
                payment_payload,
                EmployeeDebtPayment,
            )
            received_by_id = _stable_id(
                bundle.manifest.seed_version,
                "platform_user",
                payment_fixture.received_by_user_seed_key,
            )
            if payment is None:
                payment = EmployeeDebtPayment(
                    id=payment_id,
                    workspace_id=workspace_id,
                    debt_id=debt.id,
                    amount=payment_fixture.amount,
                    paid_on=payment_fixture.paid_on,
                    idempotency_key=(
                        f"demo:{bundle.manifest.seed_version}:payment:{payment_fixture.seed_key}"
                    ),
                    received_by_platform_user_id=received_by_id,
                )
                session.add(payment)
                session.flush()
                _register(
                    session,
                    workspace_id,
                    "employee_debt_payment",
                    payment_fixture.seed_key,
                    payment_id,
                    bundle.manifest.seed_version,
                    payment_payload,
                )
            else:
                payment.debt_id = debt.id
                payment.amount = payment_fixture.amount
                payment.paid_on = payment_fixture.paid_on
                payment.received_by_platform_user_id = received_by_id

    for document_fixture in bundle.hr.documents:
        payload = document_fixture.model_dump(mode="json")
        document_id = _stable_id(
            bundle.manifest.seed_version, "hr_document", document_fixture.seed_key
        )
        document = _registered_entity(
            session,
            workspace_id,
            "hr_document",
            document_fixture.seed_key,
            document_id,
            payload,
            HrDocumentRecord,
        )
        employee_id = _stable_id(
            bundle.manifest.seed_version, "employee", document_fixture.employee_seed_key
        )
        actor_id = _stable_id(
            bundle.manifest.seed_version,
            "platform_user",
            document_fixture.created_by_user_seed_key,
        )
        snapshot = {"employeeSeedKey": document_fixture.employee_seed_key}
        if document is None:
            document = HrDocumentRecord(
                id=document_id,
                workspace_id=workspace_id,
                employee_id=employee_id,
                template_id=document_fixture.template_id,
                issue_date=document_fixture.issue_date,
                include_salary=document_fixture.include_salary,
                reference_code=(
                    f"DEMO-{document_fixture.issue_date.year}-{document_fixture.seed_key.upper()}"
                ),
                snapshot=snapshot,
                idempotency_key=(
                    f"demo:{bundle.manifest.seed_version}:document:{document_fixture.seed_key}"
                ),
                created_by_platform_user_id=actor_id,
            )
            session.add(document)
            session.flush()
            _register(
                session,
                workspace_id,
                "hr_document",
                document_fixture.seed_key,
                document_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            document.employee_id = employee_id
            document.template_id = document_fixture.template_id
            document.issue_date = document_fixture.issue_date
            document.include_salary = document_fixture.include_salary
            document.snapshot = snapshot
            document.created_by_platform_user_id = actor_id
    session.flush()


def _sync_employee_branches(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    employee_seed_key: str,
    employee: Employee,
    branches: dict[str, Branch],
    branch_codes: list[str],
) -> None:
    existing = {
        row.branch_id: row
        for row in session.scalars(
            select(EmployeeBranchAssignment).where(
                EmployeeBranchAssignment.workspace_id == workspace_id,
                EmployeeBranchAssignment.employee_id == employee.id,
            )
        )
    }
    selected_ids = {branches[code].id for code in branch_codes}
    for branch_id, assignment in existing.items():
        assignment.status = "active" if branch_id in selected_ids else "inactive"
    for code in branch_codes:
        branch = branches[code]
        if branch.id in existing:
            continue
        seed_key = f"{employee_seed_key}:{code}"
        payload = {"employeeSeedKey": employee_seed_key, "branchCode": code}
        entity_id = _stable_id(bundle.manifest.seed_version, "employee_branch", seed_key)
        if (
            _registered_entity(
                session,
                workspace_id,
                "employee_branch",
                seed_key,
                entity_id,
                payload,
                EmployeeBranchAssignment,
            )
            is None
        ):
            session.add(
                EmployeeBranchAssignment(
                    id=entity_id,
                    workspace_id=workspace_id,
                    employee_id=employee.id,
                    branch_id=branch.id,
                    status="active",
                )
            )
            session.flush()
            _register(
                session,
                workspace_id,
                "employee_branch",
                seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )


def _sync_employee_schedule(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    fixture: DemoEmployeeFixture,
    employee: Employee,
    actor_id: UUID,
) -> None:
    payload = {"timezone": fixture.timezone, "workSchedule": fixture.work_schedule}
    entity_id = _stable_id(bundle.manifest.seed_version, "employee_schedule", fixture.seed_key)
    schedule = _registered_entity(
        session,
        workspace_id,
        "employee_schedule",
        fixture.seed_key,
        entity_id,
        payload,
        EmployeeSchedule,
    )
    if schedule is None:
        schedule = EmployeeSchedule(
            id=entity_id,
            workspace_id=workspace_id,
            employee_id=employee.id,
            timezone=fixture.timezone,
            weekly_schedule=fixture.work_schedule,
            updated_by_platform_user_id=actor_id,
        )
        session.add(schedule)
        session.flush()
        _register(
            session,
            workspace_id,
            "employee_schedule",
            fixture.seed_key,
            entity_id,
            bundle.manifest.seed_version,
            payload,
        )
    else:
        schedule.timezone = fixture.timezone
        schedule.weekly_schedule = fixture.work_schedule
        schedule.updated_by_platform_user_id = actor_id


def _sync_employee_supervisors(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    employee_seed_key: str,
    employee: Employee,
    employees: dict[str, Employee],
    supervisor_seed_keys: list[str],
) -> None:
    existing = {
        row.supervisor_employee_id: row
        for row in session.scalars(
            select(EmployeeSupervisor).where(
                EmployeeSupervisor.workspace_id == workspace_id,
                EmployeeSupervisor.employee_id == employee.id,
            )
        )
    }
    selected_ids = {employees[key].id for key in supervisor_seed_keys}
    for supervisor_id, assignment in existing.items():
        assignment.status = "active" if supervisor_id in selected_ids else "inactive"
    for supervisor_seed_key in supervisor_seed_keys:
        supervisor = employees[supervisor_seed_key]
        if supervisor.id in existing:
            continue
        seed_key = f"{employee_seed_key}:{supervisor_seed_key}"
        payload = {"employeeSeedKey": employee_seed_key, "supervisorSeedKey": supervisor_seed_key}
        entity_id = _stable_id(bundle.manifest.seed_version, "employee_supervisor", seed_key)
        if (
            _registered_entity(
                session,
                workspace_id,
                "employee_supervisor",
                seed_key,
                entity_id,
                payload,
                EmployeeSupervisor,
            )
            is None
        ):
            session.add(
                EmployeeSupervisor(
                    id=entity_id,
                    workspace_id=workspace_id,
                    employee_id=employee.id,
                    supervisor_employee_id=supervisor.id,
                    status="active",
                )
            )
            session.flush()
            _register(
                session,
                workspace_id,
                "employee_supervisor",
                seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )


def _seed_branches(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    legal_entity_id: UUID,
) -> dict[str, Branch]:
    branches = {
        branch.code: branch
        for branch in session.scalars(select(Branch).where(Branch.workspace_id == workspace_id))
    }
    for fixture in bundle.foundation.branches:
        payload = fixture.model_dump(mode="json")
        existing_branch = branches.get(fixture.code)
        registered_entity_id = session.scalar(
            select(DemoSeedRegistry.entity_id).where(
                DemoSeedRegistry.workspace_id == workspace_id,
                DemoSeedRegistry.entity_type == "branch",
                DemoSeedRegistry.seed_key == fixture.seed_key,
            )
        )
        entity_id = (
            registered_entity_id
            or (existing_branch.id if existing_branch is not None else None)
            or _stable_id(bundle.manifest.seed_version, "branch", fixture.seed_key)
        )
        branch: Branch | None
        if registered_entity_id is None and existing_branch is not None:
            branch = existing_branch
            _register(
                session,
                workspace_id,
                "branch",
                fixture.seed_key,
                branch.id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            branch = _registered_entity(
                session, workspace_id, "branch", fixture.seed_key, entity_id, payload, Branch
            )
        if branch is None:
            branch = Branch(
                id=entity_id,
                workspace_id=workspace_id,
                legal_entity_id=legal_entity_id,
                code=fixture.code,
                name=fixture.name,
                status="active",
                timezone=fixture.timezone,
                configuration={
                    "partners": [partner.model_dump(mode="json") for partner in fixture.partners]
                },
            )
            session.add(branch)
            session.flush()
            _register(
                session,
                workspace_id,
                "branch",
                fixture.seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            branch.code = fixture.code
            branch.name = fixture.name
            branch.timezone = fixture.timezone
            branch.status = "active"
            branch.configuration = {
                **(branch.configuration or {}),
                "partners": [partner.model_dump(mode="json") for partner in fixture.partners],
            }
        branches[branch.code] = branch

    for branch in branches.values():
        scope = session.scalar(
            select(AccessScope).where(
                AccessScope.workspace_id == workspace_id,
                AccessScope.scope_type == "branch",
                AccessScope.branch_id == branch.id,
            )
        )
        if scope is None:
            session.add(
                AccessScope(
                    workspace_id=workspace_id,
                    scope_type="branch",
                    legal_entity_id=branch.legal_entity_id,
                    branch_id=branch.id,
                )
            )
        _seed_appointment_resources(session, bundle, workspace_id, branch)
    session.flush()
    return branches


def _seed_appointment_resources(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branch: Branch,
) -> None:
    for code, name in DEFAULT_APPOINTMENT_RESOURCES:
        resource = session.scalar(
            select(AppointmentResource).where(
                AppointmentResource.workspace_id == workspace_id,
                AppointmentResource.branch_id == branch.id,
                AppointmentResource.code == code,
            )
        )
        if resource is None:
            resource = AppointmentResource(
                id=_stable_id(
                    bundle.manifest.seed_version,
                    "appointment_resource",
                    f"{branch.code}:{code}",
                ),
                workspace_id=workspace_id,
                branch_id=branch.id,
                code=code,
                name=name,
                resource_type="room",
                status="active",
            )
            session.add(resource)
        else:
            resource.name = name
            resource.resource_type = "room"
            resource.status = "active"


def _seed_role_permissions(session: Session, bundle: DemoBundle, workspace_id: UUID) -> None:
    roles = {
        role.code: role
        for role in session.scalars(select(Role).where(Role.workspace_id == workspace_id))
    }
    permissions = {
        permission.code: permission
        for permission in session.scalars(
            select(Permission).where(Permission.is_platform_only.is_(False))
        )
    }
    for role_code, permission_codes in bundle.iam.role_permissions.items():
        role = roles.get(role_code)
        if role is None:
            raise RuntimeError(f"Demo role {role_code!r} is not installed.")
        for permission_code in permission_codes:
            permission = permissions.get(permission_code)
            if permission is None:
                raise RuntimeError(f"Demo permission {permission_code!r} is not installed.")
            if (
                session.scalar(
                    select(RolePermission.id).where(
                        RolePermission.workspace_id == workspace_id,
                        RolePermission.role_id == role.id,
                        RolePermission.permission_id == permission.id,
                    )
                )
                is None
            ):
                session.add(
                    RolePermission(
                        workspace_id=workspace_id,
                        role_id=role.id,
                        permission_id=permission.id,
                    )
                )
    session.flush()


def _seed_users(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
    password_hash: str,
) -> None:
    now = datetime.now(UTC)
    roles = {
        role.code: role
        for role in session.scalars(select(Role).where(Role.workspace_id == workspace_id))
    }
    workspace_scope = session.scalar(
        select(AccessScope).where(
            AccessScope.workspace_id == workspace_id,
            AccessScope.scope_type == "workspace",
        )
    )
    if workspace_scope is None:
        raise RuntimeError("The demo workspace scope is missing.")

    for fixture in bundle.iam.users:
        payload = fixture.model_dump(mode="json")
        user_id = _stable_id(bundle.manifest.seed_version, "platform_user", fixture.seed_key)
        user = _registered_entity(
            session,
            workspace_id,
            "platform_user",
            fixture.seed_key,
            user_id,
            payload,
            PlatformUser,
        )
        email = str(fixture.email).casefold()
        if user is None:
            user = PlatformUser(
                id=user_id,
                external_subject=f"demo:{bundle.manifest.seed_version}:{fixture.seed_key}",
                email=email,
                normalized_email=email,
                display_name=fixture.display_name,
                password_hash=password_hash,
                password_changed_at=now,
                status="active",
            )
            session.add(user)
            session.flush()
            _register(
                session,
                workspace_id,
                "platform_user",
                fixture.seed_key,
                user_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            user.email = email
            user.normalized_email = email
            user.display_name = fixture.display_name
            user.password_hash = password_hash
            user.password_changed_at = now
            user.status = "active"

        membership_id = _stable_id(bundle.manifest.seed_version, "membership", fixture.seed_key)
        membership = _registered_entity(
            session,
            workspace_id,
            "membership",
            fixture.seed_key,
            membership_id,
            payload,
            WorkspaceMembership,
        )
        if membership is None:
            membership = WorkspaceMembership(
                id=membership_id,
                workspace_id=workspace_id,
                platform_user_id=user.id,
                status=fixture.status,
                invited_at=now,
                activated_at=now if fixture.status == "active" else None,
                is_default=True,
            )
            session.add(membership)
            session.flush()
            _register(
                session,
                workspace_id,
                "membership",
                fixture.seed_key,
                membership_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            membership.status = fixture.status
            membership.is_default = True

        role = roles.get(fixture.role_code)
        if role is None:
            raise RuntimeError(f"Demo role {fixture.role_code!r} is not installed.")
        scopes = (
            [workspace_scope]
            if fixture.workspace_wide
            else [
                _branch_scope(session, workspace_id, branches[code].id)
                for code in fixture.branch_codes
            ]
        )
        for scope in scopes:
            assignment_key = f"{fixture.seed_key}:{scope.id}"
            assignment_payload = {"roleCode": role.code, "scopeId": str(scope.id)}
            assignment_id = _stable_id(
                bundle.manifest.seed_version,
                "role_assignment",
                assignment_key,
            )
            assignment = _registered_entity(
                session,
                workspace_id,
                "role_assignment",
                assignment_key,
                assignment_id,
                assignment_payload,
                RoleAssignment,
            )
            if assignment is None:
                session.add(
                    RoleAssignment(
                        id=assignment_id,
                        workspace_id=workspace_id,
                        membership_id=membership.id,
                        role_id=role.id,
                        access_scope_id=scope.id,
                        status="active",
                        valid_from=now,
                    )
                )
                session.flush()
                _register(
                    session,
                    workspace_id,
                    "role_assignment",
                    assignment_key,
                    assignment_id,
                    bundle.manifest.seed_version,
                    assignment_payload,
                )
    session.flush()


def _seed_payment_methods(session: Session, bundle: DemoBundle, workspace_id: UUID) -> None:
    for fixture in bundle.configuration.payment_methods:
        payload = fixture.model_dump(mode="json")
        registry = session.scalar(
            select(DemoSeedRegistry).where(
                DemoSeedRegistry.workspace_id == workspace_id,
                DemoSeedRegistry.entity_type == "payment_method",
                DemoSeedRegistry.seed_key == fixture.seed_key,
            )
        )
        if registry is not None:
            entity_id = registry.entity_id
            method = _registered_entity(
                session,
                workspace_id,
                "payment_method",
                fixture.seed_key,
                entity_id,
                payload,
                PaymentMethod,
            )
        else:
            method = session.scalar(
                select(PaymentMethod).where(
                    PaymentMethod.workspace_id == workspace_id,
                    PaymentMethod.code == fixture.code,
                )
            )
            entity_id = (
                method.id
                if method is not None
                else _stable_id(
                    bundle.manifest.seed_version,
                    "payment_method",
                    fixture.seed_key,
                )
            )
        if method is None:
            method = PaymentMethod(
                id=entity_id,
                workspace_id=workspace_id,
                code=fixture.code,
                name=fixture.name,
                icon=fixture.icon,
                status="active" if fixture.enabled else "inactive",
                is_system=fixture.system,
                channel=fixture.channel,
                settlement_policy=fixture.settlement_policy,
                affects_cash_drawer=fixture.affects_cash_drawer,
                requires_evidence=fixture.requires_evidence,
            )
            session.add(method)
            session.flush()
        if registry is None:
            _register(
                session,
                workspace_id,
                "payment_method",
                fixture.seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )
        method.code = fixture.code
        method.name = fixture.name
        method.icon = fixture.icon
        method.status = "active" if fixture.enabled else "inactive"
        method.is_system = fixture.system
        method.channel = fixture.channel
        method.settlement_policy = fixture.settlement_policy
        method.affects_cash_drawer = fixture.affects_cash_drawer
        method.requires_evidence = fixture.requires_evidence
    session.flush()


def _branch_scope(session: Session, workspace_id: UUID, branch_id: UUID) -> AccessScope:
    scope = session.scalar(
        select(AccessScope).where(
            AccessScope.workspace_id == workspace_id,
            AccessScope.scope_type == "branch",
            AccessScope.branch_id == branch_id,
        )
    )
    if scope is None:
        raise RuntimeError("The demo branch scope is missing.")
    return scope
