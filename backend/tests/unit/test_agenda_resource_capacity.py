from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock
from uuid import uuid7

import pytest
from app.services.agenda import AgendaService
from app.services.errors import ConflictError

_START = datetime(2026, 10, 29, 14, 0, tzinfo=UTC)
_END = _START + timedelta(minutes=60)


def _service(repository: MagicMock) -> AgendaService:
    service = AgendaService(MagicMock())
    service._repository = repository
    return service


def _appointment(start_offset: int, minutes: int) -> MagicMock:
    appointment = MagicMock()
    appointment.starts_at = _START + timedelta(minutes=start_offset)
    appointment.ends_at = appointment.starts_at + timedelta(minutes=minutes)
    return appointment


def _ensure(service: AgendaService, **overrides: object) -> None:
    values: dict[str, object] = {
        "workspace_id": uuid7(),
        "branch_id": uuid7(),
        "resource_id": uuid7(),
        "employee_id": None,
        "starts_at": _START,
        "ends_at": _END,
        "resource_capacity": 2,
        "exclude_appointment_id": None,
    }
    values.update(overrides)
    service._ensure_slot_available(**values)  # type: ignore[arg-type]


def test_exclusive_capacity_rejects_any_overlap_after_locking_the_cabin() -> None:
    repository = MagicMock()
    repository.conflicting_appointment.return_value = _appointment(0, 30)
    with pytest.raises(ConflictError) as raised:
        _ensure(_service(repository), resource_capacity=1)
    assert raised.value.parameter == "time"
    repository.lock_resource.assert_called_once()
    repository.overlapping_resource_appointments.assert_not_called()


def test_exclusive_capacity_allows_free_cabin() -> None:
    repository = MagicMock()
    repository.conflicting_appointment.return_value = None
    _ensure(_service(repository), resource_capacity=1)
    repository.conflicting_appointment.assert_called_once()


def test_cabinless_booking_skips_lock_and_uses_exclusive_check() -> None:
    repository = MagicMock()
    repository.conflicting_appointment.return_value = None
    _ensure(_service(repository), resource_id=None)
    repository.lock_resource.assert_not_called()
    repository.overlapping_resource_appointments.assert_not_called()


def test_shared_capacity_still_blocks_a_busy_employee() -> None:
    repository = MagicMock()
    repository.conflicting_appointment.return_value = _appointment(0, 60)
    with pytest.raises(ConflictError) as raised:
        _ensure(_service(repository), employee_id=uuid7())
    assert raised.value.parameter == "time"
    assert repository.conflicting_appointment.call_args.kwargs["resource_id"] is None
    repository.overlapping_resource_appointments.assert_not_called()


def test_shared_capacity_allows_second_person() -> None:
    repository = MagicMock()
    repository.conflicting_appointment.return_value = None
    repository.overlapping_resource_appointments.return_value = (_appointment(0, 60),)
    _ensure(_service(repository), employee_id=uuid7())


def test_shared_capacity_rejects_third_person_with_cabin_name() -> None:
    repository = MagicMock()
    repository.lock_resource.return_value.name = "Cabina 1"
    repository.overlapping_resource_appointments.return_value = (
        _appointment(0, 60),
        _appointment(15, 30),
    )
    with pytest.raises(ConflictError) as raised:
        _ensure(_service(repository))
    assert raised.value.parameter == "cabinaId"
    assert str(raised.value) == "Cabina 1 ya tiene 2 personas en ese horario."


def test_shared_capacity_falls_back_to_generic_cabin_name() -> None:
    repository = MagicMock()
    repository.lock_resource.return_value = None
    repository.overlapping_resource_appointments.return_value = (
        _appointment(0, 60),
        _appointment(0, 60),
    )
    with pytest.raises(ConflictError) as raised:
        _ensure(_service(repository))
    assert str(raised.value).startswith("La cabina ya tiene 2 personas")
