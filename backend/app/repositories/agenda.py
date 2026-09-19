from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Any
from uuid import UUID

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.db.models import (
    Appointment,
    AppointmentEvent,
    AppointmentResource,
    AppointmentResourceAcl,
    AuditEntry,
    Branch,
    BranchOpeningHour,
    Customer,
    CustomerBranchAssignment,
    Employee,
    EmployeeBranchAssignment,
    EmployeeSchedule,
    HrLeaveRequest,
    Item,
    ItemBranchAssignment,
    PlatformUser,
)
from app.db.models.agenda import ACTIVE_APPOINTMENT_STATUSES
from app.db.models.email_notifications import EmailNotification


@dataclass(frozen=True)
class AppointmentHistoryRecord:
    id: UUID
    at: datetime
    user_id: UUID | None
    user_name: str
    action: str
    changes: tuple[dict[str, Any], ...]


@dataclass(frozen=True)
class AppointmentRecord:
    appointment: Appointment
    resource: AppointmentResource
    employee_name: str | None
    created_by_name: str
    updated_by_name: str
    history: tuple[AppointmentHistoryRecord, ...]
    notification: EmailNotification | None = None


@dataclass(frozen=True)
class AppointmentListResult:
    items: tuple[AppointmentRecord, ...]
    total_items: int


@dataclass(frozen=True)
class ListedAppointmentResource:
    resource: AppointmentResource
    access: str


class AgendaRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_resources(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
    ) -> tuple[AppointmentResource, ...]:
        return tuple(
            self._session.scalars(
                select(AppointmentResource)
                .where(
                    AppointmentResource.workspace_id == workspace_id,
                    AppointmentResource.branch_id == branch_id,
                    AppointmentResource.status != "archived",
                )
                .order_by(
                    AppointmentResource.sort_order,
                    AppointmentResource.name,
                    AppointmentResource.id,
                )
            )
        )

    def list_resources_in_branches(
        self,
        *,
        workspace_id: UUID,
        branch_ids: frozenset[UUID],
    ) -> tuple[AppointmentResource, ...]:
        if not branch_ids:
            return ()
        return tuple(
            self._session.scalars(
                select(AppointmentResource).where(
                    AppointmentResource.workspace_id == workspace_id,
                    AppointmentResource.branch_id.in_(branch_ids),
                    AppointmentResource.status != "archived",
                )
            )
        )

    def resource_ids_with_acl_rows(self, workspace_id: UUID, branch_id: UUID) -> frozenset[UUID]:
        rows = self._session.scalars(
            select(AppointmentResourceAcl.resource_id).where(
                AppointmentResourceAcl.workspace_id == workspace_id,
                AppointmentResourceAcl.branch_id == branch_id,
            )
        )
        return frozenset(rows)

    def acl_rows_for_branch(
        self, workspace_id: UUID, branch_id: UUID
    ) -> tuple[AppointmentResourceAcl, ...]:
        return tuple(
            self._session.scalars(
                select(AppointmentResourceAcl).where(
                    AppointmentResourceAcl.workspace_id == workspace_id,
                    AppointmentResourceAcl.branch_id == branch_id,
                )
            )
        )

    def acl_rows_for_resource(
        self, workspace_id: UUID, branch_id: UUID, resource_id: UUID
    ) -> tuple[AppointmentResourceAcl, ...]:
        return tuple(
            self._session.scalars(
                select(AppointmentResourceAcl).where(
                    AppointmentResourceAcl.workspace_id == workspace_id,
                    AppointmentResourceAcl.branch_id == branch_id,
                    AppointmentResourceAcl.resource_id == resource_id,
                )
            )
        )

    def acl_for_user(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        resource_id: UUID,
        platform_user_id: UUID,
    ) -> AppointmentResourceAcl | None:
        return self._session.scalar(
            select(AppointmentResourceAcl).where(
                AppointmentResourceAcl.workspace_id == workspace_id,
                AppointmentResourceAcl.branch_id == branch_id,
                AppointmentResourceAcl.resource_id == resource_id,
                AppointmentResourceAcl.platform_user_id == platform_user_id,
            )
        )

    def replace_resource_acl(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        resource_id: UUID,
        entries: tuple[tuple[UUID, str | None], ...],
    ) -> tuple[AppointmentResourceAcl, ...]:
        existing = self.acl_rows_for_resource(workspace_id, branch_id, resource_id)
        by_user = {row.platform_user_id: row for row in existing}
        for user_id, access in entries:
            if access is None:
                row = by_user.pop(user_id, None)
                if row is not None:
                    self._session.delete(row)
                continue
            row = by_user.get(user_id)
            if row is None:
                self._session.add(
                    AppointmentResourceAcl(
                        workspace_id=workspace_id,
                        branch_id=branch_id,
                        resource_id=resource_id,
                        platform_user_id=user_id,
                        access=access,
                    )
                )
            else:
                row.access = access
        for row in by_user.values():
            self._session.delete(row)
        self._session.flush()
        return self.acl_rows_for_resource(workspace_id, branch_id, resource_id)

    def list_opening_hours(
        self, workspace_id: UUID, branch_id: UUID
    ) -> tuple[BranchOpeningHour, ...]:
        return tuple(
            self._session.scalars(
                select(BranchOpeningHour)
                .where(
                    BranchOpeningHour.workspace_id == workspace_id,
                    BranchOpeningHour.branch_id == branch_id,
                )
                .order_by(BranchOpeningHour.weekday)
            )
        )

    def replace_opening_hours(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        rows: tuple[tuple[str, time, time], ...],
    ) -> tuple[BranchOpeningHour, ...]:
        existing = {
            row.weekday: row
            for row in self._session.scalars(
                select(BranchOpeningHour).where(
                    BranchOpeningHour.workspace_id == workspace_id,
                    BranchOpeningHour.branch_id == branch_id,
                )
            )
        }
        keep = {weekday for weekday, _, _ in rows}
        for weekday, row in list(existing.items()):
            if weekday not in keep:
                self._session.delete(row)
        for weekday, opens_at, closes_at in rows:
            hour_row = existing.get(weekday)
            if hour_row is None:
                self._session.add(
                    BranchOpeningHour(
                        workspace_id=workspace_id,
                        branch_id=branch_id,
                        weekday=weekday,
                        opens_at=opens_at,
                        closes_at=closes_at,
                    )
                )
            else:
                hour_row.opens_at = opens_at
                hour_row.closes_at = closes_at
        self._session.flush()
        return self.list_opening_hours(workspace_id, branch_id)

    def get_resource_any_status(
        self, workspace_id: UUID, branch_id: UUID, resource_id: UUID
    ) -> AppointmentResource | None:
        return self._session.scalar(
            select(AppointmentResource).where(
                AppointmentResource.workspace_id == workspace_id,
                AppointmentResource.branch_id == branch_id,
                AppointmentResource.id == resource_id,
                AppointmentResource.status != "archived",
            )
        )

    def next_resource_sort_order(self, workspace_id: UUID, branch_id: UUID) -> int:
        current = self._session.scalar(
            select(func.max(AppointmentResource.sort_order)).where(
                AppointmentResource.workspace_id == workspace_id,
                AppointmentResource.branch_id == branch_id,
            )
        )
        return int(current or 0) + 1

    def list_appointments(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        date_from: date | None,
        date_to: date | None,
        search: str | None,
        employee_id: UUID | None,
        status: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
        allowed_resource_ids: frozenset[UUID] | None = None,
    ) -> AppointmentListResult:
        filters = [
            Appointment.workspace_id == workspace_id,
            Appointment.record_status == "active",
        ]
        if allowed_resource_ids is not None:
            if not allowed_resource_ids:
                return AppointmentListResult(items=(), total_items=0)
            filters.append(Appointment.resource_id.in_(allowed_resource_ids))
        if allowed_branch_ids is not None:
            filters.append(Appointment.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            filters.append(Appointment.branch_id == branch_id)
        if date_from is not None:
            filters.append(Appointment.scheduled_date >= date_from)
        if date_to is not None:
            filters.append(Appointment.scheduled_date <= date_to)
        if employee_id is not None:
            filters.append(Appointment.employee_id == employee_id)
        if status is not None:
            filters.append(Appointment.status == status)
        if search:
            pattern = f"%{search}%"
            filters.append(
                or_(
                    Appointment.customer_name.ilike(pattern),
                    Appointment.customer_phone.ilike(pattern),
                    Appointment.service_name.ilike(pattern),
                )
            )

        total = self._session.scalar(select(func.count(Appointment.id)).where(*filters)) or 0
        statement = self._record_statement().where(*filters)
        sort_columns = {
            "date": Appointment.starts_at,
            "customerName": Appointment.customer_name,
            "serviceName": Appointment.service_name,
            "status": Appointment.status,
            "createdAt": Appointment.created_at,
        }
        sort_column = sort_columns[sort_by]
        order = sort_column.asc() if sort_direction == "asc" else sort_column.desc()
        rows = self._session.execute(
            statement.order_by(order, Appointment.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return AppointmentListResult(
            items=self._records_from_rows(rows),
            total_items=total,
        )

    def get_appointment(
        self,
        *,
        workspace_id: UUID,
        appointment_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        lock: bool = False,
    ) -> Appointment | None:
        statement = select(Appointment).where(
            Appointment.workspace_id == workspace_id,
            Appointment.id == appointment_id,
            Appointment.record_status == "active",
        )
        if allowed_branch_ids is not None:
            statement = statement.where(Appointment.branch_id.in_(allowed_branch_ids))
        if lock:
            statement = statement.with_for_update()
        return self._session.scalar(statement)

    def records_for_ids(
        self, workspace_id: UUID, appointment_ids: list[UUID]
    ) -> tuple[AppointmentRecord, ...]:
        if not appointment_ids:
            return ()
        rows = self._session.execute(
            self._record_statement().where(
                Appointment.workspace_id == workspace_id,
                Appointment.id.in_(appointment_ids),
                Appointment.record_status == "active",
            )
        ).all()
        by_id = {record.appointment.id: record for record in self._records_from_rows(rows)}
        return tuple(by_id[item_id] for item_id in appointment_ids if item_id in by_id)

    def records_for_idempotency_key(
        self, workspace_id: UUID, idempotency_key: str
    ) -> tuple[AppointmentRecord, ...]:
        rows = self._session.execute(
            self._record_statement().where(
                Appointment.workspace_id == workspace_id,
                Appointment.idempotency_key == idempotency_key,
            )
        ).all()
        records = self._records_from_rows(rows)
        return tuple(sorted(records, key=lambda record: record.appointment.occurrence_index))

    def branch(self, workspace_id: UUID, branch_id: UUID) -> Branch | None:
        return self._session.scalar(
            select(Branch).where(
                Branch.workspace_id == workspace_id,
                Branch.id == branch_id,
                Branch.status == "active",
            )
        )

    def resource(
        self, workspace_id: UUID, branch_id: UUID, resource_id: UUID
    ) -> AppointmentResource | None:
        return self._session.scalar(
            select(AppointmentResource).where(
                AppointmentResource.workspace_id == workspace_id,
                AppointmentResource.branch_id == branch_id,
                AppointmentResource.id == resource_id,
                AppointmentResource.status == "active",
            )
        )

    def employee_available_in_branch(
        self, workspace_id: UUID, branch_id: UUID, employee_id: UUID
    ) -> bool:
        return (
            self._session.scalar(
                select(Employee.id)
                .join(
                    EmployeeBranchAssignment,
                    (EmployeeBranchAssignment.workspace_id == Employee.workspace_id)
                    & (EmployeeBranchAssignment.employee_id == Employee.id),
                )
                .where(
                    Employee.workspace_id == workspace_id,
                    Employee.id == employee_id,
                    Employee.status == "active",
                    EmployeeBranchAssignment.branch_id == branch_id,
                    EmployeeBranchAssignment.status == "active",
                )
            )
            is not None
        )

    def customer_available_in_branch(
        self, workspace_id: UUID, branch_id: UUID, customer_id: UUID
    ) -> bool:
        return (
            self._session.scalar(
                select(Customer.id)
                .join(
                    CustomerBranchAssignment,
                    (CustomerBranchAssignment.workspace_id == Customer.workspace_id)
                    & (CustomerBranchAssignment.customer_id == Customer.id),
                )
                .where(
                    Customer.workspace_id == workspace_id,
                    Customer.id == customer_id,
                    Customer.status == "active",
                    CustomerBranchAssignment.branch_id == branch_id,
                    CustomerBranchAssignment.status == "active",
                )
            )
            is not None
        )

    def service_available_in_branch(
        self, workspace_id: UUID, branch_id: UUID, service_id: UUID
    ) -> bool:
        return (
            self._session.scalar(
                select(Item.id)
                .join(
                    ItemBranchAssignment,
                    (ItemBranchAssignment.workspace_id == Item.workspace_id)
                    & (ItemBranchAssignment.item_id == Item.id),
                )
                .where(
                    Item.workspace_id == workspace_id,
                    Item.id == service_id,
                    Item.item_type == "service",
                    Item.status == "active",
                    ItemBranchAssignment.branch_id == branch_id,
                    ItemBranchAssignment.status == "active",
                )
            )
            is not None
        )

    def employee_schedule(self, workspace_id: UUID, employee_id: UUID) -> EmployeeSchedule | None:
        return self._session.scalar(
            select(EmployeeSchedule).where(
                EmployeeSchedule.workspace_id == workspace_id,
                EmployeeSchedule.employee_id == employee_id,
            )
        )

    def employee_on_approved_leave(
        self, workspace_id: UUID, employee_id: UUID, scheduled_date: date
    ) -> bool:
        return (
            self._session.scalar(
                select(HrLeaveRequest.id).where(
                    HrLeaveRequest.workspace_id == workspace_id,
                    HrLeaveRequest.employee_id == employee_id,
                    HrLeaveRequest.status == "aprobada",
                    HrLeaveRequest.start_date <= scheduled_date,
                    HrLeaveRequest.end_date >= scheduled_date,
                )
            )
            is not None
        )

    def conflicting_appointment(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        resource_id: UUID,
        employee_id: UUID | None,
        starts_at: datetime,
        ends_at: datetime,
        exclude_appointment_id: UUID | None = None,
    ) -> Appointment | None:
        resources: list[ColumnElement[bool]] = [
            (Appointment.branch_id == branch_id) & (Appointment.resource_id == resource_id)
        ]
        if employee_id is not None:
            resources.append(Appointment.employee_id == employee_id)
        statement = select(Appointment).where(
            Appointment.workspace_id == workspace_id,
            Appointment.record_status == "active",
            Appointment.status.in_(ACTIVE_APPOINTMENT_STATUSES),
            Appointment.starts_at < ends_at,
            Appointment.ends_at > starts_at,
            or_(*resources),
        )
        if exclude_appointment_id is not None:
            statement = statement.where(Appointment.id != exclude_appointment_id)
        return self._session.scalar(statement.order_by(Appointment.starts_at).limit(1))

    def add_appointment(self, appointment: Appointment) -> None:
        self._session.add(appointment)

    def add_resource(self, resource: AppointmentResource) -> None:
        self._session.add(resource)
        self._session.flush()
        self._session.flush()

    def add_event(
        self,
        *,
        workspace_id: UUID,
        appointment_id: UUID,
        actor_platform_user_id: UUID,
        actor_name: str,
        action: str,
        changes: list[dict[str, Any]],
        request_id: str,
    ) -> None:
        self._session.add(
            AppointmentEvent(
                workspace_id=workspace_id,
                appointment_id=appointment_id,
                actor_platform_user_id=actor_platform_user_id,
                actor_name=actor_name,
                action=action,
                changes={"items": changes},
                request_id=request_id or None,
            )
        )

    def add_audit(
        self,
        *,
        workspace_id: UUID,
        actor_platform_user_id: UUID,
        action: str,
        appointment_id: UUID,
        request_id: str,
        details: dict[str, Any],
    ) -> None:
        self._session.add(
            AuditEntry(
                workspace_id=workspace_id,
                actor_platform_user_id=actor_platform_user_id,
                action=action,
                target_type="appointment",
                target_id=appointment_id,
                outcome="success",
                request_id=request_id or None,
                details=details,
            )
        )

    @staticmethod
    def _base_record_statement(
        created_user: Any, updated_user: Any
    ) -> Select[tuple[Appointment, AppointmentResource, str | None, str, str]]:
        employee_name = func.concat(Employee.first_name, " ", Employee.last_name)
        return (
            select(
                Appointment,
                AppointmentResource,
                employee_name,
                created_user.display_name,
                updated_user.display_name,
            )
            .join(
                AppointmentResource,
                (AppointmentResource.workspace_id == Appointment.workspace_id)
                & (AppointmentResource.branch_id == Appointment.branch_id)
                & (AppointmentResource.id == Appointment.resource_id),
            )
            .outerjoin(
                Employee,
                (Employee.workspace_id == Appointment.workspace_id)
                & (Employee.id == Appointment.employee_id),
            )
            .join(created_user, created_user.id == Appointment.created_by_platform_user_id)
            .join(updated_user, updated_user.id == Appointment.updated_by_platform_user_id)
        )

    def _record_statement(
        self,
    ) -> Select[tuple[Appointment, AppointmentResource, str | None, str, str]]:
        created_user = aliased(PlatformUser)
        updated_user = aliased(PlatformUser)
        return self._base_record_statement(created_user, updated_user)

    def _records_from_rows(self, rows: Sequence[Any]) -> tuple[AppointmentRecord, ...]:
        if not rows:
            return ()
        appointment_ids = [row[0].id for row in rows]
        events = self._session.scalars(
            select(AppointmentEvent)
            .where(
                AppointmentEvent.workspace_id == rows[0][0].workspace_id,
                AppointmentEvent.appointment_id.in_(appointment_ids),
            )
            .order_by(AppointmentEvent.occurred_at, AppointmentEvent.id)
        )
        history_by_appointment: dict[UUID, list[AppointmentHistoryRecord]] = {}
        for event in events:
            raw_changes = event.changes.get("items", []) if isinstance(event.changes, dict) else []
            changes = tuple(item for item in raw_changes if isinstance(item, dict))
            history_by_appointment.setdefault(event.appointment_id, []).append(
                AppointmentHistoryRecord(
                    id=event.id,
                    at=event.occurred_at,
                    user_id=event.actor_platform_user_id,
                    user_name=event.actor_name,
                    action=event.action,
                    changes=changes,
                )
            )
        return tuple(
            AppointmentRecord(
                appointment=row[0],
                resource=row[1],
                employee_name=row[2],
                created_by_name=row[3],
                updated_by_name=row[4],
                history=tuple(history_by_appointment.get(row[0].id, ())),
            )
            for row in rows
        )
