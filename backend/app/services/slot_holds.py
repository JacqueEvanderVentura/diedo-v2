from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from app.db.models.agenda import SLOT_HOLD_DURATION_MINUTES, AppointmentSlotHold
from app.services.booking_policy import utc_now

HOLD_TTL = timedelta(minutes=SLOT_HOLD_DURATION_MINUTES)


def hold_expires_at(now: datetime | None = None) -> datetime:
    base = now or utc_now()
    return base + HOLD_TTL


def serialize_held_slot(hold: AppointmentSlotHold) -> dict[str, Any]:
    return {
        "time": hold.scheduled_time.strftime("%H:%M"),
        "expires_at": hold.expires_at,
        "resource_id": hold.resource_id,
        "employee_id": hold.employee_id,
    }


def serialize_held_slots(holds: tuple[AppointmentSlotHold, ...]) -> list[dict[str, Any]]:
    return [serialize_held_slot(hold) for hold in holds]
