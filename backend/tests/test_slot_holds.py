from uuid import uuid7

import pytest

from tests.test_public_booking_flow import _slot_params, payload_for

pytest_plugins = ("tests.test_public_booking_flow",)


def _hold_headers(token: str) -> dict[str, str]:
    return {"X-Slot-Hold-Token": token}


@pytest.mark.integration
def test_claim_hold_blocks_second_claim(client, booking_setup):
    headers, _, branch, employee, service = booking_setup
    del headers
    body = payload_for(employee, service)
    base = f"/api/v1/public/booking/branches/{branch}"
    token_a = f"hold-token-a-{uuid7().hex[:12]}"
    token_b = f"hold-token-b-{uuid7().hex[:12]}"

    slots = client.get(
        f"{base}/slots",
        params=_slot_params(body, employee, service),
    ).json()["slots"]
    assert slots
    pick = slots[0]

    claim_a = client.post(
        f"{base}/slot-holds",
        headers=_hold_headers(token_a),
        json={
            "serviceId": service,
            "employeeId": employee,
            "date": body["date"],
            "time": pick,
        },
    )
    assert claim_a.status_code == 201, claim_a.text

    slots_after_resp = client.get(
        f"{base}/slots",
        headers=_hold_headers(token_b),
        params=_slot_params(body, employee, service),
    )
    assert slots_after_resp.status_code == 200, slots_after_resp.text
    slots_after = slots_after_resp.json()
    assert pick not in slots_after["slots"] or any(
        row["time"] == pick for row in slots_after.get("heldSlots", [])
    )
    if slots_after.get("heldSlots"):
        held = slots_after["heldSlots"][0]
        assert set(held.keys()) <= {"time", "expiresAt", "resourceId", "employeeId"}

    claim_b = client.post(
        f"{base}/slot-holds",
        headers=_hold_headers(token_b),
        json={
            "serviceId": service,
            "employeeId": employee,
            "date": body["date"],
            "time": pick,
        },
    )
    assert claim_b.status_code == 409, claim_b.text
    assert claim_b.json()["details"]["held"] is True


@pytest.mark.integration
def test_book_consumes_active_hold(client, booking_setup):
    _, _, branch, employee, service = booking_setup
    body = payload_for(employee, service)
    base = f"/api/v1/public/booking/branches/{branch}"
    token = f"hold-token-{uuid7().hex[:12]}"

    slots = client.get(
        f"{base}/slots",
        params=_slot_params(body, employee, service),
    ).json()["slots"]
    pick = slots[0]
    claim = client.post(
        f"{base}/slot-holds",
        headers=_hold_headers(token),
        json={
            "serviceId": service,
            "employeeId": employee,
            "date": body["date"],
            "time": pick,
        },
    )
    assert claim.status_code == 201, claim.text

    book = client.post(
        f"{base}/appointments",
        headers={
            **_hold_headers(token),
            "Idempotency-Key": f"hold-book-{uuid7().hex[:16]}",
        },
        json={**body, "time": pick},
    )
    assert book.status_code == 201, book.text

    list_after = client.get(
        f"{base}/slots",
        params=_slot_params(body, employee, service),
    ).json()
    assert pick not in list_after["slots"]


@pytest.mark.integration
def test_staff_create_rejects_held_slot(client, booking_setup):
    headers, _, branch, employee, service = booking_setup
    body = payload_for(employee, service)
    base = f"/api/v1/public/booking/branches/{branch}"
    token = f"hold-token-{uuid7().hex[:12]}"

    slots = client.get(
        f"{base}/slots",
        params=_slot_params(body, employee, service),
    ).json()["slots"]
    pick = slots[0]
    claim = client.post(
        f"{base}/slot-holds",
        headers=_hold_headers(token),
        json={
            "serviceId": service,
            "employeeId": employee,
            "date": body["date"],
            "time": pick,
        },
    )
    assert claim.status_code == 201, claim.text
    resource_id = claim.json()["resourceId"]

    staff_create = client.post(
        "/api/v1/appointments",
        headers={**headers, "Idempotency-Key": f"staff-hold-{uuid7().hex[:16]}"},
        json={
            "branchId": branch,
            "resourceId": resource_id,
            "employeeId": employee,
            "serviceId": service,
            "date": body["date"],
            "time": pick,
            "duration": 45,
            "customerName": "Staff sobre hold",
            "serviceName": "Servicio hold",
            "price": "0",
            "status": "confirmed",
        },
    )
    assert staff_create.status_code == 409, staff_create.text
