from datetime import date

from app.schemas.public_booking import PublicAvailabilityResponse
from app.services.public_booking import classify_day_availability


def test_classify_closed_when_no_capacity() -> None:
    assert classify_day_availability(0, 0) == "closed"
    assert classify_day_availability(3, 0) == "closed"


def test_classify_full_when_capacity_exists_but_none_remain() -> None:
    assert classify_day_availability(0, 16) == "full"


def test_classify_empty_when_all_slots_are_free() -> None:
    assert classify_day_availability(16, 16) == "empty"
    assert classify_day_availability(2, 2) == "empty"


def test_classify_limited_near_the_floor_or_quarter() -> None:
    assert classify_day_availability(1, 2) == "limited"
    assert classify_day_availability(2, 16) == "limited"
    assert classify_day_availability(4, 16) == "limited"
    assert classify_day_availability(1, 5) == "limited"


def test_classify_open_when_remaining_is_comfortable() -> None:
    assert classify_day_availability(5, 16) == "open"
    assert classify_day_availability(12, 16) == "open"


def test_availability_response_uses_from_to_aliases() -> None:
    payload = PublicAvailabilityResponse.model_validate(
        {
            "from_date": date(2026, 11, 1),
            "to_date": date(2026, 12, 12),
            "employee_id": None,
            "days": [
                {
                    "date": date(2026, 11, 25),
                    "available_slots": 16,
                    "total_slots": 16,
                    "status": "empty",
                }
            ],
        }
    )
    dumped = payload.model_dump(by_alias=True, mode="json")
    assert dumped["from"] == "2026-11-01"
    assert dumped["to"] == "2026-12-12"
    assert dumped["days"][0]["availableSlots"] == 16
