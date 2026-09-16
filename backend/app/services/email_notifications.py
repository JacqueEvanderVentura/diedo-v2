from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import Appointment
from app.db.models.email_notifications import EmailNotification
from app.services.email import (
    EmailAuthenticationError,
    EmailConfigurationError,
    EmailRateLimitError,
    EmailServiceError,
    EmailTransportError,
    EmailValidationError,
    send_email,
)
from app.services.errors import ConflictError, ResourceNotFoundError

_TRANSIENT_RETRY_DELAYS = (timedelta(minutes=5), timedelta(minutes=15), timedelta(minutes=30))


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
    event_type: str | None = None,
    scheduled_for: datetime | None = None,
    extra: dict[str, object] | None = None,
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
        event_type=event_type or event_key.split("/", 1)[0],
        sender=settings.email_from,
        reply_to=settings.email_reply_to,
        scheduled_for=scheduled_for,
        next_attempt_at=datetime.now(UTC),
        extra=extra or {},
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


def _is_current_notice(notification: EmailNotification, appointment: Appointment) -> bool:
    version = notification.event_key.rsplit("/", 1)[-1]
    if (notification.event_type or "").endswith(".reminder"):
        return version == str(appointment.schedule_revision)
    return version == str(appointment.version)


def _retry_delay(notification: EmailNotification, exc: EmailServiceError) -> timedelta | None:
    if isinstance(exc, (EmailTransportError, EmailRateLimitError)):
        index = max(0, min(notification.attempts - 1, len(_TRANSIENT_RETRY_DELAYS) - 1))
        if notification.attempts <= len(_TRANSIENT_RETRY_DELAYS):
            return _TRANSIENT_RETRY_DELAYS[index]
    if isinstance(exc, (EmailValidationError, EmailAuthenticationError, EmailConfigurationError)):
        return None
    return None


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
    if notification.status in {"sent", "review", "superseded"}:
        session.commit()
        return notification_result(notification)
    if notification.appointment_id:
        appointment = session.get(Appointment, notification.appointment_id, populate_existing=True)
        if (
            appointment is None
            or appointment.record_status != "active"
            or not _is_current_notice(notification, appointment)
        ):
            notification.status = "superseded"
            notification.error = "La cita cambió; este aviso fue sustituido por uno más reciente."
            session.commit()
            return notification_result(notification)
    if not settings.email_enabled:
        notification.status = "disabled"
        notification.error = "El envío de correo está desactivado en esta instancia."
        notification.next_attempt_at = None
        session.commit()
        return notification_result(notification)
    now = datetime.now(UTC)
    # Resend retains idempotency keys for 24h. Never blindly replay an uncertain
    # request after that window; the operator must reconcile it with Resend.
    if notification.first_attempt_at and now - notification.first_attempt_at >= timedelta(hours=23):
        notification.status = "review"
        notification.error = "Verifica el envío en Resend antes de volver a enviarlo."
        notification.next_attempt_at = None
        session.commit()
        return notification_result(notification)
    notification.first_attempt_at = notification.first_attempt_at or now
    notification.status = "sending"
    notification.attempts += 1
    notification.next_attempt_at = None
    session.commit()
    try:
        result = send_email(
            to=notification.recipient,
            subject=notification.subject,
            html=notification.html_body,
            text=notification.text_body,
            idempotency_key=f"notification/{notification.id}",
            sender=notification.sender,
            reply_to=notification.reply_to,
        )
        notification.status = "sent"  # Accepted by Resend; not proof of inbox delivery.
        notification.provider_id = result.provider_id
        notification.error = None
        notification.next_attempt_at = None
    except EmailServiceError as exc:
        notification.error = str(exc)
        delay = _retry_delay(notification, exc)
        if delay is None:
            notification.status = "review"
            notification.next_attempt_at = None
        else:
            notification.status = "failed"
            notification.next_attempt_at = datetime.now(UTC) + delay
    session.commit()
    return notification_result(notification)
