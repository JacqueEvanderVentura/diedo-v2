"""Expire temporary slot holds and notify on abandoned self-booking attempts."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from app.db.models import Appointment, Branch, Customer, Workspace
from app.db.models.agenda import AppointmentSlotHold
from app.schemas.user_notifications import SlotHoldResumeLink
from app.services.email_notifications import deliver_email, enqueue_email
from app.services.mailer import render_slot_hold_abandoned_email
from app.services.user_notifications import UserNotificationService, deliver_pending_in_app_emails

logger = logging.getLogger(__name__)

CUSTOMER_ABANDONED_EVENT = "slot_hold.abandoned"


def customer_completed_booking_after(session: Session, hold: AppointmentSlotHold) -> bool:
    base = (
        Appointment.workspace_id == hold.workspace_id,
        Appointment.record_status == "active",
        Appointment.created_at >= hold.created_at,
    )
    if hold.customer_id is not None:
        by_customer = session.scalar(
            select(
                exists().where(
                    *base,
                    Appointment.customer_id == hold.customer_id,
                )
            )
        )
        if by_customer:
            return True
    email = (hold.customer_email or "").strip().lower()
    if not email:
        return False
    return bool(
        session.scalar(
            select(
                exists(
                    select(1)
                    .select_from(Appointment)
                    .join(
                        Customer,
                        (Customer.workspace_id == Appointment.workspace_id)
                        & (Customer.id == Appointment.customer_id),
                    )
                    .where(
                        *base,
                        func.lower(Customer.email) == email,
                    )
                )
            )
        )
    )


def _resolve_customer_email(session: Session, hold: AppointmentSlotHold) -> str | None:
    raw = (hold.customer_email or "").strip()
    if raw:
        return raw
    if hold.customer_id is None:
        return None
    email = session.scalar(
        select(Customer.email).where(
            Customer.workspace_id == hold.workspace_id,
            Customer.id == hold.customer_id,
            Customer.status == "active",
        )
    )
    if email is None:
        return None
    cleaned = str(email).strip()
    return cleaned or None


def _scheduled_label(hold: AppointmentSlotHold) -> str:
    return f"{hold.scheduled_date.isoformat()} {hold.scheduled_time.strftime('%H:%M')}"


def _process_expired_hold(session: Session, hold: AppointmentSlotHold) -> list[UUID]:
    if customer_completed_booking_after(session, hold):
        return []
    customer_notification_ids: list[UUID] = []
    branch = session.scalar(
        select(Branch).where(
            Branch.workspace_id == hold.workspace_id,
            Branch.id == hold.branch_id,
        )
    )
    workspace = session.scalar(select(Workspace).where(Workspace.id == hold.workspace_id))
    if branch is None or workspace is None:
        logger.warning("Skipping abandoned hold notification; branch or workspace missing.")
        return []

    customer_name = (hold.customer_display_name or "").strip() or "Alguien"
    service_name = (hold.service_name or "").strip() or "Servicio"
    scheduled_label = _scheduled_label(hold)

    # The hold row is deleted right after this, so keep what staff needs to resume it.
    resume_link = SlotHoldResumeLink(
        branch_id=hold.branch_id,
        service_id=hold.service_id,
        service_name=hold.service_name,
        employee_id=hold.employee_id,
        customer_name=hold.customer_display_name,
        customer_phone=(hold.customer_phone or "").strip() or None,
        scheduled_date=hold.scheduled_date,
        scheduled_time=hold.scheduled_time.strftime("%H:%M"),
    ).model_dump(by_alias=True, mode="json")

    UserNotificationService(session).notify_slot_hold_abandoned(
        workspace_id=hold.workspace_id,
        hold_id=hold.id,
        customer_name=customer_name,
        service_name=service_name,
        scheduled_label=scheduled_label,
        employee_id=hold.employee_id,
        resume_link=resume_link,
    )

    recipient = _resolve_customer_email(session, hold)
    if recipient:
        content = render_slot_hold_abandoned_email(
            to=recipient,
            customer_name=customer_name,
            service_name=service_name,
            branch_name=branch.name,
            workspace_name=workspace.name,
            hold=hold,
        )
        event_key = f"{CUSTOMER_ABANDONED_EVENT}.customer/{hold.id}"
        try:
            queued = enqueue_email(
                session,
                workspace_id=hold.workspace_id,
                event_key=event_key,
                event_type=CUSTOMER_ABANDONED_EVENT,
                to=content["to"],
                subject=content["subject"],
                html=content["html"],
                text=content["text"],
            )
            customer_notification_ids.append(queued.id)
        except Exception:
            logger.exception("Could not enqueue abandoned slot-hold customer email.")
    return customer_notification_ids


def purge_expired_slot_holds(session: Session, *, now: datetime) -> int:
    holds = session.scalars(
        select(AppointmentSlotHold).where(AppointmentSlotHold.expires_at <= now)
    ).all()
    customer_ids: list[UUID] = []
    for hold in holds:
        customer_ids.extend(_process_expired_hold(session, hold))
        session.delete(hold)
    if holds:
        session.flush()
    deliver_pending_in_app_emails(session)
    for notification_id in customer_ids:
        try:
            deliver_email(session, notification_id)
        except Exception:
            logger.exception("Abandoned slot-hold customer email delivery failed.")
    return len(holds)


def purge_summary(session: Session, *, now: datetime) -> dict[str, Any]:
    return {"purgedHolds": purge_expired_slot_holds(session, now=now)}
