from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import InstrumentedAttribute
from sqlalchemy.sql.elements import ColumnElement

from app.db.models import (
    Appointment,
    Branch,
    CashRegister,
    CrmActivity,
    CrmLead,
    InventoryMovement,
    InventoryStockBalance,
    Item,
    Sale,
    Workspace,
)


@dataclass(frozen=True)
class StockAlertRecord:
    balance: InventoryStockBalance
    item: Item
    branch: Branch


@dataclass(frozen=True)
class RegisterActivityRecord:
    register: CashRegister
    branch: Branch


@dataclass(frozen=True)
class InventoryActivityRecord:
    movement: InventoryMovement
    branch: Branch


class DashboardRepository:
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
    def _branch_filter(
        column: InstrumentedAttribute[UUID],
        *,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> ColumnElement[bool] | None:
        if branch_id is not None:
            return column == branch_id
        if allowed_branch_ids is not None:
            return column.in_(allowed_branch_ids)
        return None

    def revenue_total(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        starts_at: datetime,
        ends_at: datetime,
    ) -> Decimal:
        conditions = [
            Sale.workspace_id == workspace_id,
            Sale.status == "completed",
            Sale.completed_at >= starts_at,
            Sale.completed_at < ends_at,
        ]
        branch_filter = self._branch_filter(
            Sale.branch_id, branch_id=branch_id, allowed_branch_ids=allowed_branch_ids
        )
        if branch_filter is not None:
            conditions.append(branch_filter)
        total = self._session.scalar(
            select(func.coalesce(func.sum(Sale.total), 0)).where(*conditions)
        )
        return total or Decimal("0")

    def sales_by_local_date(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        starts_at: datetime,
        ends_at: datetime,
        timezone: str,
    ) -> tuple[tuple[date, Decimal], ...]:
        local_date = func.date(func.timezone(timezone, Sale.completed_at))
        conditions = [
            Sale.workspace_id == workspace_id,
            Sale.status == "completed",
            Sale.completed_at >= starts_at,
            Sale.completed_at < ends_at,
        ]
        branch_filter = self._branch_filter(
            Sale.branch_id, branch_id=branch_id, allowed_branch_ids=allowed_branch_ids
        )
        if branch_filter is not None:
            conditions.append(branch_filter)
        rows = self._session.execute(
            select(local_date, func.sum(Sale.total))
            .where(*conditions)
            .group_by(local_date)
            .order_by(local_date)
        )
        return tuple((row[0], row[1]) for row in rows)

    def sales_by_local_hour(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        starts_at: datetime,
        ends_at: datetime,
        timezone: str,
    ) -> tuple[tuple[int, Decimal], ...]:
        local_hour = cast(func.extract("hour", func.timezone(timezone, Sale.completed_at)), Integer)
        conditions = [
            Sale.workspace_id == workspace_id,
            Sale.status == "completed",
            Sale.completed_at >= starts_at,
            Sale.completed_at < ends_at,
        ]
        branch_filter = self._branch_filter(
            Sale.branch_id, branch_id=branch_id, allowed_branch_ids=allowed_branch_ids
        )
        if branch_filter is not None:
            conditions.append(branch_filter)
        rows = self._session.execute(
            select(local_hour, func.sum(Sale.total))
            .where(*conditions)
            .group_by(local_hour)
            .order_by(local_hour)
        )
        return tuple((int(row[0]), row[1]) for row in rows)

    def active_lead_count(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        starts_at: datetime,
        ends_at: datetime,
    ) -> int:
        conditions = [
            CrmLead.workspace_id == workspace_id,
            CrmLead.status.not_in(("descartado", "convertido")),
            CrmLead.created_at >= starts_at,
            CrmLead.created_at < ends_at,
        ]
        branch_filter = self._branch_filter(
            CrmLead.branch_id, branch_id=branch_id, allowed_branch_ids=allowed_branch_ids
        )
        if branch_filter is not None:
            conditions.append(branch_filter)
        return int(self._session.scalar(select(func.count(CrmLead.id)).where(*conditions)) or 0)

    def open_task_count(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        starts_at: datetime,
        ends_at: datetime,
    ) -> int:
        conditions = [
            CrmActivity.workspace_id == workspace_id,
            CrmActivity.completed_at.is_(None),
            CrmActivity.due_at >= starts_at,
            CrmActivity.due_at < ends_at,
        ]
        branch_filter = self._branch_filter(
            CrmActivity.branch_id, branch_id=branch_id, allowed_branch_ids=allowed_branch_ids
        )
        if branch_filter is not None:
            conditions.append(branch_filter)
        return int(self._session.scalar(select(func.count(CrmActivity.id)).where(*conditions)) or 0)

    def appointments_today(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        scheduled_date: date,
        limit: int,
    ) -> tuple[Appointment, ...]:
        conditions = [
            Appointment.workspace_id == workspace_id,
            Appointment.scheduled_date == scheduled_date,
            Appointment.record_status == "active",
            Appointment.status != "cancelled",
        ]
        branch_filter = self._branch_filter(
            Appointment.branch_id,
            branch_id=branch_id,
            allowed_branch_ids=allowed_branch_ids,
        )
        if branch_filter is not None:
            conditions.append(branch_filter)
        return tuple(
            self._session.scalars(
                select(Appointment)
                .where(*conditions)
                .order_by(Appointment.scheduled_time, Appointment.id)
                .limit(limit)
            )
        )

    def appointment_count_today(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        scheduled_date: date,
    ) -> int:
        conditions = [
            Appointment.workspace_id == workspace_id,
            Appointment.scheduled_date == scheduled_date,
            Appointment.record_status == "active",
            Appointment.status != "cancelled",
        ]
        branch_filter = self._branch_filter(
            Appointment.branch_id,
            branch_id=branch_id,
            allowed_branch_ids=allowed_branch_ids,
        )
        if branch_filter is not None:
            conditions.append(branch_filter)
        return int(self._session.scalar(select(func.count(Appointment.id)).where(*conditions)) or 0)

    def stock_alerts(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        limit: int,
    ) -> tuple[StockAlertRecord, ...]:
        conditions = [
            InventoryStockBalance.workspace_id == workspace_id,
            InventoryStockBalance.minimum_quantity > 0,
            InventoryStockBalance.quantity <= InventoryStockBalance.minimum_quantity,
            Item.status == "active",
            Branch.status == "active",
        ]
        branch_filter = self._branch_filter(
            InventoryStockBalance.branch_id,
            branch_id=branch_id,
            allowed_branch_ids=allowed_branch_ids,
        )
        if branch_filter is not None:
            conditions.append(branch_filter)
        rows = self._session.execute(
            select(InventoryStockBalance, Item, Branch)
            .join(
                Item,
                (Item.workspace_id == InventoryStockBalance.workspace_id)
                & (Item.id == InventoryStockBalance.item_id),
            )
            .join(
                Branch,
                (Branch.workspace_id == InventoryStockBalance.workspace_id)
                & (Branch.id == InventoryStockBalance.branch_id),
            )
            .where(*conditions)
            .order_by(
                InventoryStockBalance.quantity,
                Item.name,
                Branch.name,
                InventoryStockBalance.id,
            )
            .limit(limit)
        )
        return tuple(StockAlertRecord(row[0], row[1], row[2]) for row in rows)

    def recent_sales(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        starts_at: datetime,
        ends_at: datetime,
        limit: int,
    ) -> tuple[Sale, ...]:
        conditions = [
            Sale.workspace_id == workspace_id,
            Sale.completed_at >= starts_at,
            Sale.completed_at < ends_at,
        ]
        branch_filter = self._branch_filter(
            Sale.branch_id, branch_id=branch_id, allowed_branch_ids=allowed_branch_ids
        )
        if branch_filter is not None:
            conditions.append(branch_filter)
        return tuple(
            self._session.scalars(
                select(Sale)
                .where(*conditions)
                .order_by(Sale.completed_at.desc(), Sale.id.desc())
                .limit(limit)
            )
        )

    def recent_registers(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        starts_at: datetime,
        ends_at: datetime,
        limit: int,
    ) -> tuple[RegisterActivityRecord, ...]:
        conditions = [
            CashRegister.workspace_id == workspace_id,
            CashRegister.opened_at >= starts_at,
            CashRegister.opened_at < ends_at,
        ]
        branch_filter = self._branch_filter(
            CashRegister.branch_id,
            branch_id=branch_id,
            allowed_branch_ids=allowed_branch_ids,
        )
        if branch_filter is not None:
            conditions.append(branch_filter)
        rows = self._session.execute(
            select(CashRegister, Branch)
            .join(
                Branch,
                (Branch.workspace_id == CashRegister.workspace_id)
                & (Branch.id == CashRegister.branch_id),
            )
            .where(*conditions)
            .order_by(CashRegister.opened_at.desc(), CashRegister.id.desc())
            .limit(limit)
        )
        return tuple(RegisterActivityRecord(row[0], row[1]) for row in rows)

    def recent_inventory_movements(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        starts_at: datetime,
        ends_at: datetime,
        limit: int,
    ) -> tuple[InventoryActivityRecord, ...]:
        conditions = [
            InventoryMovement.workspace_id == workspace_id,
            InventoryMovement.created_at >= starts_at,
            InventoryMovement.created_at < ends_at,
        ]
        branch_filter = self._branch_filter(
            InventoryMovement.branch_id,
            branch_id=branch_id,
            allowed_branch_ids=allowed_branch_ids,
        )
        if branch_filter is not None:
            conditions.append(branch_filter)
        rows = self._session.execute(
            select(InventoryMovement, Branch)
            .join(
                Branch,
                (Branch.workspace_id == InventoryMovement.workspace_id)
                & (Branch.id == InventoryMovement.branch_id),
            )
            .where(*conditions)
            .order_by(InventoryMovement.created_at.desc(), InventoryMovement.id.desc())
            .limit(limit)
        )
        return tuple(InventoryActivityRecord(row[0], row[1]) for row in rows)

    def recent_appointments(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        starts_at: datetime,
        ends_at: datetime,
        limit: int,
    ) -> tuple[Appointment, ...]:
        conditions = [
            Appointment.workspace_id == workspace_id,
            Appointment.record_status == "active",
            Appointment.created_at >= starts_at,
            Appointment.created_at < ends_at,
        ]
        branch_filter = self._branch_filter(
            Appointment.branch_id,
            branch_id=branch_id,
            allowed_branch_ids=allowed_branch_ids,
        )
        if branch_filter is not None:
            conditions.append(branch_filter)
        return tuple(
            self._session.scalars(
                select(Appointment)
                .where(*conditions)
                .order_by(Appointment.created_at.desc(), Appointment.id.desc())
                .limit(limit)
            )
        )

    def recent_tasks(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        starts_at: datetime,
        ends_at: datetime,
        limit: int,
    ) -> tuple[CrmActivity, ...]:
        conditions = [
            CrmActivity.workspace_id == workspace_id,
            CrmActivity.completed_at.is_(None),
            CrmActivity.created_at >= starts_at,
            CrmActivity.created_at < ends_at,
        ]
        branch_filter = self._branch_filter(
            CrmActivity.branch_id, branch_id=branch_id, allowed_branch_ids=allowed_branch_ids
        )
        if branch_filter is not None:
            conditions.append(branch_filter)
        return tuple(
            self._session.scalars(
                select(CrmActivity)
                .where(*conditions)
                .order_by(CrmActivity.created_at.desc(), CrmActivity.id.desc())
                .limit(limit)
            )
        )
