from datetime import date, time
from unittest.mock import MagicMock, patch
from uuid import uuid7

import pytest
from app.services.errors import ConflictError
from app.services.public_booking import PublicBookingService


def test_pending_without_action_raises_conflict_with_details() -> None:
    service = PublicBookingService(MagicMock())
    branch = MagicMock()
    branch.id = uuid7()
    branch.workspace_id = uuid7()
    branch.timezone = "America/Santo_Domingo"
    branch.public_booking_min_lead_minutes = 0
    pending = {
        "id": uuid7(),
        "service_name": "Masaje",
        "date": date(2026, 11, 20),
        "time": "10:00",
    }
    employee_id = uuid7()
    with patch.object(service, "_resolve_branch", return_value=(branch, MagicMock())):
        with patch.object(service, "_system_access", return_value=(MagicMock(), MagicMock())):
            with patch.object(service, "_lock"):
                with patch.object(service, "_agenda") as agenda:
                    agenda.records_for_idempotency_key.return_value = []
                with patch.object(
                    service,
                    "_require_service",
                    return_value={
                        "duration_minutes": 30,
                        "name": "Masaje",
                        "price": 0,
                        "id": uuid7(),
                    },
                ):
                    with patch.object(
                        service, "_require_specialist", return_value=MagicMock(id=employee_id)
                    ):
                        with patch.object(
                            service, "_specialist_spare_capacity", return_value={"10:00": 1}
                        ):
                            with patch.object(
                                service, "_slot_resources", return_value={"10:00": [uuid7()]}
                            ):
                                with patch.object(
                                    service, "_normalized_document", return_value="001"
                                ):
                                    with patch.object(
                                        service,
                                        "_upsert_customer",
                                        return_value=MagicMock(id=uuid7()),
                                    ):
                                        with patch.object(service, "_assert_customer_slot_free"):
                                            with patch.object(
                                                service,
                                                "_pending_branch_appointment",
                                                return_value=pending,
                                            ):
                                                with pytest.raises(ConflictError) as raised:
                                                    service.book(
                                                        branch.id,
                                                        {
                                                            "service_id": uuid7(),
                                                            "date": date(2026, 11, 20),
                                                            "time": time(10, 0),
                                                            "document_type": "cedula",
                                                            "document_id": "001-0000000-0",
                                                            "display_name": "Cliente",
                                                            "employee_id": employee_id,
                                                        },
                                                        idempotency_key="test-key-1234",
                                                    )
    assert raised.value.parameter == "pendingAppointment"
    details = raised.value.details
    assert details is not None
    assert details["pendingAppointment"]["serviceName"] == "Masaje"
    assert details["pendingAppointment"]["time"] == "10:00"
