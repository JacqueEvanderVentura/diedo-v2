from datetime import date

from app.services.booking_availability import get_available_slots, is_slot_available


def test_slots_hide_conflicting_appointments() -> None:
    scheduled_date = date(2026, 3, 10)
    appointments = [{"time": "10:00", "duration": 60, "status": "confirmed"}]
    slots = get_available_slots(
        scheduled_date=scheduled_date,
        duration_minutes=30,
        weekly_schedule={"tue": [{"start": "08:00", "end": "12:00"}]},
        appointments=appointments,
    )
    assert "10:00" not in slots
    assert "10:30" not in slots
    assert "11:00" in slots


def test_is_slot_available_matches_slots() -> None:
    scheduled_date = date(2026, 3, 10)
    appointments = [{"time": "15:00", "duration": 30, "status": "confirmed"}]
    assert (
        is_slot_available(
            scheduled_date=scheduled_date,
            slot_time="15:00",
            duration_minutes=30,
            weekly_schedule={"tue": [{"start": "08:00", "end": "20:00"}]},
            appointments=appointments,
        )
        is False
    )
