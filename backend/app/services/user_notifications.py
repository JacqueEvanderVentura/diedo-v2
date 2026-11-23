from __future__ import annotations

import html
import logging
import re
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.config import settings
from app.db.models.email_notifications import EmailNotification
from app.repositories.user_notifications import NotificationRecord, UserNotificationsRepository
from app.services.auth import AuthPrincipal
from app.services.email_notifications import deliver_email, enqueue_email
from app.services.errors import ResourceNotFoundError

logger = logging.getLogger(__name__)

MENTION_TOKEN_RE = re.compile(r"@\[([^\]]+)\]\((user|emp):([^)]+)\)")
MAX_PER_MEMBERSHIP = 50
_INCIDENT_HIGH_PRIORITIES = frozenset({"alta", "critica"})


@dataclass(frozen=True)
class NotificationPayload:
    membership_id: UUID
    event_type: str
    event_key: str
    title: str
    body: str
    priority: str
    link: dict[str, Any]
    send_email: bool = False


_SESSION_EMAIL_KEY = "pending_in_app_email_ids"


def deliver_pending_in_app_emails(session: Session) -> None:
    raw = session.info.pop(_SESSION_EMAIL_KEY, None)
    ids: list[UUID] = list(raw) if isinstance(raw, list) else []
    for notification_id in ids:
        try:
            deliver_email(session, notification_id)
        except Exception:
            logger.exception("Unexpected priority notification email failure.")


class UserNotificationService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = UserNotificationsRepository(session)

    def deliver_pending_emails(self) -> None:
        deliver_pending_in_app_emails(self._session)

    def fanout(
        self,
        *,
        workspace_id: UUID,
        payloads: tuple[NotificationPayload, ...],
        exclude_membership_id: UUID | None = None,
    ) -> None:
        touched: set[UUID] = set()
        for payload in payloads:
            if exclude_membership_id is not None and payload.membership_id == exclude_membership_id:
                continue
            row = self._repository.insert(
                workspace_id=workspace_id,
                membership_id=payload.membership_id,
                event_type=payload.event_type,
                event_key=payload.event_key,
                title=payload.title,
                body=payload.body,
                priority=payload.priority,
                link=payload.link,
            )
            if row is None:
                continue
            touched.add(payload.membership_id)
            if payload.send_email or payload.priority == "alta":
                email = self._repository.membership_email(workspace_id, payload.membership_id)
                if email:
                    queued = self._enqueue_staff_email(
                        workspace_id=workspace_id,
                        membership_id=payload.membership_id,
                        event_key=f"staff.inapp/{payload.event_key}",
                        to=email,
                        subject=payload.title,
                        body=payload.body,
                        link=payload.link,
                    )
                    if queued is not None:
                        pending = self._session.info.setdefault(_SESSION_EMAIL_KEY, [])
                        if isinstance(pending, list):
                            pending.append(queued.id)
        for membership_id in touched:
            self._repository.trim_for_membership(workspace_id, membership_id)

    def notify_incident_interveners(
        self,
        *,
        workspace_id: UUID,
        incident_id: UUID,
        incident_code: str,
        title: str,
        priority: str,
        participant_ids: set[UUID],
        actor_membership_id: UUID,
        reporter_name: str,
    ) -> None:
        if not participant_ids:
            return
        high = priority in _INCIDENT_HIGH_PRIORITIES
        payloads = tuple(
            NotificationPayload(
                membership_id=pid,
                event_type="incident.intervener",
                event_key=f"incident.intervener/{incident_id}/{pid}",
                title="Te asignaron como interviniente",
                body=f"{reporter_name} te incluyó en {incident_code}: {title}",
                priority="alta" if high else "normal",
                link={"path": "/incidencias", "incidentId": str(incident_id)},
                send_email=high,
            )
            for pid in participant_ids
        )
        self.fanout(
            workspace_id=workspace_id,
            payloads=payloads,
            exclude_membership_id=actor_membership_id,
        )

    def notify_incident_mentions(
        self,
        *,
        workspace_id: UUID,
        incident_id: UUID,
        incident_code: str,
        activity_id: UUID,
        message: str,
        author_membership_id: UUID,
        author_name: str,
    ) -> None:
        mentioned = self._mentioned_user_ids(message)
        if not mentioned:
            return
        preview = self._message_preview(message)
        payloads = tuple(
            NotificationPayload(
                membership_id=UUID(mid),
                event_type="incident.mention",
                event_key=f"incident.mention/{activity_id}/{mid}",
                title=f"{author_name} te mencionó",
                body=f"{incident_code}: {preview}",
                priority="normal",
                link={"path": "/incidencias", "incidentId": str(incident_id)},
            )
            for mid in mentioned
            if self._valid_uuid(mid)
        )
        self.fanout(
            workspace_id=workspace_id,
            payloads=payloads,
            exclude_membership_id=author_membership_id,
        )

    def notify_purchase_request_created(
        self,
        *,
        workspace_id: UUID,
        request_id: UUID,
        request_number: str,
        requester_name: str,
        priority: str,
        approver_membership_ids: set[UUID],
        actor_membership_id: UUID,
    ) -> None:
        if not approver_membership_ids:
            return
        high = priority == "alta"
        payloads = tuple(
            NotificationPayload(
                membership_id=mid,
                event_type="purchasing.request_created",
                event_key=f"purchasing.request/{request_id}/{mid}",
                title="Nueva solicitud de compra",
                body=f"{requester_name} envió {request_number} para tu aprobación.",
                priority="alta" if high else "normal",
                link={"path": "/compras", "purchaseRequestId": str(request_id)},
                send_email=high,
            )
            for mid in approver_membership_ids
        )
        self.fanout(
            workspace_id=workspace_id,
            payloads=payloads,
            exclude_membership_id=actor_membership_id,
        )

    def notify_slot_hold_abandoned(
        self,
        *,
        workspace_id: UUID,
        hold_id: UUID,
        customer_name: str,
        service_name: str,
        scheduled_label: str,
        employee_id: UUID | None,
    ) -> None:
        recipients: set[UUID] = self._repository.active_membership_ids_for_roles(
            workspace_id, ("workspace_admin", "manager", "seller")
        )
        if employee_id is not None:
            specialist = self._repository.employee_membership(workspace_id, employee_id)
            if specialist is not None:
                recipients.add(specialist)
        if not recipients:
            return
        body = (
            f"{customer_name} intentó agendar {service_name} ({scheduled_label}) "
            "pero no finalizó la agenda."
        )
        payloads = tuple(
            NotificationPayload(
                membership_id=mid,
                event_type="slot_hold.abandoned",
                event_key=f"slot_hold.abandoned/{hold_id}/{mid}",
                title="Agenda sin finalizar",
                body=body,
                priority="normal",
                link={"path": "/agenda"},
                send_email=True,
            )
            for mid in recipients
        )
        self.fanout(workspace_id=workspace_id, payloads=payloads)

    def notify_appointment_booked(
        self,
        *,
        workspace_id: UUID,
        appointment_id: UUID,
        customer_name: str,
        service_name: str,
        scheduled_label: str,
        employee_id: UUID | None,
        actor_membership_id: UUID | None,
    ) -> None:
        recipients: set[UUID] = self._repository.active_membership_ids_for_roles(
            workspace_id, ("workspace_admin", "manager")
        )
        if employee_id is not None:
            specialist = self._repository.employee_membership(workspace_id, employee_id)
            if specialist is not None:
                recipients.add(specialist)
        if not recipients:
            return
        body = f"{customer_name} — {service_name} ({scheduled_label})"
        payloads: list[NotificationPayload] = []
        specialist_mid = (
            self._repository.employee_membership(workspace_id, employee_id) if employee_id else None
        )
        for mid in recipients:
            send_email = specialist_mid is not None and mid == specialist_mid
            payloads.append(
                NotificationPayload(
                    membership_id=mid,
                    event_type="appointment.booked",
                    event_key=f"appointment.booked/{appointment_id}/{mid}",
                    title="Nueva cita agendada",
                    body=body,
                    priority="normal",
                    link={"path": "/agenda/gestion", "appointmentId": str(appointment_id)},
                    send_email=send_email,
                )
            )
        self.fanout(
            workspace_id=workspace_id,
            payloads=tuple(payloads),
            exclude_membership_id=actor_membership_id,
        )

    def notify_employee_unlinked(
        self,
        *,
        workspace_id: UUID,
        employee_name: str,
        membership_id: UUID,
        employee_id: UUID,
        previous_platform_user_id: UUID,
    ) -> None:
        self.fanout(
            workspace_id=workspace_id,
            payloads=(
                NotificationPayload(
                    membership_id=membership_id,
                    event_type="employee.platform_unlinked",
                    event_key=(
                        f"employee.unlink/{employee_id}/{previous_platform_user_id}/{membership_id}"
                    ),
                    title="Perfil de especialista desvinculado",
                    body=f"Tu usuario ya no está vinculado al empleado {employee_name}.",
                    priority="alta",
                    link={"path": "/rrhh"},
                    send_email=True,
                ),
            ),
        )

    def list_for_principal(
        self,
        *,
        principal: AuthPrincipal,
        page: int,
        page_size: int,
    ) -> tuple[tuple[NotificationRecord, ...], int, int]:
        return self._repository.list_page(
            workspace_id=principal.workspace_id,
            membership_id=principal.membership_id,
            page=page,
            page_size=page_size,
        )

    def mark_read(self, principal: AuthPrincipal, notification_id: UUID) -> None:
        if not self._repository.mark_read(
            principal.workspace_id, principal.membership_id, notification_id
        ):
            raise ResourceNotFoundError("La notificación no existe.", "notificationId")

    def mark_all_read(self, principal: AuthPrincipal) -> int:
        return self._repository.mark_all_read(principal.workspace_id, principal.membership_id)

    def membership_for_platform_user(
        self, workspace_id: UUID, platform_user_id: UUID
    ) -> UUID | None:
        return self._repository.membership_for_platform_user(workspace_id, platform_user_id)

    def _enqueue_staff_email(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        event_key: str,
        to: str,
        subject: str,
        body: str,
        link: dict[str, Any],
    ) -> EmailNotification | None:
        path = cast_str(link.get("path")) or "/"
        app_url = settings.public_app_url.rstrip("/")
        href = f"{app_url}{path}"
        safe_subject = html.escape(subject)
        safe_body = html.escape(body)
        html_body = (
            f"<p><strong>{safe_subject}</strong></p>"
            f"<p>{safe_body}</p>"
            f'<p><a href="{html.escape(href)}">Abrir en Helios</a></p>'
        )
        text_body = f"{subject}\n\n{body}\n\n{href}"
        try:
            return enqueue_email(
                self._session,
                workspace_id=workspace_id,
                event_key=event_key,
                to=to,
                subject=subject,
                html=html_body,
                text=text_body,
                event_type="staff.inapp",
                extra={"membershipId": str(membership_id)},
            )
        except Exception:
            logger.exception("Could not enqueue staff notification email.")
            return None

    @staticmethod
    def _mentioned_user_ids(message: str) -> set[str]:
        ids: set[str] = set()
        for match in MENTION_TOKEN_RE.finditer(message):
            if match.group(2) == "user":
                ids.add(match.group(3))
        return ids

    @staticmethod
    def _message_preview(message: str, limit: int = 80) -> str:
        plain = MENTION_TOKEN_RE.sub(lambda m: f"@{m.group(1)}", message)
        plain = " ".join(plain.split())
        return plain if len(plain) <= limit else f"{plain[:limit]}…"

    @staticmethod
    def _valid_uuid(value: str) -> bool:
        try:
            UUID(value)
            return True
        except ValueError:
            return False


def cast_str(value: object) -> str | None:
    return str(value) if isinstance(value, str) and value else None


def notification_response(record: NotificationRecord) -> dict[str, Any]:
    row = record.notification
    link = row.link if isinstance(row.link, dict) else {}
    return {
        "id": row.id,
        "eventType": row.event_type,
        "title": row.title,
        "body": row.body,
        "priority": row.priority,
        "link": link,
        "read": row.read_at is not None,
        "createdAt": row.created_at,
    }
