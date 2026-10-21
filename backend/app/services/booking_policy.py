from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.schemas.booking_policy import PUBLIC_BOOKING_LEAD_MINUTES_CHOICES

_LEAD_LABELS: dict[int, str] = {
    5: "5 minutos",
    30: "30 minutos",
    45: "45 minutos",
    60: "60 minutos",
    90: "1 hora y 30 minutos",
    240: "4 horas",
    360: "6 horas",
    720: "12 horas",
    1440: "24 horas",
}


def lead_time_label(minutes: int) -> str:
    return _LEAD_LABELS.get(minutes, f"{minutes} minutos")


def slot_meets_booking_lead(
    start_utc: datetime,
    now_utc: datetime,
    min_lead_minutes: int,
) -> bool:
    if min_lead_minutes not in PUBLIC_BOOKING_LEAD_MINUTES_CHOICES:
        min_lead_minutes = 5
    return start_utc > now_utc + timedelta(minutes=min_lead_minutes)


def appointment_meets_cancel_lead(
    starts_at_utc: datetime,
    now_utc: datetime,
    min_lead_minutes: int,
) -> bool:
    if min_lead_minutes not in PUBLIC_BOOKING_LEAD_MINUTES_CHOICES:
        min_lead_minutes = 5
    return starts_at_utc > now_utc + timedelta(minutes=min_lead_minutes)


def booking_lead_conflict_message(min_lead_minutes: int) -> str:
    return f"Debes agendar con al menos {lead_time_label(min_lead_minutes)} de anticipación."


def cancel_lead_conflict_message(min_lead_minutes: int) -> str:
    return (
        f"Debes cancelar o reagendar con al menos {lead_time_label(min_lead_minutes)} "
        "de anticipación."
    )


def utc_now() -> datetime:
    return datetime.now(UTC)
