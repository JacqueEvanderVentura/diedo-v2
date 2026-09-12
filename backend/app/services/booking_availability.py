from __future__ import annotations

from datetime import date, time
from typing import Any


def _normalize_time(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, time):
        return value.strftime("%H:%M")
    parts = str(value).strip().split(":")
    try:
        hours = int(parts[0])
        minutes = int(parts[1] if len(parts) > 1 else 0)
    except TypeError, ValueError:
        return ""
    return f"{hours:02d}:{minutes:02d}"


def _to_minutes(value: str) -> int:
    normalized = _normalize_time(value)
    if not normalized:
        return 0
    hours, minutes = normalized.split(":")
    return int(hours) * 60 + int(minutes)


def time_ranges_overlap(start_a: str, dur_a: int, start_b: str, dur_b: int) -> bool:
    duration_a = dur_a or 30
    duration_b = dur_b or 30
    a0 = _to_minutes(start_a)
    a1 = a0 + duration_a
    b0 = _to_minutes(start_b)
    b1 = b0 + duration_b
    return a0 < b1 and b0 < a1


def appointment_blocks_slot(appointment: dict[str, Any]) -> bool:
    status = str(appointment.get("status") or "confirmed").lower()
    return status not in {"cancelled", "cancelada"}


def _default_slots() -> list[str]:
    slots: list[str] = []
    for hour in range(8, 20):
        for minute in (0, 30):
            slots.append(f"{hour:02d}:{minute:02d}")
    return slots


def _weekday_key(scheduled_date: date) -> str:
    return ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[scheduled_date.weekday()]


def _schedule_slots(weekly_schedule: dict[str, Any] | None, scheduled_date: date) -> list[str]:
    if not weekly_schedule:
        return _default_slots()
    blocks = weekly_schedule.get(_weekday_key(scheduled_date), [])
    if not blocks:
        return []
    slots: list[str] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        start = _normalize_time(block.get("start"))
        end = _normalize_time(block.get("end"))
        if not start or not end:
            continue
        cursor = _to_minutes(start)
        end_minutes = _to_minutes(end)
        while cursor + 30 <= end_minutes:
            hours, minutes = divmod(cursor, 60)
            slots.append(f"{hours:02d}:{minutes:02d}")
            cursor += 30
    return slots


def get_available_slots(
    *,
    scheduled_date: date,
    duration_minutes: int,
    weekly_schedule: dict[str, Any] | None,
    appointments: list[dict[str, Any]],
    on_approved_vacation: bool = False,
) -> list[str]:
    if on_approved_vacation:
        return []
    base_slots = _schedule_slots(weekly_schedule, scheduled_date)
    if not base_slots:
        return []
    duration = duration_minutes or 30
    available: list[str] = []
    for slot in base_slots:
        if any(
            appointment_blocks_slot(appointment)
            and time_ranges_overlap(
                slot,
                duration,
                _normalize_time(appointment.get("time") or appointment.get("scheduled_time")),
                int(appointment.get("duration") or appointment.get("duration_minutes") or 30),
            )
            for appointment in appointments
        ):
            continue
        end_minutes = _to_minutes(slot) + duration
        if end_minutes > _to_minutes(base_slots[-1]) + 30:
            continue
        available.append(slot)
    return available


def is_slot_available(
    *,
    scheduled_date: date,
    slot_time: str,
    duration_minutes: int,
    weekly_schedule: dict[str, Any] | None,
    appointments: list[dict[str, Any]],
    on_approved_vacation: bool = False,
) -> bool:
    return slot_time in get_available_slots(
        scheduled_date=scheduled_date,
        duration_minutes=duration_minutes,
        weekly_schedule=weekly_schedule,
        appointments=appointments,
        on_approved_vacation=on_approved_vacation,
    )
