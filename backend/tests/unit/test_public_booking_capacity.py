from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock
from uuid import uuid7

import pytest
from app.services.errors import ConflictError
from app.services.public_booking import PublicBookingService

_START = datetime(2026, 11, 12, 21, 0, tzinfo=UTC)
_END = _START + timedelta(minutes=30)


def _service() -> PublicBookingService:
    return PublicBookingService(MagicMock())


def _resource() -> MagicMock:
    resource = MagicMock()
    resource.id = uuid7()
    return resource


def _occupant(resource_id, start=_START, minutes=30) -> MagicMock:
    appointment = MagicMock()
    appointment.resource_id = resource_id
    appointment.starts_at = start
    appointment.ends_at = start + timedelta(minutes=minutes)
    return appointment


def test_public_cabin_keeps_a_second_seat() -> None:
    resource = _resource()
    free = _service()._free_resource_ids(
        [resource],
        [_occupant(resource.id)],
        _START,
        _END,
    )
    assert free == [resource.id]


def test_public_cabin_closes_after_two_people() -> None:
    resource = _resource()
    free = _service()._free_resource_ids(
        [resource],
        [_occupant(resource.id), _occupant(resource.id)],
        _START,
        _END,
    )
    assert free == []


def test_same_customer_overlapping_slot_raises_conflict() -> None:
    service = _service()
    customer_id = uuid7()
    overlapping = MagicMock()
    service._session.scalars.return_value.first.return_value = overlapping
    with pytest.raises(ConflictError) as raised:
        service._assert_customer_slot_free(
            workspace_id=uuid7(),
            customer_id=customer_id,
            starts_at=_START,
            ends_at=_END,
        )
    assert raised.value.parameter == "time"
    assert "Ya tienes una cita en ese horario" in str(raised.value)


def test_same_customer_free_slot_allows_booking() -> None:
    service = _service()
    service._session.scalars.return_value.first.return_value = None
    service._assert_customer_slot_free(
        workspace_id=uuid7(),
        customer_id=uuid7(),
        starts_at=_START,
        ends_at=_END,
    )
