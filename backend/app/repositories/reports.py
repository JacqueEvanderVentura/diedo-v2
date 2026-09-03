from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import cast
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, aliased

from app.db.models import (
    Appointment,
    Branch,
    Customer,
    Employee,
    EmployeeBranchAssignment,
    FinanceExpense,
    FinanceFixedExpensePayment,
    FinanceManualIncome,
    HrLeaveRequest,
    Incident,
    InventoryItemProfile,
    InventoryMovement,
    InventoryMovementLine,
    InventoryStockBalance,
    Item,
    ItemCategory,
    PlatformUser,
    Role,
    RoleAssignment,
    Sale,
    SaleLine,
    Workspace,
    WorkspaceMembership,
)


@dataclass(frozen=True)
class FinancialTransactionRecord:
    id: str
    occurred_at: datetime
    transaction_type: str
    category: str
    branch_id: UUID
    branch_name: str
    amount: Decimal


@dataclass(frozen=True)
class MembershipPurchaseRecord:
    sale_id: UUID
    customer_id: UUID
    customer_name: str
    customer_status: str
    plan_id: UUID | None
    plan_name: str
    branch_id: UUID
    branch_name: str
    quantity: Decimal
    unit_price: Decimal
    completed_at: datetime


@dataclass(frozen=True)
class AppointmentReportRecord:
    appointment: Appointment
    branch_name: str
    employee_name: str | None
    created_by_name: str
    updated_by_name: str


@dataclass(frozen=True)
class InventoryStockRecord:
    item: Item
    category: ItemCategory
    profile: InventoryItemProfile
    balance: InventoryStockBalance


@dataclass(frozen=True)
class InventorySaleRecord:
    item_id: UUID
    quantity: Decimal
    revenue: Decimal
    cost: Decimal


@dataclass(frozen=True)
class UserRoleRecord:
    user: PlatformUser
    membership: WorkspaceMembership
    role_name: str


@dataclass(frozen=True)
class SupplyUsageRecord:
    employee_id: UUID
    employee_name: str
    supply_id: UUID
    supply_name: str
    quantity: Decimal


@dataclass(frozen=True)
class EmployeeIncidentRecord:
    employee_id: UUID
    employee_name: str
    kind: str
    status: str
    count: int
    days: int


class ReportsRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def workspace(self, workspace_id: UUID) -> Workspace | None:
        return self._session.scalar(
            select(Workspace).where(Workspace.id == workspace_id, Workspace.status == "active")
        )

    def branch(self, workspace_id: UUID, branch_id: UUID) -> Branch | None:
        return self._session.scalar(
            select(Branch).where(
                Branch.workspace_id == workspace_id,
                Branch.id == branch_id,
                Branch.status == "active",
            )
        )

    @staticmethod
    def _visible_branch_ids(
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> frozenset[UUID] | None:
        if branch_id is not None:
            return frozenset({branch_id})
        return allowed_branch_ids

    def financial_transactions(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        starts_at: datetime,
        ends_at: datetime,
        starts_on: date,
        ends_on: date,
    ) -> tuple[FinancialTransactionRecord, ...]:
        visible = self._visible_branch_ids(branch_id, allowed_branch_ids)
        sale_filters = [
            Sale.workspace_id == workspace_id,
            Sale.status == "completed",
            Sale.completed_at >= starts_at,
            Sale.completed_at < ends_at,
        ]
        income_filters = [
            FinanceManualIncome.workspace_id == workspace_id,
            FinanceManualIncome.record_status == "active",
            FinanceManualIncome.income_date >= starts_on,
            FinanceManualIncome.income_date < ends_on,
        ]
        expense_filters = [
            FinanceExpense.workspace_id == workspace_id,
            FinanceExpense.record_status == "active",
            FinanceExpense.expense_date >= starts_on,
            FinanceExpense.expense_date < ends_on,
        ]
        if visible is not None:
            sale_filters.append(Sale.branch_id.in_(visible))
            income_filters.append(FinanceManualIncome.branch_id.in_(visible))
            expense_filters.append(FinanceExpense.branch_id.in_(visible))

        records: list[FinancialTransactionRecord] = []
        for sale, branch in self._session.execute(
            select(Sale, Branch)
            .join(
                Branch,
                (Branch.workspace_id == Sale.workspace_id) & (Branch.id == Sale.branch_id),
            )
            .where(*sale_filters)
        ):
            records.append(
                FinancialTransactionRecord(
                    id=f"sale-{sale.id}",
                    occurred_at=sale.completed_at,
                    transaction_type="ingreso",
                    category=sale.payment_method_name or "Venta POS",
                    branch_id=sale.branch_id,
                    branch_name=branch.name,
                    amount=sale.total,
                )
            )
        for income, branch in self._session.execute(
            select(FinanceManualIncome, Branch)
            .join(
                Branch,
                (Branch.workspace_id == FinanceManualIncome.workspace_id)
                & (Branch.id == FinanceManualIncome.branch_id),
            )
            .where(*income_filters)
        ):
            records.append(
                FinancialTransactionRecord(
                    id=f"income-{income.id}",
                    occurred_at=datetime.combine(
                        income.income_date, time(hour=12), tzinfo=starts_at.tzinfo
                    ),
                    transaction_type="ingreso",
                    category=income.category,
                    branch_id=income.branch_id,
                    branch_name=branch.name,
                    amount=income.amount,
                )
            )
        for expense, branch in self._session.execute(
            select(FinanceExpense, Branch)
            .join(
                Branch,
                (Branch.workspace_id == FinanceExpense.workspace_id)
                & (Branch.id == FinanceExpense.branch_id),
            )
            .where(*expense_filters)
        ):
            records.append(
                FinancialTransactionRecord(
                    id=f"expense-{expense.id}",
                    occurred_at=datetime.combine(
                        expense.expense_date, time(hour=12), tzinfo=starts_at.tzinfo
                    ),
                    transaction_type="gasto",
                    category=expense.category,
                    branch_id=expense.branch_id,
                    branch_name=branch.name,
                    amount=expense.amount,
                )
            )
        return tuple(records)

    def membership_purchases(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> tuple[MembershipPurchaseRecord, ...]:
        filters = [
            Sale.workspace_id == workspace_id,
            Sale.status == "completed",
            Sale.customer_id.is_not(None),
            SaleLine.item_type == "membership",
        ]
        visible = self._visible_branch_ids(branch_id, allowed_branch_ids)
        if visible is not None:
            filters.append(Sale.branch_id.in_(visible))
        rows = self._session.execute(
            select(Sale, SaleLine, Customer, Branch)
            .join(
                SaleLine,
                (SaleLine.workspace_id == Sale.workspace_id) & (SaleLine.sale_id == Sale.id),
            )
            .join(
                Customer,
                (Customer.workspace_id == Sale.workspace_id) & (Customer.id == Sale.customer_id),
            )
            .join(
                Branch,
                (Branch.workspace_id == Sale.workspace_id) & (Branch.id == Sale.branch_id),
            )
            .where(*filters)
            .order_by(Sale.completed_at, Sale.id, SaleLine.position)
        )
        return tuple(
            MembershipPurchaseRecord(
                sale_id=sale.id,
                customer_id=customer.id,
                customer_name=customer.display_name,
                customer_status=customer.status,
                plan_id=line.item_id,
                plan_name=line.item_name,
                branch_id=sale.branch_id,
                branch_name=branch.name,
                quantity=line.quantity,
                unit_price=line.unit_price,
                completed_at=sale.completed_at,
            )
            for sale, line, customer, branch in rows
        )

    def appointments(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        starts_on: date | None,
        ends_on: date | None,
        include_inactive: bool = False,
    ) -> tuple[AppointmentReportRecord, ...]:
        created_by = aliased(PlatformUser)
        updated_by = aliased(PlatformUser)
        filters = [Appointment.workspace_id == workspace_id]
        if not include_inactive:
            filters.append(Appointment.record_status == "active")
        if starts_on is not None:
            filters.append(Appointment.scheduled_date >= starts_on)
        if ends_on is not None:
            filters.append(Appointment.scheduled_date < ends_on)
        visible = self._visible_branch_ids(branch_id, allowed_branch_ids)
        if visible is not None:
            filters.append(Appointment.branch_id.in_(visible))
        rows = self._session.execute(
            select(
                Appointment,
                Branch.name,
                Employee.first_name,
                Employee.last_name,
                created_by.display_name,
                updated_by.display_name,
            )
            .join(
                Branch,
                (Branch.workspace_id == Appointment.workspace_id)
                & (Branch.id == Appointment.branch_id),
            )
            .outerjoin(
                Employee,
                (Employee.workspace_id == Appointment.workspace_id)
                & (Employee.id == Appointment.employee_id),
            )
            .join(created_by, created_by.id == Appointment.created_by_platform_user_id)
            .join(updated_by, updated_by.id == Appointment.updated_by_platform_user_id)
            .where(*filters)
        )
        return tuple(
            AppointmentReportRecord(
                appointment=row[0],
                branch_name=row[1],
                employee_name=(
                    f"{row[2]} {row[3]}".strip()
                    if row[2] is not None or row[3] is not None
                    else None
                ),
                created_by_name=row[4],
                updated_by_name=row[5],
            )
            for row in rows
        )

    def inventory_stock(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> tuple[InventoryStockRecord, ...]:
        filters = [
            Item.workspace_id == workspace_id,
            Item.item_type == "product",
            Item.status != "archived",
        ]
        visible = self._visible_branch_ids(branch_id, allowed_branch_ids)
        if visible is not None:
            filters.append(InventoryStockBalance.branch_id.in_(visible))
        rows = self._session.execute(
            select(Item, ItemCategory, InventoryItemProfile, InventoryStockBalance)
            .join(
                ItemCategory,
                (ItemCategory.workspace_id == Item.workspace_id)
                & (ItemCategory.id == Item.category_id),
            )
            .join(
                InventoryItemProfile,
                (InventoryItemProfile.workspace_id == Item.workspace_id)
                & (InventoryItemProfile.item_id == Item.id),
            )
            .join(
                InventoryStockBalance,
                (InventoryStockBalance.workspace_id == Item.workspace_id)
                & (InventoryStockBalance.item_id == Item.id),
            )
            .where(*filters)
        )
        return tuple(InventoryStockRecord(row[0], row[1], row[2], row[3]) for row in rows)

    def inventory_sales(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> tuple[InventorySaleRecord, ...]:
        filters = [
            Sale.workspace_id == workspace_id,
            Sale.status == "completed",
            SaleLine.item_type == "product",
            SaleLine.item_id.is_not(None),
        ]
        visible = self._visible_branch_ids(branch_id, allowed_branch_ids)
        if visible is not None:
            filters.append(Sale.branch_id.in_(visible))
        rows = self._session.execute(
            select(SaleLine)
            .join(
                Sale,
                (Sale.workspace_id == SaleLine.workspace_id) & (Sale.id == SaleLine.sale_id),
            )
            .where(*filters)
        )
        return tuple(
            InventorySaleRecord(
                item_id=line.item_id,
                quantity=line.quantity,
                revenue=line.line_total,
                cost=(line.unit_cost_snapshot or Decimal("0")) * line.quantity,
            )
            for (line,) in rows
        )

    def branches(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> tuple[Branch, ...]:
        filters = [Branch.workspace_id == workspace_id, Branch.status == "active"]
        visible = self._visible_branch_ids(branch_id, allowed_branch_ids)
        if visible is not None:
            filters.append(Branch.id.in_(visible))
        return tuple(self._session.scalars(select(Branch).where(*filters).order_by(Branch.name)))

    def fixed_expense_payments(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        starts_on: date,
        ends_on: date,
    ) -> tuple[FinanceFixedExpensePayment, ...]:
        filters = [
            FinanceFixedExpensePayment.workspace_id == workspace_id,
            FinanceFixedExpensePayment.paid_on >= starts_on,
            FinanceFixedExpensePayment.paid_on < ends_on,
        ]
        visible = self._visible_branch_ids(branch_id, allowed_branch_ids)
        if visible is not None:
            filters.append(FinanceFixedExpensePayment.branch_id.in_(visible))
        return tuple(self._session.scalars(select(FinanceFixedExpensePayment).where(*filters)))

    def users_with_roles(self, workspace_id: UUID) -> tuple[UserRoleRecord, ...]:
        now = datetime.now(UTC)
        rows = self._session.execute(
            select(PlatformUser, WorkspaceMembership, Role.name)
            .join(
                WorkspaceMembership,
                WorkspaceMembership.platform_user_id == PlatformUser.id,
            )
            .outerjoin(
                RoleAssignment,
                (RoleAssignment.workspace_id == WorkspaceMembership.workspace_id)
                & (RoleAssignment.membership_id == WorkspaceMembership.id)
                & (RoleAssignment.status == "active")
                & (RoleAssignment.valid_from <= now)
                & or_(
                    RoleAssignment.valid_until.is_(None),
                    RoleAssignment.valid_until >= now,
                ),
            )
            .outerjoin(
                Role,
                (Role.workspace_id == RoleAssignment.workspace_id)
                & (Role.id == RoleAssignment.role_id),
            )
            .where(
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.status == "active",
                PlatformUser.status == "active",
            )
            .order_by(PlatformUser.display_name, Role.name)
        )
        return tuple(UserRoleRecord(row[0], row[1], row[2] or "Sin rol") for row in rows)

    def sales(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        starts_at: datetime,
        ends_at: datetime,
    ) -> tuple[Sale, ...]:
        filters = [
            Sale.workspace_id == workspace_id,
            Sale.status == "completed",
            Sale.completed_at >= starts_at,
            Sale.completed_at < ends_at,
        ]
        visible = self._visible_branch_ids(branch_id, allowed_branch_ids)
        if visible is not None:
            filters.append(Sale.branch_id.in_(visible))
        return tuple(self._session.scalars(select(Sale).where(*filters)))

    def employees(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> tuple[Employee, ...]:
        statement = select(Employee).where(
            Employee.workspace_id == workspace_id,
            Employee.status != "archived",
        )
        if allowed_branch_ids is not None:
            statement = (
                statement.join(
                    EmployeeBranchAssignment,
                    (EmployeeBranchAssignment.workspace_id == Employee.workspace_id)
                    & (EmployeeBranchAssignment.employee_id == Employee.id),
                )
                .where(
                    EmployeeBranchAssignment.status == "active",
                    EmployeeBranchAssignment.branch_id.in_(allowed_branch_ids),
                )
                .distinct()
            )
        return tuple(self._session.scalars(statement.order_by(Employee.normalized_name)))

    def supply_usage(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        starts_at: datetime,
        ends_at: datetime,
    ) -> tuple[SupplyUsageRecord, ...]:
        filters = [
            InventoryMovement.workspace_id == workspace_id,
            InventoryMovement.movement_type == "outbound",
            InventoryMovement.employee_id.is_not(None),
            InventoryMovement.created_at >= starts_at,
            InventoryMovement.created_at < ends_at,
            Item.item_type == "supply",
        ]
        visible = self._visible_branch_ids(branch_id, allowed_branch_ids)
        if visible is not None:
            filters.append(InventoryMovement.branch_id.in_(visible))
        rows = self._session.execute(
            select(InventoryMovement, InventoryMovementLine, Employee, Item)
            .join(
                InventoryMovementLine,
                (InventoryMovementLine.workspace_id == InventoryMovement.workspace_id)
                & (InventoryMovementLine.movement_id == InventoryMovement.id),
            )
            .join(
                Employee,
                (Employee.workspace_id == InventoryMovement.workspace_id)
                & (Employee.id == InventoryMovement.employee_id),
            )
            .join(
                Item,
                (Item.workspace_id == InventoryMovementLine.workspace_id)
                & (Item.id == InventoryMovementLine.item_id),
            )
            .where(*filters)
        )
        return tuple(
            SupplyUsageRecord(
                employee_id=movement.employee_id,
                employee_name=f"{employee.first_name} {employee.last_name}".strip(),
                supply_id=item.id,
                supply_name=item.name,
                quantity=abs(line.quantity_delta),
            )
            for movement, line, employee, item in rows
        )

    def employee_incidents(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        starts_at: datetime,
        ends_at: datetime,
        starts_on: date,
        ends_on: date,
    ) -> tuple[EmployeeIncidentRecord, ...]:
        visible = self._visible_branch_ids(branch_id, allowed_branch_ids)
        incident_filters = [
            Incident.workspace_id == workspace_id,
            Incident.incident_type == "personal",
            Incident.employee_id.is_not(None),
            Incident.employee_incident_kind.is_not(None),
            Incident.created_at >= starts_at,
            Incident.created_at < ends_at,
        ]
        if visible is not None:
            incident_filters.append(Incident.branch_id.in_(visible))
        records = [
            EmployeeIncidentRecord(
                employee_id=cast(UUID, incident.employee_id),
                employee_name=f"{employee.first_name} {employee.last_name}".strip(),
                kind=cast(str, incident.employee_incident_kind),
                status=incident.status,
                count=1,
                days=0,
            )
            for incident, employee in self._session.execute(
                select(Incident, Employee)
                .join(
                    Employee,
                    (Employee.workspace_id == Incident.workspace_id)
                    & (Employee.id == Incident.employee_id),
                )
                .where(*incident_filters)
            )
        ]

        leave_filters = [
            HrLeaveRequest.workspace_id == workspace_id,
            HrLeaveRequest.status == "aprobada",
            HrLeaveRequest.start_date < ends_on,
            HrLeaveRequest.end_date >= starts_on,
        ]
        if visible is not None:
            leave_filters.append(
                Employee.id.in_(
                    select(EmployeeBranchAssignment.employee_id).where(
                        EmployeeBranchAssignment.workspace_id == workspace_id,
                        EmployeeBranchAssignment.status == "active",
                        EmployeeBranchAssignment.branch_id.in_(visible),
                    )
                )
            )
        for leave, employee in self._session.execute(
            select(HrLeaveRequest, Employee)
            .join(
                Employee,
                (Employee.workspace_id == HrLeaveRequest.workspace_id)
                & (Employee.id == HrLeaveRequest.employee_id),
            )
            .where(*leave_filters)
        ):
            overlap_start = max(leave.start_date, starts_on)
            overlap_end = min(leave.end_date, ends_on - timedelta(days=1))
            records.append(
                EmployeeIncidentRecord(
                    employee_id=leave.employee_id,
                    employee_name=f"{employee.first_name} {employee.last_name}".strip(),
                    kind="vacaciones",
                    status=leave.status,
                    count=1,
                    days=(overlap_end - overlap_start).days + 1,
                )
            )
        return tuple(records)
