from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import Appointment
from app.db.models.email_notifications import EmailNotification
from app.services.email import EmailServiceError, send_email
from app.services.errors import ConflictError, ResourceNotFoundError


def enqueue_email(
    session: Session,
    *,
    workspace_id: UUID,
    event_key: str,
    to: str,
    subject: str,
    html: str,
    text: str,
    appointment_id: UUID | None = None,
) -> EmailNotification:
    """Called inside the transaction owning the event; never sends or commits."""
    existing = session.scalar(
        select(EmailNotification).where(
            EmailNotification.workspace_id == workspace_id,
            EmailNotification.event_key == event_key,
        )
    )
    if existing:
        if (existing.recipient, existing.subject, existing.text_body) != (to, subject, text):
            raise ConflictError(
                "La clave de envío ya fue utilizada con otros datos.", "Idempotency-Key"
            )
        return existing
    notification = EmailNotification(
        workspace_id=workspace_id,
        appointment_id=appointment_id,
        event_key=event_key,
        recipient=to,
        subject=subject,
        html_body=html,
        text_body=text,
    )
    session.add(notification)
    session.flush()
    return notification


def notification_result(notification: EmailNotification) -> dict[str, Any]:
    return {
        "id": notification.id,
        "status": notification.status,
        "message": notification.error,
        "provider_id": notification.provider_id,
    }


def deliver_email(session: Session, notification_id: UUID) -> dict[str, Any]:
    notification = session.scalar(
        select(EmailNotification)
        .where(
            EmailNotification.id == notification_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if notification is None:
        raise ResourceNotFoundError("No existe la notificación.")
    if notification.status in {"sent", "sending", "review", "superseded"}:
        session.commit()
        return notification_result(notification)
    if notification.appointment_id:
        appointment = session.get(Appointment, notification.appointment_id, populate_existing=True)
        if (
            appointment is None
            or appointment.record_status != "active"
            or notification.event_key.rsplit("/", 1)[-1] != str(appointment.version)
        ):
            notification.status = "superseded"
            notification.error = "La cita cambió; este aviso fue sustituido por uno más reciente."
            session.commit()
            return notification_result(notification)
    if not settings.email_enabled:
        notification.status = "disabled"
        notification.error = "El envío de correo está desactivado en esta instancia."
        session.commit()
        return notification_result(notification)
    now = datetime.now(UTC)
    # Resend retains idempotency keys for 24h. Never blindly replay an uncertain
    # request after that window; the operator must reconcile it with Resend.
    if notification.first_attempt_at and now - notification.first_attempt_at >= timedelta(hours=23):
        notification.status = "review"
        notification.error = "Verifica el envío en Resend antes de volver a enviarlo."
        session.commit()
        return notification_result(notification)
    notification.first_attempt_at = notification.first_attempt_at or now
    notification.status = "sending"
    notification.attempts += 1
    session.commit()
    try:
        result = send_email(
            to=notification.recipient,
            subject=notification.subject,
            html=notification.html_body,
            text=notification.text_body,
            idempotency_key=f"notification/{notification.id}",
        )
        notification.status = "sent"  # Accepted by Resend; not proof of inbox delivery.
        notification.provider_id = result.provider_id
        notification.error = None
    except EmailServiceError as exc:
        notification.status = "failed"
        notification.error = str(exc)
    session.commit()
    return notification_result(notification)
