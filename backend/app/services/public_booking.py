from __future__ import annotations

import json
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from hashlib import sha256
from typing import Any, cast
from uuid import UUID, uuid7
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.models import (
    Appointment,
    Branch,
    CustomerBranchAssignment,
    Employee,
    EmployeeBranchAssignment,
    InventoryItemProfile,
    Item,
    ItemBranchAssignment,
    PlatformUser,
    Workspace,
    WorkspaceMembership,
)
from app.db.models.email_notifications import EmailNotification
from app.repositories.agenda import AgendaRepository
from app.repositories.master_data import MasterDataRepository
from app.services.agenda import AgendaService
from app.services.appointment_reminders import AppointmentReminderService
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.booking_availability import get_available_slots
from app.services.booking_tokens import (
    issue_appointment_management_token,
    verify_appointment_management_token,
)
from app.services.customer_documents import (
    normalize_document_id,
    prepare_customer_document_fields,
)
from app.services.email_notifications import deliver_email, enqueue_email, notification_result
from app.services.errors import ConflictError, InvalidOperationError, ResourceNotFoundError
from app.services.mailer import render_appointment_email
from app.services.master_data import normalize_name


class PublicBookingService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._agenda = AgendaRepository(session)
        self._master_data = MasterDataRepository(session)

    def get_context(self, branch_id: UUID) -> dict[str, Any]:
        branch, workspace = self._resolve_branch(branch_id)
        _principal, grant = self._system_access(branch.workspace_id)
        services = self._list_services(grant, branch.id)
        specialists = self._list_specialists(branch.workspace_id, branch.id)
        return {
            "branch": {
                "branch_id": branch.id,
                "branch_name": branch.name,
                "workspace_name": workspace.name,
                "timezone": branch.timezone,
            },
            "has_resources": bool(self._active_resources(branch)),
            "services": services,
            "specialists": specialists,
        }

    def identify(self, branch_id: UUID, document_type: str, document_id: str) -> dict[str, Any]:
        branch, _workspace = self._resolve_branch(branch_id)
        normalized = self._normalized_document(document_type, document_id)
        customer = self._master_data.customer_by_document(branch.workspace_id, normalized)
        if customer is None:
            return {
                "customer_id": None,
                "is_new": True,
                "document_type": document_type,
                "document_id": document_id,
                "display_name": None,
                "email": None,
                "phone": None,
                "wants_invoice": False,
                "wants_contact": False,
                "address": None,
            }
        extras = self._profile_extras(customer.id)
        return {
            "customer_id": customer.id,
            "is_new": False,
            "document_type": customer.document_type or document_type,
            "document_id": customer.document_id or document_id,
            "display_name": customer.display_name,
            "email": customer.email,
            "phone": customer.phone,
            **extras,
        }

    def list_slots(
        self,
        branch_id: UUID,
        *,
        scheduled_date: date,
        employee_id: UUID,
        duration_minutes: int,
    ) -> list[str]:
        return sorted(
            self._slot_resources(branch_id, scheduled_date, employee_id, duration_minutes)
        )

    def _active_resources(self, branch: Branch) -> list[Any]:
        return [
            resource
            for resource in self._agenda.list_resources(
                workspace_id=branch.workspace_id,
                branch_id=branch.id,
            )
            if resource.status == "active"
        ]

    def _lock(self, value: str) -> None:
        key = int.from_bytes(sha256(value.encode()).digest()[:8], "big", signed=True)
        self._session.execute(select(func.pg_advisory_xact_lock(key)))

    def _slot_resources(
        self,
        branch_id: UUID,
        scheduled_date: date,
        employee_id: UUID,
        duration: int,
        exclude_appointment_id: UUID | None = None,
    ) -> dict[str, list[UUID]]:
        branch, _ = self._resolve_branch(branch_id)
        employee = self._require_specialist(branch.workspace_id, branch.id, employee_id)
        resources = self._active_resources(branch)
        if not resources:
            return {}
        schedule = self._agenda.employee_schedule(branch.workspace_id, employee.id)
        branch_zone = ZoneInfo(branch.timezone)
        schedule_zone = ZoneInfo(schedule.timezone) if schedule else branch_zone
        day_start = datetime.combine(scheduled_date, time.min, branch_zone).astimezone(UTC)
        day_end = datetime.combine(
            scheduled_date + timedelta(days=1), time.min, branch_zone
        ).astimezone(UTC)
        conflicts = self._session.scalars(
            select(Appointment).where(
                Appointment.workspace_id == branch.workspace_id,
                Appointment.record_status == "active",
                Appointment.status == "confirmed",
                Appointment.starts_at < day_end + timedelta(minutes=duration),
                Appointment.ends_at > day_start,
                or_(
                    Appointment.employee_id == employee_id,
                    Appointment.resource_id.in_([resource.id for resource in resources]),
                ),
            )
        ).all()
        now = datetime.now(UTC)
        result: dict[str, list[UUID]] = {}
        for offset in (-1, 0, 1):
            schedule_date = scheduled_date + timedelta(days=offset)
            on_leave = self._agenda.employee_on_approved_leave(
                branch.workspace_id, employee_id, schedule_date
            )
            candidates = get_available_slots(
                scheduled_date=schedule_date,
                duration_minutes=duration,
                weekly_schedule=schedule.weekly_schedule if schedule else None,
                appointments=[],
                on_approved_vacation=on_leave,
            )
            for slot in candidates:
                local = datetime.combine(schedule_date, time.fromisoformat(slot), schedule_zone)
                start = local.astimezone(UTC)
                if start.astimezone(schedule_zone).replace(tzinfo=None) != local.replace(
                    tzinfo=None
                ):
                    continue
                branch_start = start.astimezone(branch_zone)
                if branch_start.date() != scheduled_date or start <= now:
                    continue
                end = start + timedelta(minutes=duration)
                if end.astimezone(branch_zone).date() != scheduled_date:
                    continue
                overlapping = [
                    a
                    for a in conflicts
                    if a.id != exclude_appointment_id and a.starts_at < end and a.ends_at > start
                ]
                if any(a.employee_id == employee_id for a in overlapping):
                    continue
                free = [
                    r.id for r in resources if not any(a.resource_id == r.id for a in overlapping)
                ]
                if free:
                    result[branch_start.strftime("%H:%M")] = free
        return result

    def book(
        self,
        branch_id: UUID,
        payload: dict[str, Any],
        *,
        idempotency_key: str,
    ) -> dict[str, Any]:
        branch, workspace = self._resolve_branch(branch_id)
        principal, grant = self._system_access(branch.workspace_id)
        fingerprint = sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
        key = "public:" + sha256(f"{branch.id}:{idempotency_key}".encode()).hexdigest()
        self._lock(key)
        existing = self._agenda.records_for_idempotency_key(branch.workspace_id, key)
        if existing:
            appointment = existing[0].appointment
            if (
                appointment.public_request_fingerprint != fingerprint
                or appointment.record_status != "active"
            ):
                raise ConflictError(
                    "La clave de reserva ya se utilizó con otros datos.", "Idempotency-Key"
                )
            return self._summary_with_notification(appointment)
        service = self._require_service(grant, branch.id, cast(UUID, payload["service_id"]))
        employee = self._require_specialist(
            branch.workspace_id, branch.id, cast(UUID, payload["employee_id"])
        )
        self._lock(f"booking-branch:{branch.id}")
        self._lock(f"booking-employee:{employee.id}")
        scheduled_date = cast(date, payload["date"])
        scheduled_time = cast(time, payload["time"])
        duration = int(payload.get("duration") or 30)
        available = self._slot_resources(branch.id, scheduled_date, employee.id, duration)
        free = available.get(scheduled_time.strftime("%H:%M"), [])
        if not free:
            raise ConflictError("Ese horario ya no está disponible. Elige otro cupo.", "time")
        resource_id = free[0]
        normalized = self._normalized_document(
            str(payload["document_type"]), str(payload["document_id"])
        )
        self._lock(f"booking-customer:{branch.workspace_id}:{normalized}")
        is_new = self._master_data.customer_by_document(branch.workspace_id, normalized) is None
        customer = self._upsert_customer(
            workspace_id=branch.workspace_id,
            branch_id=branch.id,
            actor_id=principal.platform_user_id,
            payload=payload,
            commit=False,
            ensure_branch=True,
        )
        values = {
            "branch_id": branch.id,
            "resource_id": resource_id,
            "customer_id": customer.id,
            "employee_id": employee.id,
            "service_id": service["id"],
            "date": scheduled_date,
            "time": scheduled_time,
            "duration": duration,
            "customer_name": payload["display_name"],
            "customer_phone": payload.get("phone"),
            "service_name": service["name"],
            "price": service["price"],
            "status": "confirmed",
            "source": "self",
            "first_time": is_new,
            "free_trial": False,
            "pending_payment": False,
            "pending_amount": Decimal("0"),
            "reminder_sent": False,
            "recurrence": "none",
            "repeat_count": 1,
        }
        records = AgendaService(self._session).create_appointments(
            principal=principal,
            grant=grant,
            values=values,
            idempotency_key=key,
            commit=False,
        )
        record = records[0]
        appointment = record.appointment
        appointment.public_request_fingerprint = fingerprint
        notification = self._enqueue_appointment(
            appointment, branch, workspace, "appointment.confirmed"
        )
        self._session.commit()
        return self._finish_notification(appointment, notification)

    def _enqueue_appointment(
        self, appointment: Appointment, branch: Branch, workspace: Workspace, event: str
    ) -> EmailNotification | None:
        email = self._customer_email(appointment.customer_id)
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
            workspace_id=branch.workspace_id,
            appointment_id=appointment.id,
            event_key=f"{event}/{appointment.id}/{appointment.version}",
            **content,
        )

    def _summary_with_notification(self, appointment: Appointment) -> dict[str, Any]:
        result = self._appointment_summary(
            appointment, issue_appointment_management_token(appointment.id)
        )
        notification = self._session.scalar(
            select(EmailNotification)
            .where(
                EmailNotification.appointment_id == appointment.id,
                EmailNotification.workspace_id == appointment.workspace_id,
            )
            .order_by(EmailNotification.created_at.desc())
            .limit(1)
        )
        result["notification"] = notification_result(notification) if notification else None
        return result

    def _finish_notification(
        self, appointment: Appointment, notification: EmailNotification | None
    ) -> dict[str, Any]:
        result = self._appointment_summary(
            appointment, issue_appointment_management_token(appointment.id)
        )
        result["notification"] = (
            deliver_email(self._session, notification.id) if notification else None
        )
        return result

    def get_appointment(self, branch_id: UUID, appointment_id: UUID, token: str) -> dict[str, Any]:
        appointment, branch, workspace, _, _ = self._authorized_appointment(
            branch_id, appointment_id, token
        )
        return {
            **self._appointment_summary(appointment, token),
            "branch_name": branch.name,
            "workspace_name": workspace.name,
            "timezone": branch.timezone,
        }

    def management_slots(
        self, branch_id: UUID, appointment_id: UUID, token: str, scheduled_date: date, duration: int
    ) -> list[str]:
        appointment, _, _, _, _ = self._authorized_appointment(branch_id, appointment_id, token)
        if appointment.employee_id is None:
            return []
        return sorted(
            self._slot_resources(
                branch_id,
                scheduled_date,
                appointment.employee_id,
                duration,
                exclude_appointment_id=appointment.id,
            )
        )

    def profile_for_document(
        self, branch_id: UUID, document_type: str, document_id: str
    ) -> dict[str, Any]:
        return self.identify(branch_id, document_type, document_id)

    def update_profile(self, branch_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
        branch, _workspace = self._resolve_branch(branch_id)
        principal, _grant = self._system_access(branch.workspace_id)
        customer = self._upsert_customer(
            workspace_id=branch.workspace_id,
            branch_id=branch.id,
            actor_id=principal.platform_user_id,
            payload=payload,
        )
        extras = self._profile_extras(customer.id)
        return {
            "customer_id": customer.id,
            "is_new": False,
            "document_type": customer.document_type,
            "document_id": customer.document_id,
            "display_name": customer.display_name,
            "email": customer.email,
            "phone": customer.phone,
            **extras,
        }

    def list_customer_appointments(
        self, branch_id: UUID, document_type: str, document_id: str
    ) -> list[dict[str, Any]]:
        branch, _workspace = self._resolve_branch(branch_id)
        normalized = self._normalized_document(document_type, document_id)
        customer = self._master_data.customer_by_document(branch.workspace_id, normalized)
        if customer is None:
            return []
        rows = self._session.scalars(
            select(Appointment).where(
                Appointment.workspace_id == branch.workspace_id,
                Appointment.customer_id == customer.id,
                Appointment.branch_id == branch.id,
                Appointment.record_status == "active",
            )
        ).all()
        return [
            self._appointment_summary(
                row,
                "",
            )
            for row in sorted(rows, key=lambda item: (item.scheduled_date, item.scheduled_time))
        ]

    def cancel_appointment(
        self,
        branch_id: UUID,
        appointment_id: UUID,
        management_token: str,
    ) -> dict[str, Any]:
        appointment, branch, workspace, principal, grant = self._authorized_appointment(
            branch_id, appointment_id, management_token
        )
        if appointment.status == "cancelled":
            return self._summary_with_notification(appointment)
        self._require_manageable(appointment)
        record = AgendaService(self._session).update_appointment(
            principal=principal,
            grant=grant,
            appointment_id=appointment.id,
            expected_version=appointment.version,
            changes={"status": "cancelled"},
            commit=False,
        )
        notification = self._enqueue_appointment(
            record.appointment, branch, workspace, "appointment.cancelled"
        )
        self._session.commit()
        return self._finish_notification(record.appointment, notification)

    @staticmethod
    def _require_manageable(appointment: Appointment) -> None:
        if appointment.status != "confirmed" or appointment.starts_at <= datetime.now(UTC):
            raise ConflictError(
                "Solo puedes modificar citas confirmadas que todavía no han comenzado."
            )

    def reschedule_appointment(
        self,
        branch_id: UUID,
        appointment_id: UUID,
        *,
        management_token: str,
        scheduled_date: date,
        scheduled_time: time,
        duration: int | None,
    ) -> dict[str, Any]:
        appointment, branch, workspace, principal, grant = self._authorized_appointment(
            branch_id, appointment_id, management_token
        )
        self._require_manageable(appointment)
        duration_minutes = duration or appointment.duration_minutes
        if (
            appointment.scheduled_date,
            appointment.scheduled_time,
            appointment.duration_minutes,
        ) == (scheduled_date, scheduled_time, duration_minutes):
            return self._summary_with_notification(appointment)
        if appointment.employee_id is None:
            raise ConflictError("La cita no tiene un especialista asignado.")
        self._lock(f"booking-branch:{branch.id}")
        self._lock(f"booking-employee:{appointment.employee_id}")
        free = self._slot_resources(
            branch.id, scheduled_date, appointment.employee_id, duration_minutes, appointment.id
        ).get(scheduled_time.strftime("%H:%M"), [])
        if not free:
            raise ConflictError("Ese horario ya no está disponible. Elige otro cupo.", "time")
        record = AgendaService(self._session).update_appointment(
            principal=principal,
            grant=grant,
            appointment_id=appointment.id,
            expected_version=appointment.version,
            changes={
                "date": scheduled_date,
                "time": scheduled_time,
                "duration": duration_minutes,
                "resource_id": appointment.resource_id
                if appointment.resource_id in free
                else free[0],
            },
            commit=False,
        )
        notification = self._enqueue_appointment(
            record.appointment, branch, workspace, "appointment.rescheduled"
        )
        self._session.commit()
        return self._finish_notification(record.appointment, notification)

    def send_due_reminders(self, workspace_id: UUID | None = None) -> int:
        result = AppointmentReminderService(self._session).process_due(workspace_id=workspace_id)
        return int(result.sent)

    def _authorized_appointment(
        self, branch_id: UUID, appointment_id: UUID, management_token: str
    ) -> tuple[Appointment, Branch, Workspace, AuthPrincipal, PermissionGrant]:
        if not verify_appointment_management_token(appointment_id, management_token):
            raise AuthorizationErrorPublic("El enlace de gestión no es válido.")
        branch, workspace = self._resolve_branch(branch_id)
        appointment = self._session.scalar(
            select(Appointment)
            .where(
                Appointment.workspace_id == branch.workspace_id,
                Appointment.id == appointment_id,
                Appointment.branch_id == branch.id,
                Appointment.record_status == "active",
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if appointment is None:
            raise ResourceNotFoundError("La cita no existe.", "appointmentId")
        principal, grant = self._system_access(branch.workspace_id)
        return appointment, branch, workspace, principal, grant

    def _resolve_branch(self, branch_id: UUID) -> tuple[Branch, Workspace]:
        branch = self._session.scalar(
            select(Branch).where(Branch.id == branch_id, Branch.status == "active")
        )
        if branch is None:
            raise ResourceNotFoundError("La sucursal no existe.", "branchId")
        workspace = self._session.scalar(
            select(Workspace).where(Workspace.id == branch.workspace_id)
        )
        if workspace is None:
            raise ResourceNotFoundError("El workspace no existe.", "branchId")
        return branch, workspace

    def _system_access(self, workspace_id: UUID) -> tuple[AuthPrincipal, PermissionGrant]:
        row = self._session.execute(
            select(
                WorkspaceMembership.id,
                WorkspaceMembership.platform_user_id,
                PlatformUser.email,
                PlatformUser.display_name,
            )
            .join(PlatformUser, PlatformUser.id == WorkspaceMembership.platform_user_id)
            .where(
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.status == "active",
            )
            .order_by(WorkspaceMembership.created_at.asc())
            .limit(1)
        ).first()
        if row is None:
            raise InvalidOperationError("El workspace no tiene usuarios activos.", "branchId")
        membership_id, platform_user_id, email, display_name = row
        principal = AuthPrincipal(
            platform_user_id=platform_user_id,
            membership_id=membership_id,
            workspace_id=workspace_id,
            session_id=uuid7(),
            email=email,
            display_name=display_name,
        )
        grant = PermissionGrant(
            permission_code="appointment.manage",
            workspace_id=workspace_id,
            membership_id=membership_id,
            allowed_legal_entity_ids=None,
            allowed_branch_ids=None,
        )
        return principal, grant

    def _normalized_document(self, document_type: str, document_id: str) -> str:
        normalized = normalize_document_id(document_type, document_id)
        if not normalized:
            raise InvalidOperationError("documentId inválido.", "documentId")
        return normalized

    def _upsert_customer(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        actor_id: UUID,
        payload: dict[str, Any],
        commit: bool = True,
        ensure_branch: bool = False,
    ) -> Any:
        document_type = cast(str, payload["document_type"])
        document_id = cast(str, payload["document_id"])
        doc_type, display_id, normalized_id = prepare_customer_document_fields(
            document_type, document_id
        )
        if normalized_id is None:
            raise InvalidOperationError("El documento del cliente no es válido.", "documentId")
        document_key = normalized_id
        existing = self._master_data.customer_by_document(workspace_id, document_key)
        values = {
            "customer_type": "person",
            "display_name": payload["display_name"],
            "normalized_name": normalize_name(str(payload["display_name"])),
            "email": payload.get("email"),
            "normalized_email": (payload.get("email") or "").strip().casefold() or None,
            "phone": payload.get("phone"),
            "normalized_phone": None,
            "document_type": doc_type,
            "document_id": display_id,
            "normalized_document_id": normalized_id,
            "status": "active",
            "acquisition_source": "app",
        }
        if values["phone"]:
            from app.services.master_data import normalize_phone

            values["normalized_phone"] = normalize_phone(str(values["phone"]))
        if existing is None:
            record = self._master_data.create_customer(
                workspace_id=workspace_id,
                actor_platform_user_id=actor_id,
                values=values,
                branch_ids={branch_id},
                request_id=f"public-booking:{uuid7()}",
            )
            self._save_profile_extras(record.id, payload)
            if commit:
                self._session.commit()
            else:
                self._session.flush()
            return self._master_data.customer_by_document(workspace_id, document_key)
        changes = {
            "display_name": values["display_name"],
            "normalized_name": values["normalized_name"],
            "email": values["email"],
            "normalized_email": values["normalized_email"],
            "phone": values["phone"],
            "normalized_phone": values["normalized_phone"],
            "document_type": doc_type,
            "document_id": display_id,
            "normalized_document_id": normalized_id,
        }
        branch_ids = None
        if ensure_branch:
            branch_ids = set(
                self._session.scalars(
                    select(CustomerBranchAssignment.branch_id).where(
                        CustomerBranchAssignment.workspace_id == workspace_id,
                        CustomerBranchAssignment.customer_id == existing.id,
                        CustomerBranchAssignment.status == "active",
                    )
                ).all()
            ) | {branch_id}
        self._master_data.update_customer(
            customer=existing,
            changes=changes,
            branch_ids=branch_ids,
            actor_platform_user_id=actor_id,
            request_id=f"public-booking:{uuid7()}",
        )
        self._save_profile_extras(existing.id, payload)
        if commit:
            self._session.commit()
        else:
            self._session.flush()
        return self._master_data.customer_by_document(workspace_id, document_key)

    def _list_services(self, grant: PermissionGrant, branch_id: UUID) -> list[dict[str, Any]]:
        rows = self._session.execute(
            select(Item, InventoryItemProfile.sale_price)
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
                Item.workspace_id == grant.workspace_id,
                Item.status == "active",
                Item.item_type == "service",
                ItemBranchAssignment.branch_id == branch_id,
                ItemBranchAssignment.status == "active",
                InventoryItemProfile.sale_price.is_not(None),
            )
            .order_by(Item.name, Item.id)
        ).all()
        return [
            {"id": item.id, "name": item.name, "price": price, "duration_minutes": 30}
            for item, price in rows
        ]

    def _require_service(
        self, grant: PermissionGrant, branch_id: UUID, service_id: UUID
    ) -> dict[str, Any]:
        for service in self._list_services(grant, branch_id):
            if service["id"] == service_id:
                return service
        raise ResourceNotFoundError("El servicio no está disponible.", "serviceId")

    def _list_specialists(self, workspace_id: UUID, branch_id: UUID) -> list[dict[str, Any]]:
        rows = self._session.execute(
            select(Employee.id, Employee.first_name, Employee.last_name)
            .join(
                EmployeeBranchAssignment,
                (EmployeeBranchAssignment.workspace_id == Employee.workspace_id)
                & (EmployeeBranchAssignment.employee_id == Employee.id),
            )
            .where(
                Employee.workspace_id == workspace_id,
                Employee.status == "active",
                Employee.online_booking_selectable.is_(True),
                EmployeeBranchAssignment.branch_id == branch_id,
                EmployeeBranchAssignment.status == "active",
            )
            .order_by(Employee.normalized_name)
        ).all()
        return [
            {
                "id": row.id,
                "display_name": f"{row.first_name} {row.last_name}".strip(),
            }
            for row in rows
        ]

    def _require_specialist(
        self, workspace_id: UUID, branch_id: UUID, employee_id: UUID
    ) -> Employee:
        allowed = {item["id"] for item in self._list_specialists(workspace_id, branch_id)}
        if employee_id not in allowed:
            raise ResourceNotFoundError("El especialista no está disponible.", "employeeId")
        employee = self._session.scalar(
            select(Employee).where(
                Employee.workspace_id == workspace_id,
                Employee.id == employee_id,
            )
        )
        if employee is None:
            raise ResourceNotFoundError("El especialista no existe.", "employeeId")
        return employee

    def _appointment_summary(self, appointment: Appointment, token: str) -> dict[str, Any]:
        return {
            "id": appointment.id,
            "branch_id": appointment.branch_id,
            "customer_id": appointment.customer_id,
            "employee_id": appointment.employee_id,
            "service_id": appointment.service_id,
            "date": appointment.scheduled_date,
            "time": appointment.scheduled_time.strftime("%H:%M"),
            "duration_minutes": appointment.duration_minutes,
            "service_name": appointment.service_name,
            "status": appointment.status,
            "management_token": token,
        }

    def _customer_email(self, customer_id: UUID | None) -> str | None:
        if customer_id is None:
            return None
        from app.db.models import Customer

        return self._session.scalar(select(Customer.email).where(Customer.id == customer_id))

    def _profile_extras(self, customer_id: UUID) -> dict[str, Any]:
        from app.db.models import CustomerCrmProfile

        profile = self._session.scalar(
            select(CustomerCrmProfile).where(CustomerCrmProfile.customer_id == customer_id)
        )
        if profile is None or not profile.notes:
            return {"wants_invoice": False, "wants_contact": False, "address": None}
        try:
            payload = json.loads(profile.notes)
            extras = payload.get("selfBooking") or {}
        except json.JSONDecodeError:
            extras = {}
        return {
            "wants_invoice": bool(extras.get("wantsInvoice")),
            "wants_contact": bool(extras.get("wantsContact")),
            "address": extras.get("address"),
        }

    def _save_profile_extras(self, customer_id: UUID, payload: dict[str, Any]) -> None:
        from app.db.models import CustomerCrmProfile

        profile = self._session.scalar(
            select(CustomerCrmProfile).where(CustomerCrmProfile.customer_id == customer_id)
        )
        if profile is None:
            return
        extras = {
            "wantsInvoice": bool(payload.get("wants_invoice")),
            "wantsContact": bool(payload.get("wants_contact")),
            "address": payload.get("address"),
        }
        profile.notes = json.dumps({"selfBooking": extras}, ensure_ascii=False)


class AuthorizationErrorPublic(Exception):
    """Raised for invalid public management tokens."""
