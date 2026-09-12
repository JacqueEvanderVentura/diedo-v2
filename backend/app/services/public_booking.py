from __future__ import annotations

import json
from datetime import date, time
from decimal import Decimal
from typing import Any, cast
from uuid import UUID, uuid7

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    Appointment,
    Branch,
    Employee,
    EmployeeBranchAssignment,
    PlatformUser,
    Workspace,
    WorkspaceMembership,
)
from app.repositories.agenda import AgendaRepository
from app.repositories.master_data import MasterDataRepository
from app.services.agenda import AgendaService
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.booking_availability import get_available_slots, is_slot_available
from app.services.booking_tokens import (
    issue_appointment_management_token,
    verify_appointment_management_token,
)
from app.services.catalog import CatalogService
from app.services.customer_documents import (
    normalize_document_id,
    prepare_customer_document_fields,
)
from app.services.errors import ConflictError, InvalidOperationError, ResourceNotFoundError
from app.services.mailer import send_appointment_email
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
            },
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
        branch, _workspace = self._resolve_branch(branch_id)
        employee = self._require_specialist(branch.workspace_id, branch.id, employee_id)
        schedule = self._agenda.employee_schedule(branch.workspace_id, employee.id)
        weekly = schedule.weekly_schedule if schedule else None
        on_leave = self._agenda.employee_on_approved_leave(
            branch.workspace_id, employee.id, scheduled_date
        )
        appointments = self._employee_appointments(
            branch.workspace_id, branch.id, employee.id, scheduled_date
        )
        return get_available_slots(
            scheduled_date=scheduled_date,
            duration_minutes=duration_minutes,
            weekly_schedule=weekly,
            appointments=appointments,
            on_approved_vacation=on_leave,
        )

    def book(
        self,
        branch_id: UUID,
        payload: dict[str, Any],
        *,
        idempotency_key: str,
    ) -> dict[str, Any]:
        branch, workspace = self._resolve_branch(branch_id)
        principal, grant = self._system_access(branch.workspace_id)
        normalized = self._normalized_document(
            cast(str, payload["document_type"]), cast(str, payload["document_id"])
        )
        is_new = self._master_data.customer_by_document(branch.workspace_id, normalized) is None
        customer = self._upsert_customer(
            workspace_id=branch.workspace_id,
            branch_id=branch.id,
            actor_id=principal.platform_user_id,
            payload={**payload, "is_new": is_new},
        )
        service = self._require_service(grant, branch.id, cast(UUID, payload["service_id"]))
        employee = self._require_specialist(
            branch.workspace_id, branch.id, cast(UUID, payload["employee_id"])
        )
        scheduled_date = cast(date, payload["date"])
        scheduled_time = cast(time, payload["time"])
        duration = int(payload.get("duration") or service.get("duration_minutes") or 30)
        schedule = self._agenda.employee_schedule(branch.workspace_id, employee.id)
        if not is_slot_available(
            scheduled_date=scheduled_date,
            slot_time=scheduled_time.strftime("%H:%M"),
            duration_minutes=duration,
            weekly_schedule=schedule.weekly_schedule if schedule else None,
            appointments=self._employee_appointments(
                branch.workspace_id, branch.id, employee.id, scheduled_date
            ),
            on_approved_vacation=self._agenda.employee_on_approved_leave(
                branch.workspace_id, employee.id, scheduled_date
            ),
        ):
            raise ConflictError("Ese horario ya no está disponible.", "time")

        resources = self._agenda.list_resources(
            workspace_id=branch.workspace_id, branch_id=branch.id
        )
        if not resources:
            raise InvalidOperationError("La sucursal no tiene cabinas configuradas.", "branchId")
        resource_id = resources[0].id
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
            "first_time": bool(payload.get("is_new")),
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
            idempotency_key=idempotency_key,
        )
        record = records[0]
        appointment = record.appointment
        token = issue_appointment_management_token(appointment.id)
        if payload.get("email"):
            send_appointment_email(
                event="appointment.confirmed",
                to=str(payload["email"]),
                appointment=appointment,
                branch_name=branch.name,
                workspace_name=workspace.name,
                management_token=token,
            )
        return self._appointment_summary(appointment, token)

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
                Appointment.record_status == "active",
            )
        ).all()
        return [
            self._appointment_summary(
                row,
                issue_appointment_management_token(row.id),
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
        record = AgendaService(self._session).update_appointment(
            principal=principal,
            grant=grant,
            appointment_id=appointment.id,
            expected_version=appointment.version,
            changes={"status": "cancelled"},
        )
        updated = record.appointment
        customer_email = self._customer_email(updated.customer_id)
        if customer_email:
            send_appointment_email(
                event="appointment.cancelled",
                to=customer_email,
                appointment=updated,
                branch_name=branch.name,
                workspace_name=workspace.name,
                management_token=management_token,
            )
        return self._appointment_summary(updated, management_token)

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
        duration_minutes = duration or appointment.duration_minutes
        record = AgendaService(self._session).update_appointment(
            principal=principal,
            grant=grant,
            appointment_id=appointment.id,
            expected_version=appointment.version,
            changes={
                "date": scheduled_date,
                "time": scheduled_time,
                "duration": duration_minutes,
                "status": "confirmed",
            },
        )
        updated = record.appointment
        customer_email = self._customer_email(updated.customer_id)
        if customer_email:
            send_appointment_email(
                event="appointment.rescheduled",
                to=customer_email,
                appointment=updated,
                branch_name=branch.name,
                workspace_name=workspace.name,
                management_token=management_token,
            )
        return self._appointment_summary(updated, management_token)

    def send_due_reminders(self, workspace_id: UUID | None = None) -> int:
        from datetime import UTC, datetime, timedelta

        now = datetime.now(UTC)
        window_start = now + timedelta(hours=23)
        window_end = now + timedelta(hours=25)
        query = select(Appointment).where(
            Appointment.status == "confirmed",
            Appointment.record_status == "active",
            Appointment.reminder_sent.is_(False),
            Appointment.starts_at >= window_start,
            Appointment.starts_at <= window_end,
        )
        if workspace_id is not None:
            query = query.where(Appointment.workspace_id == workspace_id)
        sent = 0
        for appointment in self._session.scalars(query).all():
            email = self._customer_email(appointment.customer_id)
            branch = self._agenda.branch(appointment.workspace_id, appointment.branch_id)
            workspace = self._session.scalar(
                select(Workspace).where(Workspace.id == appointment.workspace_id)
            )
            if not email or branch is None or workspace is None:
                continue
            token = issue_appointment_management_token(appointment.id)
            result = send_appointment_email(
                event="appointment.reminder",
                to=email,
                appointment=appointment,
                branch_name=branch.name,
                workspace_name=workspace.name,
                management_token=token,
            )
            if result.get("sent"):
                appointment.reminder_sent = True
                sent += 1
        self._session.commit()
        return sent

    def _authorized_appointment(
        self, branch_id: UUID, appointment_id: UUID, management_token: str
    ) -> tuple[Appointment, Branch, Workspace, AuthPrincipal, PermissionGrant]:
        if not verify_appointment_management_token(appointment_id, management_token):
            raise AuthorizationErrorPublic("El enlace de gestión no es válido.")
        branch, workspace = self._resolve_branch(branch_id)
        appointment = self._session.scalar(
            select(Appointment).where(
                Appointment.workspace_id == branch.workspace_id,
                Appointment.id == appointment_id,
                Appointment.branch_id == branch.id,
            )
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
            self._session.commit()
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
        self._master_data.update_customer(
            customer=existing,
            changes=changes,
            branch_ids=None,
            actor_platform_user_id=actor_id,
            request_id=f"public-booking:{uuid7()}",
        )
        self._save_profile_extras(existing.id, payload)
        self._session.commit()
        return self._master_data.customer_by_document(workspace_id, document_key)

    def _list_services(self, grant: PermissionGrant, branch_id: UUID) -> list[dict[str, Any]]:
        catalog = CatalogService(self._session)
        result = catalog.list_products(
            grant=grant,
            search=None,
            status="active",
            category_id=None,
            branch_id=branch_id,
            page=1,
            page_size=50,
            sort_by="name",
            sort_direction="asc",
        )
        services: list[dict[str, Any]] = []
        for product in result.items:
            if product.item_type != "service":
                continue
            services.append(
                {
                    "id": product.id,
                    "name": product.name,
                    "price": Decimal("0"),
                    "duration_minutes": 30,
                }
            )
        return services

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

    def _employee_appointments(
        self,
        workspace_id: UUID,
        branch_id: UUID,
        employee_id: UUID,
        scheduled_date: date,
    ) -> list[dict[str, Any]]:
        rows = self._session.scalars(
            select(Appointment).where(
                Appointment.workspace_id == workspace_id,
                Appointment.branch_id == branch_id,
                Appointment.employee_id == employee_id,
                Appointment.scheduled_date == scheduled_date,
                Appointment.record_status == "active",
            )
        ).all()
        return [
            {
                "time": row.scheduled_time.strftime("%H:%M"),
                "duration": row.duration_minutes,
                "status": row.status,
            }
            for row in rows
        ]

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
