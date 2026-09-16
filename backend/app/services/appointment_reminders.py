from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import String, cast, exists, literal, select
from sqlalchemy.orm import Session

from app.db.models import Appointment, Branch, Customer, Workspace
from app.db.models.email_notifications import EmailNotification
from app.services.booking_tokens import issue_appointment_management_token
from app.services.email_notifications import deliver_email, enqueue_email
from app.services.mailer import render_appointment_email

REMINDER_EVENT = "appointment.reminder"


@dataclass(frozen=True)
class ReminderSummary:
    sent: int = 0
    omitted: int = 0
    failed: int = 0
    pending_review: int = 0
    pending: int = 0
    dry_run: bool = False

    def as_dict(self) -> dict[str, int | bool]:
        return {
            "sent": self.sent,
            "omitted": self.omitted,
            "failed": self.failed,
            "pendingReview": self.pending_review,
            "pending": self.pending,
            "dryRun": self.dry_run,
        }


class AppointmentReminderService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def process_due(
        self,
        *,
        workspace_id: UUID | None = None,
        recipient_email: str | None = None,
        dry_run: bool = False,
        now: datetime | None = None,
    ) -> ReminderSummary:
        current = now or datetime.now(UTC)
        created = self._enqueue_due(
            workspace_id=workspace_id,
            recipient_email=recipient_email,
            dry_run=dry_run,
            now=current,
        )
        retried = 0
        failed = 0
        review = 0
        sent = 0
        if not dry_run:
            for notification in self._due_notifications(
                workspace_id=workspace_id,
                recipient_email=recipient_email,
                now=current,
            ):
                result = deliver_email(self._session, notification.id)
                if result["status"] == "sent":
                    sent += 1
                    self._mark_reminder_sent(notification)
                elif result["status"] == "failed":
                    failed += 1
                elif result["status"] == "review":
                    review += 1
                elif result["status"] in {"pending", "sending"}:
                    retried += 1
            self._session.commit()
        return ReminderSummary(
            sent=sent,
            omitted=created["omitted"],
            failed=failed,
            pending_review=review,
            pending=created["pending"] + retried,
            dry_run=dry_run,
        )

    def _enqueue_due(
        self,
        *,
        workspace_id: UUID | None,
        recipient_email: str | None,
        dry_run: bool,
        now: datetime,
    ) -> dict[str, int]:
        lower = now - timedelta(hours=1)
        upper = now
        event_key_expression = (
            literal(f"{REMINDER_EVENT}/")
            + cast(Appointment.id, String)
            + literal("/")
            + cast(Appointment.schedule_revision, String)
        )
        statement = (
            select(Appointment, Branch, Workspace, Customer.email)
            .join(
                Branch,
                (Branch.workspace_id == Appointment.workspace_id)
                & (Branch.id == Appointment.branch_id),
            )
            .join(Workspace, Workspace.id == Appointment.workspace_id)
            .join(
                Customer,
                (Customer.workspace_id == Appointment.workspace_id)
                & (Customer.id == Appointment.customer_id),
            )
            .where(
                Appointment.status == "confirmed",
                Appointment.record_status == "active",
                Customer.status == "active",
                Customer.email.is_not(None),
                Appointment.starts_at > now,
                Appointment.starts_at - timedelta(hours=24) >= lower,
                Appointment.starts_at - timedelta(hours=24) <= upper,
                ~exists()
                .where(EmailNotification.workspace_id == Appointment.workspace_id)
                .where(EmailNotification.event_key == event_key_expression),
            )
            .with_for_update(skip_locked=True, of=Appointment)
        )
        if workspace_id is not None:
            statement = statement.where(Appointment.workspace_id == workspace_id)
        if recipient_email:
            statement = statement.where(Customer.email == recipient_email)
        omitted = 0
        pending = 0
        for appointment, branch, workspace, email in self._session.execute(statement).all():
            target = appointment.starts_at - timedelta(hours=24)
            event_key = f"{REMINDER_EVENT}/{appointment.id}/{appointment.schedule_revision}"
            if appointment.schedule_changed_at > target:
                omitted += 1
                if not dry_run:
                    enqueue_email(
                        self._session,
                        workspace_id=appointment.workspace_id,
                        appointment_id=appointment.id,
                        event_key=event_key,
                        event_type=REMINDER_EVENT,
                        scheduled_for=target,
                        to=email,
                        subject="Recordatorio omitido",
                        html="<p>Recordatorio omitido por aviso menor a 24 horas.</p>",
                        text="Recordatorio omitido por aviso menor a 24 horas.",
                        extra={"omitted": True, "reason": "short_notice"},
                    ).status = "superseded"
                continue
            pending += 1
            if dry_run:
                continue
            content = render_appointment_email(
                event=REMINDER_EVENT,
                to=email,
                appointment=appointment,
                branch_name=branch.name,
                workspace_name=workspace.name,
                management_token=issue_appointment_management_token(appointment.id),
                timezone=branch.timezone,
            )
            enqueue_email(
                self._session,
                workspace_id=appointment.workspace_id,
                appointment_id=appointment.id,
                event_key=event_key,
                event_type=REMINDER_EVENT,
                scheduled_for=target,
                extra={"timezone": branch.timezone},
                **content,
            )
        if not dry_run:
            self._session.commit()
        return {"omitted": omitted, "pending": pending}

    def _due_notifications(
        self,
        *,
        workspace_id: UUID | None,
        recipient_email: str | None,
        now: datetime,
    ) -> list[EmailNotification]:
        statement = (
            select(EmailNotification)
            .where(
                EmailNotification.event_type == REMINDER_EVENT,
                EmailNotification.status.in_(("pending", "failed")),
                EmailNotification.scheduled_for >= now - timedelta(hours=1),
                EmailNotification.scheduled_for <= now,
                (EmailNotification.next_attempt_at.is_(None))
                | (EmailNotification.next_attempt_at <= now),
            )
            .with_for_update(skip_locked=True)
        )
        if workspace_id is not None:
            statement = statement.where(EmailNotification.workspace_id == workspace_id)
        if recipient_email:
            statement = statement.where(EmailNotification.recipient == recipient_email)
        return list(self._session.scalars(statement).all())

    def _mark_reminder_sent(self, notification: EmailNotification) -> None:
        if notification.appointment_id is None:
            return
        appointment = self._session.get(Appointment, notification.appointment_id)
        if appointment is not None:
            appointment.reminder_sent = True
