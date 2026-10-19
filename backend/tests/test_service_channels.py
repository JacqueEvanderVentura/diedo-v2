from uuid import uuid7

import pytest
from fastapi.testclient import TestClient

from tests.test_inventory import _bootstrap_and_login, _create_category, _unit_id


@pytest.mark.integration
def test_service_channel_flags_control_pos_and_agenda(client: TestClient) -> None:
    headers, session_context, _summary = _bootstrap_and_login(client)
    branch_id = str(session_context["visibleBranches"][0]["id"])
    suffix = uuid7().hex[-10:]
    category = _create_category(client, headers, suffix)
    unit_id = _unit_id(client, headers)

    agenda_only = client.post(
        "/api/v1/inventory/services",
        headers={**headers, "Idempotency-Key": f"svc-agenda-{suffix}"},
        json={
            "name": f"Agenda only {suffix}",
            "categoryId": category["id"],
            "unitOfMeasureId": unit_id,
            "branchIds": [branch_id],
            "salePrice": "500.00",
            "taxRate": "18.00",
            "availableInAgenda": True,
            "availableInPos": False,
        },
    )
    assert agenda_only.status_code == 201, agenda_only.text
    agenda_service = agenda_only.json()
    assert agenda_service["availableInAgenda"] is True
    assert agenda_service["availableInPos"] is False

    pos_only = client.post(
        "/api/v1/inventory/services",
        headers={**headers, "Idempotency-Key": f"svc-pos-{suffix}"},
        json={
            "name": f"POS only {suffix}",
            "categoryId": category["id"],
            "unitOfMeasureId": unit_id,
            "branchIds": [branch_id],
            "salePrice": "700.00",
            "taxRate": "18.00",
            "availableInAgenda": False,
            "availableInPos": True,
        },
    )
    assert pos_only.status_code == 201, pos_only.text
    pos_service = pos_only.json()

    invalid = client.post(
        "/api/v1/inventory/services",
        headers={**headers, "Idempotency-Key": f"svc-none-{suffix}"},
        json={
            "name": f"Invalid {suffix}",
            "categoryId": category["id"],
            "unitOfMeasureId": unit_id,
            "branchIds": [branch_id],
            "salePrice": "100.00",
            "availableInAgenda": False,
            "availableInPos": False,
        },
    )
    assert invalid.status_code == 400

    pos_state = client.get(
        "/api/v1/pos/state",
        headers=headers,
        params={"branchId": branch_id},
    )
    assert pos_state.status_code == 200, pos_state.text
    catalog_ids = {item["id"] for item in pos_state.json()["catalog"]}
    assert pos_service["id"] in catalog_ids
    assert agenda_service["id"] not in catalog_ids

    booking_context = client.get(f"/api/v1/public/booking/branches/{branch_id}/context")
    assert booking_context.status_code == 200, booking_context.text
    booking_ids = {item["id"] for item in booking_context.json()["services"]}
    assert agenda_service["id"] in booking_ids
    assert pos_service["id"] not in booking_ids
