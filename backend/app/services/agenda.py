from __future__ import annotations

import json
from calendar import monthrange
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from hashlib import sha256
from typing import Any, cast
from uuid import UUID, uuid7
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.db.models import Appointment
from app.db.models.agenda import ACTIVE_APPOINTMENT_STATUSES
from app.repositories.agenda import (
    AgendaRepository,
    AppointmentListResult,
    AppointmentRecord,
)
from app.services.auth import AuthPrincipal
from app.services.authorization import AuthorizationService, PermissionGrant
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)
from app.services.pos import PosService

_WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
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

    def list_resources(self, grant: PermissionGrant, branch_id: UUID) -> tuple[Any, ...]:
        self._require_branch_access(grant, branch_id)
        if self._repository.branch(grant.workspace_id, branch_id) is None:
            raise ResourceNotFoundError("La sucursal no existe o no está activa.", "branchId")
        return self._repository.list_resources(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
        )

    def list_appointments(
        self,
        *,
        grant: PermissionGrant,
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
        return self._repository.list_appointments(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            date_from=date_from,
            date_to=date_to,
            search=normalized_search,
            employee_id=employee_id,
            status=status,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )

    def create_appointments(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> tuple[AppointmentRecord, ...]:
        branch_id = cast(UUID, values["branch_id"])
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

        resource_id = cast(UUID, values["resource_id"])
        employee_id = cast(UUID | None, values.get("employee_id"))
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
        self._validate_money(values)

        recurrence = cast(str, values["recurrence"])
        repeat_count = cast(int, values["repeat_count"])
        scheduled_dates = self._recurrence_dates(
            cast(date, values["date"]), recurrence, repeat_count
        )
        recurrence_group_id = uuid7() if len(scheduled_dates) > 1 else None
        appointments: list[Appointment] = []

        try:
            for occurrence_index, scheduled_date in enumerate(scheduled_dates):
                starts_at, ends_at = self._schedule_window(
                    scheduled_date=scheduled_date,
                    scheduled_time=cast(time, values["time"]),
                    duration_minutes=cast(int, values["duration"]),
                    timezone=branch.timezone,
                )
                self._validate_employee_availability(
                    workspace_id=grant.workspace_id,
                    employee_id=employee_id,
                    scheduled_date=scheduled_date,
                    starts_at=starts_at,
                    ends_at=ends_at,
                )
                conflict = self._repository.conflicting_appointment(
                    workspace_id=grant.workspace_id,
                    branch_id=branch_id,
                    resource_id=resource_id,
                    employee_id=employee_id,
                    starts_at=starts_at,
                    ends_at=ends_at,
                )
                if conflict is not None:
                    raise self._slot_conflict()

                status = cast(str, values["status"])
                is_cancelled = status == "cancelled"
                appointment = Appointment(
                    workspace_id=grant.workspace_id,
                    branch_id=branch_id,
                    resource_id=resource_id,
                    customer_id=customer_id,
                    employee_id=employee_id,
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
                    reminder_sent=cast(bool, values["reminder_sent"]),
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
                changes = self._creation_changes(appointment)
                self._repository.add_event(
                    workspace_id=grant.workspace_id,
                    appointment_id=appointment.id,
                    actor_platform_user_id=principal.platform_user_id,
                    actor_name=principal.display_name,
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
            self._session.commit()
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

        return self._repository.records_for_ids(
            grant.workspace_id, [appointment.id for appointment in appointments]
        )

    def update_appointment(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        appointment_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
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

        branch_id = cast(UUID, changes.get("branch_id", appointment.branch_id))
        self._require_branch_access(grant, branch_id)
        branch = self._repository.branch(grant.workspace_id, branch_id)
        if branch is None:
            raise ResourceNotFoundError("La sucursal no existe o no está activa.", "branchId")
        resource_id = cast(UUID, changes.get("resource_id", appointment.resource_id))
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

        scheduled_date = cast(date, changes.get("date", appointment.scheduled_date))
        scheduled_time = cast(time, changes.get("time", appointment.scheduled_time))
        duration = cast(int, changes.get("duration", appointment.duration_minutes))
        starts_at, ends_at = self._schedule_window(
            scheduled_date=scheduled_date,
            scheduled_time=scheduled_time,
            duration_minutes=duration,
            timezone=branch.timezone,
        )
        status = cast(str, changes.get("status", appointment.status))
        if status in ACTIVE_APPOINTMENT_STATUSES:
            self._validate_employee_availability(
                workspace_id=grant.workspace_id,
                employee_id=employee_id,
                scheduled_date=scheduled_date,
                starts_at=starts_at,
                ends_at=ends_at,
            )
            conflict = self._repository.conflicting_appointment(
                workspace_id=grant.workspace_id,
                branch_id=branch_id,
                resource_id=resource_id,
                employee_id=employee_id,
                starts_at=starts_at,
                ends_at=ends_at,
                exclude_appointment_id=appointment.id,
            )
            if conflict is not None:
                raise self._slot_conflict()

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
            "notes": changes.get("notes", appointment.notes),
            "pending_payment": final_money["pending_payment"],
            "pending_amount": final_money["pending_amount"],
            "first_time": changes.get("first_time", appointment.first_time),
            "free_trial": changes.get("free_trial", appointment.free_trial),
            "reminder_sent": changes.get("reminder_sent", appointment.reminder_sent),
        }
        for field, value in field_mapping.items():
            setattr(appointment, field, value)
        appointment.updated_by_platform_user_id = principal.platform_user_id
        appointment.version += 1
        after = self._public_values(appointment)
        event_changes = self._diff_changes(before, after)
        action = "status_change" if set(changes) == {"status"} else "update"

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
            self._session.commit()
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
        records = self._repository.records_for_ids(grant.workspace_id, [appointment.id])
        if not records:
            raise RuntimeError("Updated appointment could not be reloaded.")
        return records[0]

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

    def _validate_references(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        resource_id: UUID,
        employee_id: UUID | None,
        customer_id: UUID | None,
        service_id: UUID | None,
    ) -> None:
        if self._repository.resource(workspace_id, branch_id, resource_id) is None:
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
