from datetime import UTC, datetime, timedelta

from app.services.booking_policy import (
    appointment_meets_cancel_lead,
    booking_lead_conflict_message,
    cancel_lead_conflict_message,
    slot_meets_booking_lead,
)


def test_slot_meets_booking_lead_requires_strictly_after_window() -> None:
    now = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    assert slot_meets_booking_lead(now + timedelta(minutes=5), now, 5) is False
    assert slot_meets_booking_lead(now + timedelta(minutes=6), now, 5) is True


def test_appointment_meets_cancel_lead() -> None:
    now = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    starts = now + timedelta(minutes=60)
    assert appointment_meets_cancel_lead(starts, now, 60) is False
    assert appointment_meets_cancel_lead(starts + timedelta(minutes=1), now, 60) is True


def test_conflict_messages_include_human_labels() -> None:
    assert "60 minutos" in booking_lead_conflict_message(60)
    assert "4 horas" in cancel_lead_conflict_message(240)
