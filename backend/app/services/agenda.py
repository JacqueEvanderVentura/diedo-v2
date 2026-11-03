from __future__ import annotations

import json
import logging
from calendar import monthrange
from collections import defaultdict
from dataclasses import dataclass, replace
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from hashlib import sha256
from typing import Any, cast
from uuid import UUID, uuid7
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import friendly_validation_message
from app.core.request_context import get_request_id
from app.db.models import (
    Appointment,
    AppointmentResource,
    Branch,
    BranchOpeningHour,
    Customer,
    Employee,
    EmployeeBranchAssignment,
    InventoryItemProfile,
    Item,
    ItemBranchAssignment,
    Workspace,
)
from app.db.models.agenda import ACTIVE_APPOINTMENT_STATUSES, SHARED_RESOURCE_CAPACITY
from app.db.models.email_notifications import EmailNotification
from app.repositories.agenda import (
    AgendaRepository,
    AppointmentListResult,
    AppointmentRecord,
    ListedAppointmentResource,
)
from app.repositories.master_data import MasterDataRepository
from app.schemas.agenda import ImportAppointmentItem
from app.services.auth import AuthPrincipal
from app.services.authorization import AuthorizationService, PermissionGrant
from app.services.booking_tokens import issue_appointment_management_token
from app.services.customer_import_merge import (
    build_import_customer_match_lookup,
    normalize_name,
    resolve_import_customer_matches_from_lookup,
)
from app.services.email_notifications import deliver_email, enqueue_email
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)
from app.services.mailer import render_appointment_email
from app.services.pos import PosService

_WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
_APPOINTMENT_NOTES_MAX_LENGTH = 60
_APPOINTMENT_NOTES_DB_MAX_LENGTH = 2000
_IMPORT_DEFAULT_RESOURCE_NAME = "Cabina 1"
_IMPORT_DEFAULT_RESOURCE_CODE = "cabina-1"
_IMPORT_STACK_NOTE = (
    "Importación: agrupada con otras citas en el mismo horario y cabina "
    "(solo por cómo se importó el archivo)."
)
logger = logging.getLogger(__name__)


def peak_occupancy(
    starts_at: datetime,
    ends_at: datetime,
    others: list[tuple[datetime, datetime]],
) -> int:
    """Max simultaneous appointments inside [starts_at, ends_at), counting the new one."""
    checkpoints = {starts_at, *(start for start, _ in others if starts_at < start < ends_at)}
    return 1 + max(
        (sum(1 for start, end in others if start <= point < end) for point in checkpoints),
        default=0,
    )


def appointment_created_by_label(appointment: Appointment, platform_user_name: str) -> str:
    """Self-service bookings are attributed to the client, not the platform actor."""
    if appointment.source == "self":
        return appointment.customer_name
    return platform_user_name


@dataclass
class _ImportBatchState:
    repository: AgendaRepository
    workspace_id: UUID
    branch_id: UUID
    locked_resource_ids: set[UUID]
    resource_windows: dict[UUID, list[tuple[datetime, datetime]]]
    employee_windows: dict[UUID, list[tuple[datetime, datetime]]]

    @classmethod
    def create(
        cls,
        repository: AgendaRepository,
        *,
        workspace_id: UUID,
        branch_id: UUID,
    ) -> _ImportBatchState:
        return cls(
            repository=repository,
            workspace_id=workspace_id,
            branch_id=branch_id,
            locked_resource_ids=set(),
            resource_windows=defaultdict(list),
            employee_windows=defaultdict(list),
        )

    def ensure_resource_locked(self, resource_id: UUID) -> None:
        if resource_id in self.locked_resource_ids:
            return
        self.repository.lock_resource(self.workspace_id, self.branch_id, resource_id)
        self.locked_resource_ids.add(resource_id)

    def register_booking(
        self,
        *,
        resource_id: UUID,
        employee_id: UUID | None,
        starts_at: datetime,
        ends_at: datetime,
    ) -> None:
        self.resource_windows[resource_id].append((starts_at, ends_at))
        if employee_id is not None:
            self.employee_windows[employee_id].append((starts_at, ends_at))


_FIELD_META = {
    "scheduled_date": ("date", "Fecha"),
    "scheduled_time": ("time", "Hora"),
    "duration_minutes": ("duration", "Duración (min)"),
    "customer_name": ("customerName", "Cliente"),
    "customer_phone": ("customerPhone", "Teléfono"),
    "service_name": ("serviceName", "Servicio"),
    "employee_id": ("employeeId", "Empleado"),
    "branch_id": ("branchId", "Sucursal"),
    "resource_id": ("cabinaId", "Cabina"),
    "status": ("status", "Estado"),
    "completed_at": ("completedAt", "Cumplida a las"),
    "completion_punctuality": ("completionPunctuality", "Puntualidad"),
    "delay_responsibility": ("delayResponsibility", "Responsable del retraso"),
    "completion_note": ("completionNote", "Nota de cumplimiento"),
    "price": ("price", "Precio"),
    "notes": ("notes", "Notas"),
    "pending_payment": ("pendingPayment", "Pendiente de pago"),
    "pending_amount": ("pendingAmount", "Monto pendiente"),
    "first_time": ("firstTime", "Primera vez"),
    "free_trial": ("freeTrial", "Prueba gratuita"),
    "reminder_sent": ("reminderSent", "Recordatorio enviado"),
}


class AgendaService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = AgendaRepository(session)

    def _enqueue_notification(
        self, appointment: Appointment, event: str, branch: Branch, workspace: Workspace
    ) -> EmailNotification | None:
        if appointment.customer_id is None:
            return None
        email = self._session.scalar(
            select(Customer.email).where(
                Customer.workspace_id == appointment.workspace_id,
                Customer.id == appointment.customer_id,
                Customer.status == "active",
            )
        )
        if not email:
            return None
        content = render_appointment_email(
            event=event,
            to=email,
            appointment=appointment,
            branch_name=branch.name,
            workspace_name=workspace.name,
            management_token=issue_appointment_management_token(appointment.id),
            timezone=branch.timezone,
        )
        return enqueue_email(
            self._session,
            workspace_id=appointment.workspace_id,
            appointment_id=appointment.id,
            event_key=f"{event}/{appointment.id}/{appointment.version}",
            event_type=event,
            **content,
        )

    def _deliver_after_commit(self, notifications: list[EmailNotification]) -> None:
        for notification in notifications:
            try:
                deliver_email(self._session, notification.id)
            except Exception:
                # The appointment operation has already succeeded; delivery is retryable.
                logger.exception("Unexpected appointment email delivery failure.")
                self._session.rollback()

    @staticmethod
    def _records_with_notifications(
        records: tuple[AppointmentRecord, ...],
        notifications: list[EmailNotification],
    ) -> tuple[AppointmentRecord, ...]:
        by_appointment = {notice.appointment_id: notice for notice in notifications}
        return tuple(
            replace(record, notification=by_appointment.get(record.appointment.id))
            for record in records
        )

    def list_resources(
        self,
        grant: PermissionGrant,
        branch_id: UUID,
        *,
        principal: AuthPrincipal,
    ) -> tuple[ListedAppointmentResource, ...]:
        self._require_branch_access(grant, branch_id)
        if self._repository.branch(grant.workspace_id, branch_id) is None:
            raise ResourceNotFoundError("La sucursal no existe o no está activa.", "branchId")
        resources = self._repository.list_resources(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
        )
        return self._filter_listed_resources(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            platform_user_id=principal.platform_user_id,
            resources=resources,
        )

    def list_resources_for_config(
        self,
        grant: PermissionGrant,
        branch_id: UUID,
        *,
        principal: AuthPrincipal,
    ) -> tuple[ListedAppointmentResource, ...]:
        self._require_branch_access(grant, branch_id)
        if self._repository.branch(grant.workspace_id, branch_id) is None:
            raise ResourceNotFoundError("La sucursal no existe o no está activa.", "branchId")
        resources = self._repository.list_resources(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
        )
        acl_by_resource = self._branch_acl_map(grant.workspace_id, branch_id)
        return tuple(
            ListedAppointmentResource(
                resource=resource,
                access=self._resource_access(
                    resource_id=resource.id,
                    platform_user_id=principal.platform_user_id,
                    acl_by_resource=acl_by_resource,
                ),
            )
            for resource in resources
        )

    def list_appointments(
        self,
        *,
        grant: PermissionGrant,
        principal: AuthPrincipal | None = None,
        bypass_resource_acl: bool = False,
        branch_id: UUID | None,
        customer_id: UUID | None,
        date_from: date | None,
        date_to: date | None,
        search: str | None,
        employee_id: UUID | None,
        status: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> AppointmentListResult:
        if branch_id is not None:
            self._require_branch_access(grant, branch_id)
        if date_from is not None and date_to is not None:
            if date_to < date_from:
                raise InvalidOperationError(
                    "dateTo debe ser igual o posterior a dateFrom.", "dateTo"
                )
            if (date_to - date_from).days > 366:
                raise InvalidOperationError(
                    "El rango de calendario no puede superar 366 días.", "dateTo"
                )
        normalized_search = " ".join(search.split()) if search else None
        allowed_resource_ids = None
        if principal is not None and not bypass_resource_acl:
            allowed_resource_ids = self._visible_resource_ids(
                workspace_id=grant.workspace_id,
                branch_id=branch_id,
                allowed_branch_ids=grant.allowed_branch_ids,
                platform_user_id=principal.platform_user_id,
            )
        return self._repository.list_appointments(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            customer_id=customer_id,
            date_from=date_from,
            date_to=date_to,
            search=normalized_search,
            employee_id=employee_id,
            status=status,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
            allowed_resource_ids=allowed_resource_ids,
        )

    def create_appointment_resource(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID,
        name: str,
        description: str | None,
    ) -> AppointmentResource:
        self._require_branch_access(grant, branch_id)
        if self._repository.branch(grant.workspace_id, branch_id) is None:
            raise ResourceNotFoundError("La sucursal no existe o no está activa.", "branchId")
        code = f"cab-{uuid7().hex}"
        resource = AppointmentResource(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            code=code,
            name=name,
            description=description,
            resource_type="room",
            status="active",
            sort_order=self._repository.next_resource_sort_order(grant.workspace_id, branch_id),
        )
        self._repository.add_resource(resource)
        self._session.commit()
        return resource

    def update_appointment_resource(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID,
        resource_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> AppointmentResource:
        self._require_branch_access(grant, branch_id)
        resource = self._repository.get_resource_any_status(
            grant.workspace_id, branch_id, resource_id
        )
        if resource is None:
            raise ResourceNotFoundError("La cabina no existe.", "resourceId")
        if resource.version != expected_version:
            raise ConflictError("La cabina cambió desde la última lectura.", "version")
        if "name" in changes and changes["name"] is not None:
            resource.name = cast(str, changes["name"])
        if "description" in changes:
            resource.description = cast(str | None, changes["description"])
        if "status" in changes and changes["status"] is not None:
            resource.status = cast(str, changes["status"])
        if changes.get("online_booking_enabled") is not None:
            resource.online_booking_enabled = cast(bool, changes["online_booking_enabled"])
        self._session.commit()
        return resource

    def archive_appointment_resource(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID,
        resource_id: UUID,
        expected_version: int,
    ) -> None:
        self.update_appointment_resource(
            grant=grant,
            branch_id=branch_id,
            resource_id=resource_id,
            expected_version=expected_version,
            changes={"status": "archived"},
        )

    def reorder_appointment_resources(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID,
        resource_ids: list[UUID],
    ) -> tuple[AppointmentResource, ...]:
        self._require_branch_access(grant, branch_id)
        resources = self._repository.list_resources(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
        )
        by_id = {resource.id: resource for resource in resources}
        if set(resource_ids) != set(by_id):
            raise InvalidOperationError(
                "Debes enviar todas las cabinas activas de la sucursal en el nuevo orden.",
                "resourceIds",
            )
        for index, resource_id in enumerate(resource_ids):
            by_id[resource_id].sort_order = index
        self._session.commit()
        return self._repository.list_resources(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
        )

    def get_branch_opening_hours(
        self, grant: PermissionGrant, branch_id: UUID
    ) -> tuple[BranchOpeningHour, ...]:
        self._require_branch_access(grant, branch_id)
        if self._repository.branch(grant.workspace_id, branch_id) is None:
            raise ResourceNotFoundError("La sucursal no existe o no está activa.", "branchId")
        return self._repository.list_opening_hours(grant.workspace_id, branch_id)

    def replace_branch_opening_hours(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID,
        items: list[dict[str, Any]],
    ) -> tuple[BranchOpeningHour, ...]:
        self._require_branch_access(grant, branch_id)
        if self._repository.branch(grant.workspace_id, branch_id) is None:
            raise ResourceNotFoundError("La sucursal no existe o no está activa.", "branchId")
        rows = tuple(
            (
                cast(str, item["weekday"]),
                cast(time, item["opens_at"]),
                cast(time, item["closes_at"]),
            )
            for item in items
        )
        result = self._repository.replace_opening_hours(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            rows=rows,
        )
        self._session.commit()
        return result

    def get_resource_acl(
        self, grant: PermissionGrant, branch_id: UUID, resource_id: UUID
    ) -> tuple[Any, ...]:
        self._require_branch_access(grant, branch_id)
        if (
            self._repository.get_resource_any_status(grant.workspace_id, branch_id, resource_id)
            is None
        ):
            raise ResourceNotFoundError("La cabina no existe.", "resourceId")
        return self._repository.acl_rows_for_resource(grant.workspace_id, branch_id, resource_id)

    def replace_resource_acl(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID,
        resource_id: UUID,
        entries: list[dict[str, Any]],
    ) -> tuple[Any, ...]:
        self._require_branch_access(grant, branch_id)
        if (
            self._repository.get_resource_any_status(grant.workspace_id, branch_id, resource_id)
            is None
        ):
            raise ResourceNotFoundError("La cabina no existe.", "resourceId")
        normalized = tuple(
            (cast(UUID, entry["user_id"]), cast(str | None, entry.get("access")))
            for entry in entries
        )
        rows = self._repository.replace_resource_acl(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            resource_id=resource_id,
            entries=normalized,
        )
        self._session.commit()
        return rows

    def branch_opening_schedule(
        self, workspace_id: UUID, branch_id: UUID
    ) -> dict[str, list[dict[str, str]]] | None:
        hours = self._repository.list_opening_hours(workspace_id, branch_id)
        if not hours:
            return None
        schedule: dict[str, list[dict[str, str]]] = {}
        for row in hours:
            schedule[row.weekday] = [
                {
                    "start": row.opens_at.strftime("%H:%M"),
                    "end": row.closes_at.strftime("%H:%M"),
                }
            ]
        return schedule

    def create_appointments(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
        commit: bool = True,
        enforce_resource_acl: bool = True,
        resource_capacity: int = 1,
        notify: bool = True,
        allow_long_notes: bool = False,
        skip_slot_check: bool = False,
    ) -> tuple[AppointmentRecord, ...]:
        branch_id = cast(UUID, values["branch_id"])
        notes_limit = (
            _APPOINTMENT_NOTES_DB_MAX_LENGTH if allow_long_notes else _APPOINTMENT_NOTES_MAX_LENGTH
        )
        self._validate_notes(values.get("notes"), max_length=notes_limit)
        self._require_branch_access(grant, branch_id)
        branch = self._repository.branch(grant.workspace_id, branch_id)
        if branch is None:
            raise ResourceNotFoundError("La sucursal no existe o no está activa.", "branchId")
        if cast(bool, values["pending_payment"]) and cast(Decimal, values["pending_amount"]) > 0:
            self._require_receivables_manage(principal, {branch_id})

        fingerprint = self._fingerprint(values)
        existing = self._repository.records_for_idempotency_key(grant.workspace_id, idempotency_key)
        if existing:
            if any(record.appointment.record_status == "inactive" for record in existing):
                raise ConflictError(
                    "La clave de idempotencia corresponde a una cita eliminada.",
                    "Idempotency-Key",
                )
            if any(record.appointment.request_fingerprint != fingerprint for record in existing):
                raise ConflictError(
                    "La clave de idempotencia ya fue usada con otros datos.",
                    "Idempotency-Key",
                )
            return existing

        any_available = cast(bool, values.get("any_available", False))
        resource_id = cast(UUID | None, values.get("resource_id"))
        employee_id = cast(UUID | None, values.get("employee_id"))
        staff_any_available = any_available and cast(str, values.get("source", "staff")) != "self"
        if any_available:
            employee_id = None
            resource_id = None
        if staff_any_available:
            bookable = self._bookable_listed_resources(
                workspace_id=grant.workspace_id,
                branch_id=branch_id,
                platform_user_id=principal.platform_user_id,
            )
            if not bookable:
                raise AuthorizationError("No tienes permiso para agendar en ninguna cabina.")
        customer_id = cast(UUID | None, values.get("customer_id"))
        service_id = cast(UUID | None, values.get("service_id"))
        self._validate_references(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            resource_id=resource_id,
            employee_id=employee_id,
            customer_id=customer_id,
            service_id=service_id,
        )
        if resource_id is not None and enforce_resource_acl:
            self._require_resource_use(
                workspace_id=grant.workspace_id,
                branch_id=branch_id,
                resource_id=resource_id,
                platform_user_id=principal.platform_user_id,
            )
        self._validate_money(values)

        recurrence = cast(str, values["recurrence"])
        repeat_count = cast(int, values["repeat_count"])
        scheduled_dates = self._recurrence_dates(
            cast(date, values["date"]), recurrence, repeat_count
        )
        recurrence_group_id = uuid7() if len(scheduled_dates) > 1 else None
        appointments: list[Appointment] = []
        notifications: list[EmailNotification] = []
        workspace = self._session.scalar(
            select(Workspace).where(Workspace.id == grant.workspace_id)
        )

        try:
            for occurrence_index, scheduled_date in enumerate(scheduled_dates):
                starts_at, ends_at = self._schedule_window(
                    scheduled_date=scheduled_date,
                    scheduled_time=cast(time, values["time"]),
                    duration_minutes=cast(int, values["duration"]),
                    timezone=branch.timezone,
                )
                occurrence_employee_id = employee_id
                occurrence_resource_id = resource_id
                if staff_any_available:
                    occurrence_resource_id, occurrence_employee_id = (
                        self._resolve_staff_any_available(
                            workspace_id=grant.workspace_id,
                            branch_id=branch_id,
                            platform_user_id=principal.platform_user_id,
                            scheduled_date=scheduled_date,
                            starts_at=starts_at,
                            ends_at=ends_at,
                            bookable=bookable,
                        )
                    )
                    self._require_resource_use(
                        workspace_id=grant.workspace_id,
                        branch_id=branch_id,
                        resource_id=occurrence_resource_id,
                        platform_user_id=principal.platform_user_id,
                    )
                else:
                    self._validate_employee_availability(
                        workspace_id=grant.workspace_id,
                        employee_id=occurrence_employee_id,
                        scheduled_date=scheduled_date,
                        starts_at=starts_at,
                        ends_at=ends_at,
                    )
                if not skip_slot_check:
                    self._ensure_slot_available(
                        workspace_id=grant.workspace_id,
                        branch_id=branch_id,
                        resource_id=occurrence_resource_id,
                        employee_id=occurrence_employee_id,
                        starts_at=starts_at,
                        ends_at=ends_at,
                        resource_capacity=1 if staff_any_available else resource_capacity,
                    )

                status = cast(str, values["status"])
                is_cancelled = status == "cancelled"
                appointment = Appointment(
                    workspace_id=grant.workspace_id,
                    branch_id=branch_id,
                    resource_id=occurrence_resource_id,
                    customer_id=customer_id,
                    employee_id=occurrence_employee_id,
                    service_id=service_id,
                    scheduled_date=scheduled_date,
                    scheduled_time=cast(time, values["time"]),
                    timezone=branch.timezone,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    duration_minutes=cast(int, values["duration"]),
                    customer_name=cast(str, values["customer_name"]),
                    customer_phone=cast(str | None, values.get("customer_phone")),
                    service_name=cast(str, values["service_name"]),
                    price=cast(Decimal, values["price"]),
                    status=status,
                    notes=cast(str | None, values.get("notes")),
                    pending_payment=(
                        False if is_cancelled else cast(bool, values["pending_payment"])
                    ),
                    pending_amount=(
                        Decimal("0") if is_cancelled else cast(Decimal, values["pending_amount"])
                    ),
                    first_time=cast(bool, values["first_time"]),
                    free_trial=cast(bool, values["free_trial"]),
                    reminder_sent=False,
                    source=cast(str, values["source"]),
                    recurrence=recurrence,
                    recurrence_group_id=recurrence_group_id,
                    occurrence_index=occurrence_index,
                    repeat_count=repeat_count,
                    idempotency_key=idempotency_key,
                    request_fingerprint=fingerprint,
                    created_by_platform_user_id=principal.platform_user_id,
                    updated_by_platform_user_id=principal.platform_user_id,
                )
                self._repository.add_appointment(appointment)
                self._session.flush()
                if workspace is not None and status == "confirmed" and notify:
                    queued = self._enqueue_notification(
                        appointment, "appointment.confirmed", branch, workspace
                    )
                    if queued is not None:
                        notifications.append(queued)
                changes = self._creation_changes(appointment)
                self._repository.add_event(
                    workspace_id=grant.workspace_id,
                    appointment_id=appointment.id,
                    actor_platform_user_id=principal.platform_user_id,
                    actor_name=appointment_created_by_label(appointment, principal.display_name),
                    action="create",
                    changes=changes,
                    request_id=get_request_id(),
                )
                self._repository.add_audit(
                    workspace_id=grant.workspace_id,
                    actor_platform_user_id=principal.platform_user_id,
                    action="appointment.create",
                    appointment_id=appointment.id,
                    request_id=get_request_id(),
                    details={
                        "branchId": str(branch_id),
                        "resourceId": str(resource_id),
                        "employeeId": str(employee_id) if employee_id else None,
                        "startsAt": starts_at.isoformat(),
                        "endsAt": ends_at.isoformat(),
                        "recurrenceGroupId": (
                            str(recurrence_group_id) if recurrence_group_id else None
                        ),
                    },
                )
                if appointment.pending_payment and appointment.pending_amount > 0:
                    PosService(self._session).sync_appointment_receivable(
                        principal=principal,
                        appointment=appointment,
                    )
                appointments.append(appointment)
            if commit:
                self._session.commit()
            else:
                self._session.flush()
        except ConflictError:
            self._session.rollback()
            raise
        except IntegrityError as exc:
            self._session.rollback()
            concurrent_retry = self._repository.records_for_idempotency_key(
                grant.workspace_id, idempotency_key
            )
            if concurrent_retry:
                if any(
                    record.appointment.record_status == "inactive" for record in concurrent_retry
                ):
                    raise ConflictError(
                        "La clave de idempotencia corresponde a una cita eliminada.",
                        "Idempotency-Key",
                    ) from exc
                if any(
                    record.appointment.request_fingerprint != fingerprint
                    for record in concurrent_retry
                ):
                    raise ConflictError(
                        "La clave de idempotencia ya fue usada con otros datos.",
                        "Idempotency-Key",
                    ) from exc
                return concurrent_retry
            if self._integrity_constraint(exc) in {
                "excl_appointments_resource_period",
                "excl_appointments_employee_period",
            }:
                raise self._slot_conflict() from exc
            raise ConflictError("No fue posible crear la cita por un conflicto de datos.") from exc

        if commit:
            self._deliver_after_commit(notifications)
        records = self._repository.records_for_ids(
            grant.workspace_id, [appointment.id for appointment in appointments]
        )
        return self._records_with_notifications(records, notifications)

    def update_appointment(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        appointment_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
        commit: bool = True,
        enforce_resource_acl: bool = True,
        resource_capacity: int = 1,
    ) -> AppointmentRecord:
        appointment = self._repository.get_appointment(
            workspace_id=grant.workspace_id,
            appointment_id=appointment_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            lock=True,
        )
        if appointment is None:
            raise ResourceNotFoundError("La cita no existe.", "appointmentId")
        if appointment.version != expected_version:
            raise ConflictError("La cita cambió desde la última lectura.", "version")
        if "notes" in changes:
            self._validate_notes(changes["notes"], existing=appointment.notes)

        any_available = changes.pop("any_available", None)
        if any_available is True and changes.get("employee_id") is not None:
            raise InvalidOperationError(
                "No indiques un empleado cuando eliges cualquiera disponible.", "employeeId"
            )

        branch_id = cast(UUID, changes.get("branch_id", appointment.branch_id))
        self._require_branch_access(grant, branch_id)
        branch = self._repository.branch(grant.workspace_id, branch_id)
        if branch is None:
            raise ResourceNotFoundError("La sucursal no existe o no está activa.", "branchId")
        resource_id = cast(UUID | None, changes.get("resource_id", appointment.resource_id))
        employee_id = cast(UUID | None, changes.get("employee_id", appointment.employee_id))
        customer_id = cast(UUID | None, changes.get("customer_id", appointment.customer_id))
        service_id = cast(UUID | None, changes.get("service_id", appointment.service_id))
        self._validate_references(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            resource_id=resource_id,
            employee_id=employee_id,
            customer_id=customer_id,
            service_id=service_id,
        )
        schedule_changed = (
            resource_id != appointment.resource_id
            or branch_id != appointment.branch_id
            or "date" in changes
            or "time" in changes
            or "duration" in changes
        )
        if enforce_resource_acl:
            if resource_id is not None and (
                schedule_changed or resource_id != appointment.resource_id
            ):
                self._require_resource_edit(
                    workspace_id=grant.workspace_id,
                    branch_id=branch_id,
                    resource_id=resource_id,
                    platform_user_id=principal.platform_user_id,
                )
            elif not self._resource_visible(
                workspace_id=grant.workspace_id,
                branch_id=branch_id,
                resource_id=appointment.resource_id,
                platform_user_id=principal.platform_user_id,
            ):
                raise AuthorizationError("No tienes acceso a esta cita.")

        scheduled_date = cast(date, changes.get("date", appointment.scheduled_date))
        scheduled_time = cast(time, changes.get("time", appointment.scheduled_time))
        duration = cast(int, changes.get("duration", appointment.duration_minutes))
        starts_at, ends_at = self._schedule_window(
            scheduled_date=scheduled_date,
            scheduled_time=scheduled_time,
            duration_minutes=duration,
            timezone=branch.timezone,
        )
        if any_available is True:
            employee_id = None
            resource_id = None
        status = cast(str, changes.get("status", appointment.status))
        reminder_schedule_changed = (
            scheduled_date != appointment.scheduled_date
            or scheduled_time != appointment.scheduled_time
            or duration != appointment.duration_minutes
            or branch_id != appointment.branch_id
            or employee_id != appointment.employee_id
            or resource_id != appointment.resource_id
        )
        completion_fields = self._resolve_completion_fields(
            appointment=appointment,
            status=status,
            changes=changes,
        )
        if status in ACTIVE_APPOINTMENT_STATUSES:
            self._validate_employee_availability(
                workspace_id=grant.workspace_id,
                employee_id=employee_id,
                scheduled_date=scheduled_date,
                starts_at=starts_at,
                ends_at=ends_at,
            )
            self._ensure_slot_available(
                workspace_id=grant.workspace_id,
                branch_id=branch_id,
                resource_id=resource_id,
                employee_id=employee_id,
                starts_at=starts_at,
                ends_at=ends_at,
                exclude_appointment_id=appointment.id,
                resource_capacity=1 if any_available is True else resource_capacity,
            )

        final_money = {
            "price": changes.get("price", appointment.price),
            "pending_payment": changes.get("pending_payment", appointment.pending_payment),
            "pending_amount": changes.get("pending_amount", appointment.pending_amount),
        }
        if status == "cancelled":
            final_money["pending_payment"] = False
            final_money["pending_amount"] = Decimal("0")
        self._validate_money(final_money)
        had_pending_balance = self._has_pending_balance(
            status=appointment.status,
            pending_payment=appointment.pending_payment,
            pending_amount=appointment.pending_amount,
        )
        will_have_pending_balance = self._has_pending_balance(
            status=status,
            pending_payment=cast(bool, final_money["pending_payment"]),
            pending_amount=cast(Decimal, final_money["pending_amount"]),
        )
        financial_values_changed = (
            branch_id != appointment.branch_id
            or customer_id != appointment.customer_id
            or final_money["pending_payment"] != appointment.pending_payment
            or final_money["pending_amount"] != appointment.pending_amount
        )
        if (had_pending_balance or will_have_pending_balance) and financial_values_changed:
            self._require_receivables_manage(
                principal,
                {appointment.branch_id, branch_id},
            )
        before = self._public_values(appointment)
        previous_status = appointment.status
        field_mapping = {
            "branch_id": branch_id,
            "resource_id": resource_id,
            "customer_id": customer_id,
            "employee_id": employee_id,
            "service_id": service_id,
            "scheduled_date": scheduled_date,
            "scheduled_time": scheduled_time,
            "timezone": branch.timezone,
            "starts_at": starts_at,
            "ends_at": ends_at,
            "duration_minutes": duration,
            "customer_name": changes.get("customer_name", appointment.customer_name),
            "customer_phone": changes.get("customer_phone", appointment.customer_phone),
            "service_name": changes.get("service_name", appointment.service_name),
            "price": final_money["price"],
            "status": status,
            "completed_at": completion_fields["completed_at"],
            "completion_punctuality": completion_fields["completion_punctuality"],
            "delay_responsibility": completion_fields["delay_responsibility"],
            "completion_note": completion_fields["completion_note"],
            "notes": changes.get("notes", appointment.notes),
            "pending_payment": final_money["pending_payment"],
            "pending_amount": final_money["pending_amount"],
            "first_time": changes.get("first_time", appointment.first_time),
            "free_trial": changes.get("free_trial", appointment.free_trial),
            # A changed schedule must be eligible for a new 24-hour reminder.
            # The client cannot force this flag through the administrative API.
            "reminder_sent": (
                False
                if status == "confirmed" and reminder_schedule_changed
                else appointment.reminder_sent
            ),
        }
        for field, value in field_mapping.items():
            setattr(appointment, field, value)
        appointment.updated_by_platform_user_id = principal.platform_user_id
        if reminder_schedule_changed:
            appointment.schedule_revision += 1
            appointment.schedule_changed_at = datetime.now(UTC)
        appointment.version += 1
        after = self._public_values(appointment)
        event_changes = self._diff_changes(before, after)
        action = "status_change" if set(changes) == {"status"} else "update"

        notifications: list[EmailNotification] = []
        workspace = self._session.scalar(
            select(Workspace).where(Workspace.id == grant.workspace_id)
        )
        try:
            self._session.flush()
            self._repository.add_event(
                workspace_id=grant.workspace_id,
                appointment_id=appointment.id,
                actor_platform_user_id=principal.platform_user_id,
                actor_name=principal.display_name,
                action=action,
                changes=event_changes,
                request_id=get_request_id(),
            )
            self._repository.add_audit(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action="appointment.update",
                appointment_id=appointment.id,
                request_id=get_request_id(),
                details={"changedFields": sorted(changes), "version": appointment.version},
            )
            if had_pending_balance or will_have_pending_balance:
                PosService(self._session).sync_appointment_receivable(
                    principal=principal,
                    appointment=appointment,
                )
            if workspace is not None:
                event = None
                if status == "cancelled" and previous_status != "cancelled":
                    event = "appointment.cancelled"
                elif status == "confirmed" and previous_status != "confirmed":
                    event = "appointment.confirmed"
                elif status == "confirmed" and reminder_schedule_changed:
                    event = "appointment.rescheduled"
                if event:
                    queued = self._enqueue_notification(appointment, event, branch, workspace)
                    if queued is not None:
                        notifications.append(queued)
            if commit:
                self._session.commit()
            else:
                self._session.flush()
        except ConflictError:
            self._session.rollback()
            raise
        except IntegrityError as exc:
            self._session.rollback()
            if self._integrity_constraint(exc) in {
                "excl_appointments_resource_period",
                "excl_appointments_employee_period",
            }:
                raise self._slot_conflict() from exc
            raise ConflictError("No fue posible actualizar la cita.") from exc
        if commit:
            self._deliver_after_commit(notifications)
        records = self._repository.records_for_ids(grant.workspace_id, [appointment.id])
        if not records:
            raise RuntimeError("Updated appointment could not be reloaded.")
        return self._records_with_notifications(tuple(records), notifications)[0]

    def deactivate_appointment(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        appointment_id: UUID,
        expected_version: int,
    ) -> None:
        appointment = self._repository.get_appointment(
            workspace_id=grant.workspace_id,
            appointment_id=appointment_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            lock=True,
        )
        if appointment is None:
            raise ResourceNotFoundError("La cita no existe.", "appointmentId")
        if appointment.version != expected_version:
            raise ConflictError("La cita cambió desde la última lectura.", "version")
        if not self._resource_visible(
            workspace_id=grant.workspace_id,
            branch_id=appointment.branch_id,
            resource_id=appointment.resource_id,
            platform_user_id=principal.platform_user_id,
        ):
            raise AuthorizationError("No tienes acceso a esta cita.")
        self._require_resource_edit(
            workspace_id=grant.workspace_id,
            branch_id=appointment.branch_id,
            resource_id=appointment.resource_id,
            platform_user_id=principal.platform_user_id,
        )
        had_pending_balance = self._has_pending_balance(
            status=appointment.status,
            pending_payment=appointment.pending_payment,
            pending_amount=appointment.pending_amount,
        )
        if had_pending_balance:
            self._require_receivables_manage(principal, {appointment.branch_id})

        appointment.record_status = "inactive"
        appointment.deactivated_at = datetime.now(UTC)
        appointment.updated_by_platform_user_id = principal.platform_user_id
        appointment.version += 1

        try:
            self._session.flush()
            self._repository.add_event(
                workspace_id=grant.workspace_id,
                appointment_id=appointment.id,
                actor_platform_user_id=principal.platform_user_id,
                actor_name=principal.display_name,
                action="update",
                changes=[
                    {
                        "field": "recordStatus",
                        "label": "Registro",
                        "from": "active",
                        "to": "inactive",
                    }
                ],
                request_id=get_request_id(),
            )
            self._repository.add_audit(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action="appointment.delete",
                appointment_id=appointment.id,
                request_id=get_request_id(),
                details={
                    "branchId": str(appointment.branch_id),
                    "recordStatus": "inactive",
                    "version": appointment.version,
                },
            )
            if had_pending_balance:
                PosService(self._session).sync_appointment_receivable(
                    principal=principal,
                    appointment=appointment,
                )
            self._session.commit()
        except ConflictError:
            self._session.rollback()
            raise
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No fue posible eliminar la cita.") from exc

    @staticmethod
    def _appointment_import_idempotency_key(external_id: str) -> str:
        safe = external_id.strip()[:100]
        return f"ag-imp-{safe}"[:128]

    @staticmethod
    def _import_unlinked_customer_note(customer_name: str, customer_phone: str | None) -> str:
        if customer_phone:
            lead = f"{customer_name} ({customer_phone}) vinculado al importar."
        else:
            lead = f"{customer_name} vinculado al importar."
        return (
            f"{lead} No existía dicho cliente. "
            "Proceder a crearlo o seleccionar el cliente correspondiente."
        )

    @staticmethod
    def _compose_import_notes(
        customer_name: str,
        customer_phone: str | None,
        user_notes: str | None,
        *,
        customer_linked: bool,
    ) -> str | None:
        if customer_linked:
            return user_notes
        warning = AgendaService._import_unlinked_customer_note(customer_name, customer_phone)
        if user_notes:
            combined = f"{warning} {user_notes}"
            return combined[:_APPOINTMENT_NOTES_DB_MAX_LENGTH]
        return warning

    @staticmethod
    def _register_import_resource_lookups(
        resource: AppointmentResource,
        resource_by_code: dict[str, AppointmentResource],
        resource_by_name: dict[str, AppointmentResource],
    ) -> None:
        resource_by_code[normalize_name(resource.code)] = resource
        resource_by_name[normalize_name(resource.name)] = resource
        compact = normalize_name(resource.name).replace(" ", "")
        if compact:
            resource_by_name.setdefault(compact, resource)

    def _create_import_cabina_1_if_branch_empty(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        active_resources: list[AppointmentResource],
        resource_by_code: dict[str, AppointmentResource],
        resource_by_name: dict[str, AppointmentResource],
    ) -> AppointmentResource:
        if active_resources:
            raise ValueError("active_resources must be empty when creating import Cabina 1")
        code_key = normalize_name(_IMPORT_DEFAULT_RESOURCE_CODE)
        existing = resource_by_code.get(code_key)
        if existing is not None:
            return existing
        stored = self._repository.resource_by_code(
            workspace_id, branch_id, _IMPORT_DEFAULT_RESOURCE_CODE
        )
        if stored is not None:
            if stored.status != "active":
                stored.status = "active"
                self._session.flush()
            self._register_import_resource_lookups(stored, resource_by_code, resource_by_name)
            active_resources.append(stored)
            return stored
        resource = AppointmentResource(
            workspace_id=workspace_id,
            branch_id=branch_id,
            code=_IMPORT_DEFAULT_RESOURCE_CODE,
            name=_IMPORT_DEFAULT_RESOURCE_NAME,
            description=None,
            resource_type="room",
            status="active",
            sort_order=self._repository.next_resource_sort_order(workspace_id, branch_id),
        )
        self._repository.add_resource(resource)
        self._session.flush()
        self._register_import_resource_lookups(resource, resource_by_code, resource_by_name)
        active_resources.append(resource)
        return resource

    @staticmethod
    def _ordered_import_resources(
        resources: list[AppointmentResource],
    ) -> list[AppointmentResource]:
        cabina_aliases = {"cabina 1", "cabina1", "cab1", normalize_name("cabina-1")}

        def priority(resource: AppointmentResource) -> tuple[int, int, str]:
            keys = {
                normalize_name(resource.name),
                normalize_name(resource.code),
                normalize_name(resource.name).replace(" ", ""),
            }
            is_cabina_1 = bool(keys & cabina_aliases) or normalize_name(resource.name) == "cabina 1"
            return (0 if is_cabina_1 else 1, resource.sort_order, resource.name.casefold())

        return sorted(resources, key=priority)

    def _resource_fits_import_slot(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        resource_id: UUID,
        employee_id: UUID | None,
        starts_at: datetime,
        ends_at: datetime,
    ) -> bool:
        try:
            self._ensure_slot_available(
                workspace_id=workspace_id,
                branch_id=branch_id,
                resource_id=resource_id,
                employee_id=employee_id,
                starts_at=starts_at,
                ends_at=ends_at,
                resource_capacity=SHARED_RESOURCE_CAPACITY,
            )
            return True
        except ConflictError:
            return False

    def _import_batch_slot_fits(
        self,
        batch: _ImportBatchState,
        *,
        resource_id: UUID,
        employee_id: UUID | None,
        starts_at: datetime,
        ends_at: datetime,
    ) -> bool:
        batch.ensure_resource_locked(resource_id)
        if employee_id is not None:
            conflict = batch.repository.conflicting_appointment(
                workspace_id=batch.workspace_id,
                branch_id=batch.branch_id,
                resource_id=None,
                employee_id=employee_id,
                starts_at=starts_at,
                ends_at=ends_at,
            )
            if conflict is not None:
                return False
            for window_start, window_end in batch.employee_windows.get(employee_id, []):
                if window_start < ends_at and window_end > starts_at:
                    return False

        overlapping = batch.repository.overlapping_resource_appointments(
            workspace_id=batch.workspace_id,
            branch_id=batch.branch_id,
            resource_id=resource_id,
            starts_at=starts_at,
            ends_at=ends_at,
        )
        windows = [(item.starts_at, item.ends_at) for item in overlapping]
        windows.extend(batch.resource_windows.get(resource_id, []))
        return peak_occupancy(starts_at, ends_at, windows) <= SHARED_RESOURCE_CAPACITY

    def _import_slot_fits(
        self,
        *,
        batch: _ImportBatchState | None,
        workspace_id: UUID,
        branch_id: UUID,
        resource_id: UUID,
        employee_id: UUID | None,
        starts_at: datetime,
        ends_at: datetime,
    ) -> bool:
        if batch is not None:
            return self._import_batch_slot_fits(
                batch,
                resource_id=resource_id,
                employee_id=employee_id,
                starts_at=starts_at,
                ends_at=ends_at,
            )
        return self._resource_fits_import_slot(
            workspace_id=workspace_id,
            branch_id=branch_id,
            resource_id=resource_id,
            employee_id=employee_id,
            starts_at=starts_at,
            ends_at=ends_at,
        )

    def _resolve_import_resource(
        self,
        *,
        item: dict[str, Any],
        workspace_id: UUID,
        branch_id: UUID,
        branch: Branch,
        active_resources: list[AppointmentResource],
        resource_by_code: dict[str, AppointmentResource],
        resource_by_name: dict[str, AppointmentResource],
        employee_id: UUID | None,
        batch: _ImportBatchState | None = None,
    ) -> tuple[AppointmentResource, bool, datetime, datetime]:
        scheduled_date = cast(date, item["date"])
        scheduled_time = cast(time, item["time"])
        starts_at, ends_at = self._schedule_window(
            scheduled_date=scheduled_date,
            scheduled_time=scheduled_time,
            duration_minutes=cast(int, item["duration"]),
            timezone=branch.timezone,
        )
        raw_resource_name = cast(str | None, item.get("resource_name"))
        if raw_resource_name:
            resource_key = normalize_name(raw_resource_name)
            matched = resource_by_code.get(resource_key) or resource_by_name.get(resource_key)
            if matched is not None:
                if self._import_slot_fits(
                    batch=batch,
                    workspace_id=workspace_id,
                    branch_id=branch_id,
                    resource_id=matched.id,
                    employee_id=employee_id,
                    starts_at=starts_at,
                    ends_at=ends_at,
                ):
                    return matched, False, starts_at, ends_at
                return matched, True, starts_at, ends_at

        default_key = normalize_name(_IMPORT_DEFAULT_RESOURCE_CODE)
        preferred = resource_by_code.get(default_key)
        if preferred is not None:
            if self._import_slot_fits(
                batch=batch,
                workspace_id=workspace_id,
                branch_id=branch_id,
                resource_id=preferred.id,
                employee_id=employee_id,
                starts_at=starts_at,
                ends_at=ends_at,
            ):
                return preferred, False, starts_at, ends_at
            return preferred, True, starts_at, ends_at

        if not active_resources:
            resource = self._create_import_cabina_1_if_branch_empty(
                workspace_id=workspace_id,
                branch_id=branch_id,
                active_resources=active_resources,
                resource_by_code=resource_by_code,
                resource_by_name=resource_by_name,
            )
            return resource, False, starts_at, ends_at

        if len(active_resources) == 1:
            resource = active_resources[0]
            if self._import_slot_fits(
                batch=batch,
                workspace_id=workspace_id,
                branch_id=branch_id,
                resource_id=resource.id,
                employee_id=employee_id,
                starts_at=starts_at,
                ends_at=ends_at,
            ):
                return resource, False, starts_at, ends_at
            return resource, True, starts_at, ends_at

        for resource in self._ordered_import_resources(active_resources):
            if self._import_slot_fits(
                batch=batch,
                workspace_id=workspace_id,
                branch_id=branch_id,
                resource_id=resource.id,
                employee_id=employee_id,
                starts_at=starts_at,
                ends_at=ends_at,
            ):
                return resource, False, starts_at, ends_at

        fallback = self._ordered_import_resources(active_resources)[0]
        return fallback, True, starts_at, ends_at

    def _prefetch_import_skip_appointments(
        self,
        workspace_id: UUID,
        items: list[dict[str, Any]],
    ) -> dict[str, Appointment]:
        external_to_key: dict[str, str] = {}
        for raw in items:
            external_hint = raw.get("external_id") or raw.get("externalId")
            if not external_hint:
                continue
            external_id = str(external_hint).strip()
            if not external_id:
                continue
            external_to_key[external_id] = self._appointment_import_idempotency_key(external_id)
        if not external_to_key:
            return {}
        by_key = self._repository.active_appointments_by_idempotency_keys(
            workspace_id, list(external_to_key.values())
        )
        skipped: dict[str, Appointment] = {}
        for external_id, key in external_to_key.items():
            appointment = by_key.get(key)
            if appointment is not None:
                skipped[external_id] = appointment
        return skipped

    def _insert_imported_appointment(
        self,
        *,
        principal: AuthPrincipal,
        branch: Branch,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> Appointment:
        self._validate_notes(values.get("notes"), max_length=_APPOINTMENT_NOTES_DB_MAX_LENGTH)
        branch_id = cast(UUID, values["branch_id"])
        resource_id = cast(UUID, values["resource_id"])
        employee_id = cast(UUID | None, values.get("employee_id"))
        customer_id = cast(UUID | None, values.get("customer_id"))
        service_id = cast(UUID | None, values.get("service_id"))
        fingerprint = self._fingerprint(values)
        scheduled_date = cast(date, values["date"])
        scheduled_time = cast(time, values["time"])
        starts_at, ends_at = self._schedule_window(
            scheduled_date=scheduled_date,
            scheduled_time=scheduled_time,
            duration_minutes=cast(int, values["duration"]),
            timezone=branch.timezone,
        )
        status = cast(str, values["status"])
        appointment = Appointment(
            workspace_id=branch.workspace_id,
            branch_id=branch_id,
            resource_id=resource_id,
            customer_id=customer_id,
            employee_id=employee_id,
            service_id=service_id,
            scheduled_date=scheduled_date,
            scheduled_time=scheduled_time,
            timezone=branch.timezone,
            starts_at=starts_at,
            ends_at=ends_at,
            duration_minutes=cast(int, values["duration"]),
            customer_name=cast(str, values["customer_name"]),
            customer_phone=cast(str | None, values.get("customer_phone")),
            service_name=cast(str, values["service_name"]),
            price=cast(Decimal, values["price"]),
            status=status,
            notes=cast(str | None, values.get("notes")),
            pending_payment=cast(bool, values["pending_payment"]),
            pending_amount=cast(Decimal, values["pending_amount"]),
            first_time=cast(bool, values["first_time"]),
            free_trial=cast(bool, values["free_trial"]),
            reminder_sent=False,
            source=cast(str, values["source"]),
            recurrence=cast(str, values["recurrence"]),
            recurrence_group_id=None,
            occurrence_index=0,
            repeat_count=cast(int, values["repeat_count"]),
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            created_by_platform_user_id=principal.platform_user_id,
            updated_by_platform_user_id=principal.platform_user_id,
        )
        self._repository.add_appointment(appointment)
        self._session.flush()
        changes = self._creation_changes(appointment)
        self._repository.add_event(
            workspace_id=branch.workspace_id,
            appointment_id=appointment.id,
            actor_platform_user_id=principal.platform_user_id,
            actor_name=appointment_created_by_label(appointment, principal.display_name),
            action="create",
            changes=changes,
            request_id=get_request_id(),
        )
        self._repository.add_audit(
            workspace_id=branch.workspace_id,
            actor_platform_user_id=principal.platform_user_id,
            action="appointment.create",
            appointment_id=appointment.id,
            request_id=get_request_id(),
            details={
                "branchId": str(branch_id),
                "resourceId": str(resource_id),
                "employeeId": str(employee_id) if employee_id else None,
                "startsAt": starts_at.isoformat(),
                "endsAt": ends_at.isoformat(),
                "recurrenceGroupId": None,
            },
        )
        return appointment

    def import_appointments(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        branch_id: UUID,
        items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        self._require_branch_access(grant, branch_id)
        workspace_id = grant.workspace_id
        branch = self._repository.branch(workspace_id, branch_id)
        if branch is None:
            raise ResourceNotFoundError("La sucursal no existe o no está activa.", "branchId")
        destination_branch_ids = {branch_id}
        master_repo = MasterDataRepository(self._session)

        resources = [
            resource
            for resource in self._repository.list_resources(
                workspace_id=workspace_id, branch_id=branch_id
            )
            if resource.status == "active"
        ]
        resource_by_code: dict[str, AppointmentResource] = {}
        resource_by_name: dict[str, AppointmentResource] = {}
        for resource in resources:
            self._register_import_resource_lookups(resource, resource_by_code, resource_by_name)

        employee_rows = self._session.execute(
            select(Employee.id, Employee.first_name, Employee.last_name)
            .join(
                EmployeeBranchAssignment,
                (EmployeeBranchAssignment.workspace_id == Employee.workspace_id)
                & (EmployeeBranchAssignment.employee_id == Employee.id),
            )
            .where(
                Employee.workspace_id == workspace_id,
                Employee.status == "active",
                EmployeeBranchAssignment.branch_id == branch_id,
                EmployeeBranchAssignment.status == "active",
            )
        )
        employee_by_name: dict[str, UUID] = {}
        for row_employee_id, first_name, last_name in employee_rows:
            label = normalize_name(f"{first_name} {last_name}")
            employee_by_name.setdefault(label, row_employee_id)

        service_rows = self._session.execute(
            select(Item.id, Item.name)
            .join(
                ItemBranchAssignment,
                (ItemBranchAssignment.workspace_id == Item.workspace_id)
                & (ItemBranchAssignment.item_id == Item.id),
            )
            .join(
                InventoryItemProfile,
                (InventoryItemProfile.workspace_id == Item.workspace_id)
                & (InventoryItemProfile.item_id == Item.id),
            )
            .where(
                Item.workspace_id == workspace_id,
                Item.item_type == "service",
                Item.status == "active",
                ItemBranchAssignment.branch_id == branch_id,
                ItemBranchAssignment.status == "active",
                InventoryItemProfile.available_in_agenda.is_(True),
            )
        )
        service_by_name: dict[str, UUID] = {}
        for row_service_id, service_name in service_rows:
            service_by_name.setdefault(normalize_name(service_name), row_service_id)

        customer_lookup = build_import_customer_match_lookup(
            master_repo,
            workspace_id=workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            destination_branch_ids=destination_branch_ids,
            raw_items=items,
        )
        skip_by_external_id = self._prefetch_import_skip_appointments(workspace_id, items)
        batch = _ImportBatchState.create(
            self._repository,
            workspace_id=workspace_id,
            branch_id=branch_id,
        )

        results: list[dict[str, Any]] = []
        created_in_batch = False
        for raw in items:
            external_hint = raw.get("external_id") or raw.get("externalId")
            try:
                item = ImportAppointmentItem.model_validate(raw).model_dump(by_alias=False)
            except ValidationError as exc:
                first = cast(dict[str, Any], exc.errors()[0])
                message = friendly_validation_message(first)
                if first.get("type") == "value_error":
                    raw_msg = str(first.get("msg", ""))
                    if raw_msg.startswith("Value error, "):
                        message = raw_msg.removeprefix("Value error, ")
                    elif raw_msg:
                        message = raw_msg
                results.append(
                    {
                        "external_id": external_hint,
                        "appointment_id": None,
                        "customer_id": None,
                        "customer_linked": False,
                        "status": "error",
                        "message": message,
                        "customer_name": raw.get("customer_name") or raw.get("customerName"),
                        "phone": raw.get("customer_phone") or raw.get("customerPhone"),
                        "date": raw.get("date"),
                        "time": str(raw.get("time")) if raw.get("time") else None,
                        "service_name": raw.get("service_name") or raw.get("serviceName"),
                    }
                )
                continue

            external_id = item.get("external_id")
            customer_name = (item.get("customer_name") or "").strip()
            customer_phone = cast(str | None, item.get("customer_phone"))
            service_name = cast(str, item.get("service_name") or "")
            scheduled_date = cast(date, item["date"])
            scheduled_time = cast(time, item["time"])
            time_label = scheduled_time.strftime("%H:%M")

            if external_id:
                skipped_appointment = skip_by_external_id.get(str(external_id).strip())
                if skipped_appointment is not None:
                    results.append(
                        {
                            "external_id": external_id,
                            "appointment_id": skipped_appointment.id,
                            "customer_id": skipped_appointment.customer_id,
                            "customer_linked": skipped_appointment.customer_id is not None,
                            "status": "skipped",
                            "message": "Ya importado para este externalId.",
                            "customer_name": skipped_appointment.customer_name,
                            "phone": skipped_appointment.customer_phone,
                            "date": skipped_appointment.scheduled_date,
                            "time": skipped_appointment.scheduled_time.strftime("%H:%M"),
                            "service_name": skipped_appointment.service_name,
                        }
                    )
                    continue
                idempotency_key = self._appointment_import_idempotency_key(str(external_id))
            else:
                idempotency_key = f"ag-imp-row-{uuid7()}"[:128]

            employee_id: UUID | None = None
            specialist_name = cast(str | None, item.get("specialist_name"))
            if specialist_name:
                employee_id = employee_by_name.get(normalize_name(specialist_name))

            matched_resource, import_stacked, starts_at, ends_at = self._resolve_import_resource(
                item=item,
                workspace_id=workspace_id,
                branch_id=branch_id,
                branch=branch,
                active_resources=resources,
                resource_by_code=resource_by_code,
                resource_by_name=resource_by_name,
                employee_id=employee_id,
                batch=batch,
            )

            service_id: UUID | None = None
            if service_name:
                service_id = service_by_name.get(normalize_name(service_name))

            match_raw: dict[str, Any] = {}
            if customer_phone:
                match_raw["phone"] = customer_phone
            customer_email = item.get("customer_email")
            if customer_email:
                match_raw["email"] = str(customer_email)
            matches = resolve_import_customer_matches_from_lookup(customer_lookup, match_raw)
            customer_id = matches[0].id if matches else None
            customer_linked = customer_id is not None
            if customer_linked and not customer_name:
                customer_name = (matches[0].display_name or "").strip()
            if not customer_name:
                customer_name = (
                    (customer_phone or "").strip()
                    or (str(customer_email).strip() if customer_email else "")
                    or "Cliente"
                )
            import_notes = self._compose_import_notes(
                customer_name,
                customer_phone,
                cast(str | None, item.get("notes")),
                customer_linked=customer_linked,
            )
            if import_stacked:
                import_notes = (
                    f"{_IMPORT_STACK_NOTE} {import_notes}".strip()
                    if import_notes
                    else _IMPORT_STACK_NOTE
                )[:_APPOINTMENT_NOTES_DB_MAX_LENGTH]
            unlinked_message = (
                None
                if customer_linked
                else self._import_unlinked_customer_note(customer_name, customer_phone)
            )

            values: dict[str, Any] = {
                "branch_id": branch_id,
                "resource_id": matched_resource.id,
                "customer_id": customer_id,
                "employee_id": employee_id,
                "service_id": service_id,
                "any_available": False,
                "date": scheduled_date,
                "time": scheduled_time,
                "duration": item["duration"],
                "customer_name": customer_name,
                "customer_phone": customer_phone,
                "service_name": service_name,
                "price": item["price"],
                "status": "confirmed",
                "notes": import_notes,
                "pending_payment": False,
                "pending_amount": Decimal("0"),
                "first_time": False,
                "free_trial": False,
                "reminder_sent": False,
                "source": "staff",
                "recurrence": "none",
                "repeat_count": 1,
            }

            savepoint = self._session.begin_nested()
            try:
                appointment = self._insert_imported_appointment(
                    principal=principal,
                    branch=branch,
                    values=values,
                    idempotency_key=idempotency_key,
                )
                batch.register_booking(
                    resource_id=matched_resource.id,
                    employee_id=employee_id,
                    starts_at=starts_at,
                    ends_at=ends_at,
                )
                if external_id:
                    skip_by_external_id[str(external_id).strip()] = appointment
                savepoint.commit()
                created_in_batch = True
                results.append(
                    {
                        "external_id": external_id,
                        "appointment_id": appointment.id,
                        "customer_id": appointment.customer_id,
                        "customer_linked": customer_linked,
                        "status": "created",
                        "message": unlinked_message,
                        "customer_name": customer_name,
                        "phone": customer_phone,
                        "date": scheduled_date,
                        "time": time_label,
                        "service_name": service_name or None,
                        "import_stacked": import_stacked,
                    }
                )
            except (ConflictError, InvalidOperationError, ResourceNotFoundError) as exc:
                savepoint.rollback()
                results.append(
                    {
                        "external_id": external_id,
                        "appointment_id": None,
                        "customer_id": None,
                        "customer_linked": False,
                        "status": "error",
                        "message": str(exc),
                        "customer_name": customer_name,
                        "phone": customer_phone,
                        "date": scheduled_date,
                        "time": time_label,
                        "service_name": service_name or None,
                    }
                )
            except IntegrityError as exc:
                savepoint.rollback()
                results.append(
                    {
                        "external_id": external_id,
                        "appointment_id": None,
                        "customer_id": None,
                        "customer_linked": False,
                        "status": "error",
                        "message": str(exc.orig) if exc.orig else str(exc),
                        "customer_name": customer_name,
                        "phone": customer_phone,
                        "date": scheduled_date,
                        "time": time_label,
                        "service_name": service_name or None,
                    }
                )
            except Exception as exc:  # noqa: BLE001 - per-row import report
                savepoint.rollback()
                results.append(
                    {
                        "external_id": external_id,
                        "appointment_id": None,
                        "customer_id": None,
                        "customer_linked": False,
                        "status": "error",
                        "message": str(exc),
                        "customer_name": customer_name,
                        "phone": customer_phone,
                        "date": scheduled_date,
                        "time": time_label,
                        "service_name": service_name or None,
                    }
                )

        if created_in_batch:
            self._session.commit()
        return results

    def _validate_references(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        resource_id: UUID | None,
        employee_id: UUID | None,
        customer_id: UUID | None,
        service_id: UUID | None,
    ) -> None:
        if (
            resource_id is not None
            and self._repository.resource(workspace_id, branch_id, resource_id) is None
        ):
            raise ResourceNotFoundError(
                "La cabina o recurso no pertenece a la sucursal.", "resourceId"
            )
        if employee_id is not None and not self._repository.employee_available_in_branch(
            workspace_id, branch_id, employee_id
        ):
            raise ResourceNotFoundError("El empleado no está activo en esa sucursal.", "employeeId")
        if customer_id is not None and not self._repository.customer_available_in_branch(
            workspace_id, branch_id, customer_id
        ):
            raise ResourceNotFoundError("El cliente no está activo en esa sucursal.", "customerId")
        if service_id is not None and not self._repository.service_available_in_branch(
            workspace_id, branch_id, service_id
        ):
            raise ResourceNotFoundError(
                "El servicio no está disponible en esa sucursal.", "serviceId"
            )

    def _validate_employee_availability(
        self,
        *,
        workspace_id: UUID,
        employee_id: UUID | None,
        scheduled_date: date,
        starts_at: datetime,
        ends_at: datetime,
    ) -> None:
        if employee_id is None:
            return
        if self._repository.employee_on_approved_leave(workspace_id, employee_id, scheduled_date):
            raise ConflictError("El empleado está de vacaciones en esa fecha.", "employeeId")
        schedule = self._repository.employee_schedule(workspace_id, employee_id)
        if schedule is None or not schedule.weekly_schedule:
            return
        try:
            schedule_timezone = ZoneInfo(schedule.timezone)
        except ZoneInfoNotFoundError as exc:
            raise InvalidOperationError(
                "El horario del empleado tiene una zona horaria inválida.", "employeeId"
            ) from exc
        local_start = starts_at.astimezone(schedule_timezone)
        local_end = ends_at.astimezone(schedule_timezone)
        blocks = schedule.weekly_schedule.get(_WEEKDAY_KEYS[local_start.weekday()], [])
        fits = local_start.date() == local_end.date() and any(
            self._inside_block(local_start.time(), local_end.time(), block)
            for block in blocks
            if isinstance(block, dict)
        )
        if not fits:
            raise ConflictError(
                "El horario está fuera de la jornada configurada del empleado.", "time"
            )

    @staticmethod
    def _inside_block(start: time, end: time, block: dict[str, Any]) -> bool:
        try:
            block_start = time.fromisoformat(str(block["start"]))
            block_end = time.fromisoformat(str(block["end"]))
        except KeyError, TypeError, ValueError:
            return False
        return start >= block_start and end <= block_end

    @staticmethod
    def _schedule_window(
        *,
        scheduled_date: date,
        scheduled_time: time,
        duration_minutes: int,
        timezone: str,
    ) -> tuple[datetime, datetime]:
        try:
            zone = ZoneInfo(timezone)
        except ZoneInfoNotFoundError as exc:
            raise InvalidOperationError(
                "La sucursal tiene una zona horaria inválida.", "branchId"
            ) from exc
        naive = datetime.combine(scheduled_date, scheduled_time.replace(tzinfo=None))
        local_start = naive.replace(tzinfo=zone)
        starts_at = local_start.astimezone(UTC)
        if starts_at.astimezone(zone).replace(tzinfo=None) != naive:
            raise InvalidOperationError(
                "La hora no existe en la zona horaria de la sucursal.", "time"
            )
        return starts_at, starts_at + timedelta(minutes=duration_minutes)

    @staticmethod
    def _recurrence_dates(first_date: date, recurrence: str, repeat_count: int) -> list[date]:
        if recurrence == "none":
            return [first_date]
        if recurrence == "weekly":
            return [first_date + timedelta(days=7 * index) for index in range(repeat_count)]
        result: list[date] = []
        for index in range(repeat_count):
            month_index = first_date.month - 1 + index
            year = first_date.year + month_index // 12
            month = month_index % 12 + 1
            day = min(first_date.day, monthrange(year, month)[1])
            result.append(date(year, month, day))
        return result

    @staticmethod
    def _validate_money(values: dict[str, Any]) -> None:
        price = cast(Decimal, values["price"])
        pending_amount = cast(Decimal, values["pending_amount"])
        pending_payment = cast(bool, values["pending_payment"])
        if pending_amount > price:
            raise InvalidOperationError(
                "El monto pendiente no puede superar el precio.", "pendingAmount"
            )
        if not pending_payment and pending_amount != 0:
            raise InvalidOperationError(
                "Activa pago pendiente antes de indicar un monto.", "pendingAmount"
            )

    @staticmethod
    def _validate_notes(
        notes: Any, *, existing: str | None = None, max_length: int = _APPOINTMENT_NOTES_MAX_LENGTH
    ) -> None:
        if notes == existing:
            return
        if len(cast(str | None, notes) or "") > max_length:
            raise InvalidOperationError(
                "Las notas de la cita admiten un máximo de 60 caracteres.",
                "notes",
            )

    @staticmethod
    def _resolve_completion_fields(
        *,
        appointment: Appointment,
        status: str,
        changes: dict[str, Any],
    ) -> dict[str, Any]:
        if status != "fulfilled":
            return {
                "completed_at": None,
                "completion_punctuality": None,
                "delay_responsibility": None,
                "completion_note": None,
            }
        punctuality = changes.get("completion_punctuality", appointment.completion_punctuality)
        if punctuality is None:
            punctuality = "on_time"
        delay_responsibility = changes.get("delay_responsibility", appointment.delay_responsibility)
        if punctuality == "delayed" and delay_responsibility is None:
            raise InvalidOperationError(
                "Indica si el retraso fue del centro o del cliente.",
                "delayResponsibility",
            )
        completed_at = changes.get("completed_at", appointment.completed_at)
        if completed_at is None:
            completed_at = datetime.now(UTC)
        completion_note = changes.get("completion_note", appointment.completion_note)
        return {
            "completed_at": completed_at,
            "completion_punctuality": punctuality,
            "delay_responsibility": delay_responsibility if punctuality == "delayed" else None,
            "completion_note": completion_note if punctuality == "delayed" else None,
        }

    @staticmethod
    def _has_pending_balance(
        *,
        status: str,
        pending_payment: bool,
        pending_amount: Decimal,
    ) -> bool:
        return status != "cancelled" and pending_payment and pending_amount > 0

    def _require_receivables_manage(
        self,
        principal: AuthPrincipal,
        branch_ids: set[UUID],
    ) -> None:
        grant = AuthorizationService(self._session).require_permission(
            principal,
            "pos.receivables.manage",
        )
        for branch_id in branch_ids:
            self._require_branch_access(grant, branch_id)

    @staticmethod
    def _fingerprint(values: dict[str, Any]) -> str:
        encoded = json.dumps(values, sort_keys=True, default=str, separators=(",", ":"))
        return sha256(encoded.encode("utf-8")).hexdigest()

    @staticmethod
    def _public_values(appointment: Appointment) -> dict[str, Any]:
        return {
            "scheduled_date": appointment.scheduled_date.isoformat(),
            "scheduled_time": appointment.scheduled_time.strftime("%H:%M"),
            "duration_minutes": appointment.duration_minutes,
            "customer_name": appointment.customer_name,
            "customer_phone": appointment.customer_phone,
            "service_name": appointment.service_name,
            "employee_id": str(appointment.employee_id) if appointment.employee_id else None,
            "branch_id": str(appointment.branch_id),
            "resource_id": str(appointment.resource_id),
            "status": appointment.status,
            "completed_at": (
                appointment.completed_at.isoformat()
                if appointment.completed_at is not None
                else None
            ),
            "completion_punctuality": appointment.completion_punctuality,
            "delay_responsibility": appointment.delay_responsibility,
            "completion_note": appointment.completion_note,
            "price": str(appointment.price),
            "notes": appointment.notes,
            "pending_payment": appointment.pending_payment,
            "pending_amount": str(appointment.pending_amount),
            "first_time": appointment.first_time,
            "free_trial": appointment.free_trial,
            "reminder_sent": appointment.reminder_sent,
        }

    @classmethod
    def _creation_changes(cls, appointment: Appointment) -> list[dict[str, Any]]:
        return [
            {"field": field, "label": label, "from": "—", "to": value}
            for internal, (field, label) in _FIELD_META.items()
            if (value := cls._public_values(appointment)[internal]) not in (None, "", False, 0, "0")
        ]

    @staticmethod
    def _diff_changes(before: dict[str, Any], after: dict[str, Any]) -> list[dict[str, Any]]:
        return [
            {
                "field": field,
                "label": label,
                "from": before[internal] if before[internal] not in (None, "") else "—",
                "to": after[internal] if after[internal] not in (None, "") else "—",
            }
            for internal, (field, label) in _FIELD_META.items()
            if before[internal] != after[internal]
        ]

    def _ensure_slot_available(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        resource_id: UUID | None,
        employee_id: UUID | None,
        starts_at: datetime,
        ends_at: datetime,
        resource_capacity: int,
        exclude_appointment_id: UUID | None = None,
    ) -> None:
        # The cabin has no exclusion constraint anymore; this row lock serializes its bookings.
        resource = (
            self._repository.lock_resource(workspace_id, branch_id, resource_id)
            if resource_id is not None
            else None
        )
        if resource_capacity <= 1 or resource_id is None:
            conflict = self._repository.conflicting_appointment(
                workspace_id=workspace_id,
                branch_id=branch_id,
                resource_id=resource_id,
                employee_id=employee_id,
                starts_at=starts_at,
                ends_at=ends_at,
                exclude_appointment_id=exclude_appointment_id,
            )
            if conflict is not None:
                raise self._slot_conflict()
            return
        if employee_id is not None:
            conflict = self._repository.conflicting_appointment(
                workspace_id=workspace_id,
                branch_id=branch_id,
                resource_id=None,
                employee_id=employee_id,
                starts_at=starts_at,
                ends_at=ends_at,
                exclude_appointment_id=exclude_appointment_id,
            )
            if conflict is not None:
                raise self._slot_conflict()
        overlapping = self._repository.overlapping_resource_appointments(
            workspace_id=workspace_id,
            branch_id=branch_id,
            resource_id=resource_id,
            starts_at=starts_at,
            ends_at=ends_at,
            exclude_appointment_id=exclude_appointment_id,
        )
        windows = [(item.starts_at, item.ends_at) for item in overlapping]
        if peak_occupancy(starts_at, ends_at, windows) > resource_capacity:
            name = resource.name if resource is not None else "La cabina"
            raise ConflictError(
                f"{name} ya tiene {resource_capacity} personas en ese horario.",
                "cabinaId",
            )

    @staticmethod
    def _slot_conflict() -> ConflictError:
        return ConflictError(
            "Ese horario ya no está disponible; existe otra cita para la cabina o el empleado.",
            "time",
        )

    @staticmethod
    def _integrity_constraint(exc: IntegrityError) -> str | None:
        diagnostic = getattr(exc.orig, "diag", None)
        return cast(str | None, getattr(diagnostic, "constraint_name", None))

    @staticmethod
    def _require_branch_access(grant: PermissionGrant, branch_id: UUID) -> None:
        if grant.allowed_branch_ids is not None and branch_id not in grant.allowed_branch_ids:
            raise AuthorizationError("No puedes usar una sucursal fuera de tu alcance.")

    def _bookable_listed_resources(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        platform_user_id: UUID,
    ) -> tuple[ListedAppointmentResource, ...]:
        resources = self._repository.list_resources(
            workspace_id=workspace_id,
            branch_id=branch_id,
        )
        listed = self._filter_listed_resources(
            workspace_id=workspace_id,
            branch_id=branch_id,
            platform_user_id=platform_user_id,
            resources=resources,
        )
        return tuple(item for item in listed if item.access in {"use", "edit"})

    def _resolve_staff_any_available(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        platform_user_id: UUID,
        scheduled_date: date,
        starts_at: datetime,
        ends_at: datetime,
        bookable: tuple[ListedAppointmentResource, ...],
    ) -> tuple[UUID, UUID | None]:
        employees = self._repository.list_active_branch_employee_ids(workspace_id, branch_id)
        ordered = sorted(
            bookable,
            key=lambda item: (item.resource.sort_order, item.resource.name),
        )
        for listing in ordered:
            resource_id = listing.resource.id
            for employee_id in employees:
                try:
                    self._validate_employee_availability(
                        workspace_id=workspace_id,
                        employee_id=employee_id,
                        scheduled_date=scheduled_date,
                        starts_at=starts_at,
                        ends_at=ends_at,
                    )
                except ConflictError:
                    continue
                conflict = self._repository.conflicting_appointment(
                    workspace_id=workspace_id,
                    branch_id=branch_id,
                    resource_id=resource_id,
                    employee_id=employee_id,
                    starts_at=starts_at,
                    ends_at=ends_at,
                )
                if conflict is None:
                    return resource_id, employee_id
            conflict = self._repository.conflicting_appointment(
                workspace_id=workspace_id,
                branch_id=branch_id,
                resource_id=resource_id,
                employee_id=None,
                starts_at=starts_at,
                ends_at=ends_at,
            )
            if conflict is None:
                return resource_id, None
        raise self._slot_conflict()

    def _branch_acl_map(self, workspace_id: UUID, branch_id: UUID) -> dict[UUID, dict[UUID, str]]:
        acl_by_resource: dict[UUID, dict[UUID, str]] = {}
        for row in self._repository.acl_rows_for_branch(workspace_id, branch_id):
            acl_by_resource.setdefault(row.resource_id, {})[row.platform_user_id] = row.access
        return acl_by_resource

    @staticmethod
    def _resource_access(
        *,
        resource_id: UUID,
        platform_user_id: UUID,
        acl_by_resource: dict[UUID, dict[UUID, str]],
    ) -> str | None:
        """A user without grants in the branch sees every cabin; otherwise only granted ones."""
        restricted = any(platform_user_id in grants for grants in acl_by_resource.values())
        if not restricted:
            return "edit"
        return acl_by_resource.get(resource_id, {}).get(platform_user_id)

    def _resource_visible(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        resource_id: UUID | None,
        platform_user_id: UUID,
    ) -> bool:
        if resource_id is None:
            return True
        access = self._resolved_resource_access(
            workspace_id=workspace_id,
            branch_id=branch_id,
            resource_id=resource_id,
            platform_user_id=platform_user_id,
        )
        return access in {"view", "use", "edit"}

    def _require_resource_use(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        resource_id: UUID | None,
        platform_user_id: UUID,
    ) -> None:
        if resource_id is None:
            return
        access = self._resolved_resource_access(
            workspace_id=workspace_id,
            branch_id=branch_id,
            resource_id=resource_id,
            platform_user_id=platform_user_id,
        )
        if access not in {"use", "edit"}:
            raise AuthorizationError("No tienes permiso para usar esta cabina.")

    def _require_resource_edit(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        resource_id: UUID | None,
        platform_user_id: UUID,
    ) -> None:
        if resource_id is None:
            return
        access = self._resolved_resource_access(
            workspace_id=workspace_id,
            branch_id=branch_id,
            resource_id=resource_id,
            platform_user_id=platform_user_id,
        )
        if access != "edit":
            raise AuthorizationError("No tienes permiso para editar citas en esta cabina.")

    def _resolved_resource_access(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        resource_id: UUID,
        platform_user_id: UUID,
    ) -> str | None:
        return self._resource_access(
            resource_id=resource_id,
            platform_user_id=platform_user_id,
            acl_by_resource=self._branch_acl_map(workspace_id, branch_id),
        )

    def _filter_listed_resources(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        platform_user_id: UUID,
        resources: tuple[AppointmentResource, ...],
    ) -> tuple[ListedAppointmentResource, ...]:
        acl_by_resource = self._branch_acl_map(workspace_id, branch_id)
        listed: list[ListedAppointmentResource] = []
        for resource in resources:
            access = self._resource_access(
                resource_id=resource.id,
                platform_user_id=platform_user_id,
                acl_by_resource=acl_by_resource,
            )
            if access in {"view", "use", "edit"}:
                listed.append(ListedAppointmentResource(resource=resource, access=access))
        return tuple(listed)

    def _visible_resource_ids(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID | None,
        allowed_branch_ids: frozenset[UUID] | None,
        platform_user_id: UUID,
    ) -> frozenset[UUID]:
        if branch_id is not None:
            branch_ids = frozenset({branch_id})
        elif allowed_branch_ids is not None:
            branch_ids = allowed_branch_ids
        else:
            branches = self._session.scalars(
                select(Branch.id).where(
                    Branch.workspace_id == workspace_id,
                    Branch.status == "active",
                )
            )
            branch_ids = frozenset(branches)
        resources = self._repository.list_resources_in_branches(
            workspace_id=workspace_id,
            branch_ids=branch_ids,
        )
        acl_maps: dict[UUID, dict[UUID, dict[UUID, str]]] = {}
        visible: set[UUID] = set()
        for resource in resources:
            if resource.branch_id not in acl_maps:
                acl_maps[resource.branch_id] = self._branch_acl_map(
                    workspace_id, resource.branch_id
                )
            access = self._resource_access(
                resource_id=resource.id,
                platform_user_id=platform_user_id,
                acl_by_resource=acl_maps[resource.branch_id],
            )
            if access in {"view", "use", "edit"}:
                visible.add(resource.id)
        return frozenset(visible)
