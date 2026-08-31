from decimal import Decimal
from typing import Any, cast
from uuid import uuid7

import pytest
from app.core.security import hash_password
from app.db.session import session_scope
from app.schemas.purchasing import CreateSupplierRequest, PurchaseRequestItemInput
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from pydantic import ValidationError

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "purchasing-owner-password-not-a-secret"


def _bootstrap_and_login(client: TestClient) -> tuple[dict[str, str], dict[str, object]]:
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OWNER_PASSWORD))
    login = client.post(
        "/api/v1/auth/login",
        json={"email": _OWNER_EMAIL, "password": _OWNER_PASSWORD},
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200, me.text
    assert "purchasing" in me.json()["enabledModules"]
    return headers, me.json()


def test_purchasing_schemas_reject_duplicate_branches_and_invalid_lines() -> None:
    branch_id = uuid7()
    with pytest.raises(ValidationError, match="No repitas"):
        CreateSupplierRequest.model_validate(
            {"name": "Proveedor", "branchIds": [branch_id, branch_id]}
        )
    with pytest.raises(ValidationError, match="greater than 0"):
        PurchaseRequestItemInput(
            name="Artículo", qty=Decimal("0"), unit="unidad", price=Decimal("10")
        )


@pytest.mark.integration
def test_purchasing_complete_http_contract(client: TestClient) -> None:
    headers, session_context = _bootstrap_and_login(client)
    visible_branches = cast(list[dict[str, Any]], session_context["visibleBranches"])
    branch_id = str(visible_branches[0]["id"])
    membership_id = str(session_context["membershipId"])
    suffix = uuid7().hex[-10:]

    unauthorized = client.get("/api/v1/purchasing/suppliers")
    assert unauthorized.status_code == 401

    settings = client.get("/api/v1/purchasing/settings", headers=headers)
    assert settings.status_code == 200, settings.text
    approvers = client.get("/api/v1/purchasing/settings/approvers", headers=headers)
    assert approvers.status_code == 200, approvers.text
    assert approvers.headers["cache-control"] == "no-store"
    assert {item["id"] for item in approvers.json()} >= {membership_id}
    settings_update = client.put(
        "/api/v1/purchasing/settings",
        headers=headers,
        json={
            "version": settings.json()["version"],
            "approverUserId": membership_id,
            "notifyOnRequest": False,
        },
    )
    assert settings_update.status_code == 200, settings_update.text
    assert settings_update.json()["approverUserId"] == membership_id
    assert settings_update.json()["notifyOnRequest"] is False

    supplier_payload = {
        "name": f"Proveedor Compras {suffix}",
        "rnc": f"RNC-{suffix}",
        "contactName": "María Compras",
        "phone": "809-555-0101",
        "email": f"compras-{suffix}@example.com",
        "address": "Santo Domingo",
        "branchIds": [branch_id],
    }
    create_supplier = client.post(
        "/api/v1/purchasing/suppliers",
        headers={**headers, "Idempotency-Key": f"supplier-{suffix}"},
        json=supplier_payload,
    )
    assert create_supplier.status_code == 201, create_supplier.text
    supplier = create_supplier.json()
    assert supplier["branchIds"] == [branch_id]
    assert supplier["active"] is True
    assert supplier["productCount"] == 0

    replay = client.post(
        "/api/v1/purchasing/suppliers",
        headers={**headers, "Idempotency-Key": f"supplier-{suffix}"},
        json=supplier_payload,
    )
    assert replay.status_code == 201, replay.text
    assert replay.json()["id"] == supplier["id"]

    conflict = client.post(
        "/api/v1/purchasing/suppliers",
        headers={**headers, "Idempotency-Key": f"supplier-{suffix}"},
        json={**supplier_payload, "name": f"Otro {suffix}"},
    )
    assert conflict.status_code == 409
    assert conflict.json()["parameter"] == "Idempotency-Key"

    supplier_list = client.get(
        "/api/v1/purchasing/suppliers",
        headers=headers,
        params={"branchId": branch_id, "search": suffix, "sortBy": "createdAt"},
    )
    assert supplier_list.status_code == 200, supplier_list.text
    assert supplier_list.headers["cache-control"] == "no-store"
    assert supplier_list.json()["totalItems"] == 1

    update_supplier = client.patch(
        f"/api/v1/purchasing/suppliers/{supplier['id']}",
        headers=headers,
        json={"version": supplier["version"], "contactName": "Contacto actualizado"},
    )
    assert update_supplier.status_code == 200, update_supplier.text
    supplier = update_supplier.json()
    assert supplier["contactName"] == "Contacto actualizado"

    stale_supplier = client.patch(
        f"/api/v1/purchasing/suppliers/{supplier['id']}",
        headers=headers,
        json={"version": 1, "phone": "809-000-0000"},
    )
    assert stale_supplier.status_code == 409
    assert stale_supplier.json()["parameter"] == "version"

    request_payload = {
        "supplierId": supplier["id"],
        "branchId": branch_id,
        "items": [
            {"name": "Guantes", "qty": "5", "unit": "caja", "price": "320.00"},
            {"name": "Cera", "qty": "10", "unit": "unidad", "price": "450.00"},
        ],
        "priority": "alta",
        "notes": "Reposición de prueba",
        "quoteFile": {"name": "cotizacion.pdf"},
    }
    create_request = client.post(
        "/api/v1/purchasing/requests",
        headers={**headers, "Idempotency-Key": f"request-{suffix}"},
        json=request_payload,
    )
    assert create_request.status_code == 201, create_request.text
    purchase_request = create_request.json()
    assert purchase_request["status"] == "pendiente"
    assert purchase_request["priority"] == "alta"
    assert purchase_request["requesterId"] == membership_id
    assert purchase_request["quoteFile"] == {"name": "cotizacion.pdf"}
    assert Decimal(str(purchase_request["total"])) == Decimal("6100.00")

    request_replay = client.post(
        "/api/v1/purchasing/requests",
        headers={**headers, "Idempotency-Key": f"request-{suffix}"},
        json=request_payload,
    )
    assert request_replay.status_code == 201, request_replay.text
    assert request_replay.json()["id"] == purchase_request["id"]

    update_request = client.patch(
        f"/api/v1/purchasing/requests/{purchase_request['id']}",
        headers=headers,
        json={
            "version": purchase_request["version"],
            "notes": "Reposición actualizada",
            "priority": "normal",
        },
    )
    assert update_request.status_code == 200, update_request.text
    purchase_request = update_request.json()
    assert purchase_request["version"] == 2
    assert purchase_request["notes"] == "Reposición actualizada"

    stats = client.get(
        "/api/v1/purchasing/requests/stats",
        headers=headers,
        params={"branchId": branch_id},
    )
    assert stats.status_code == 200, stats.text
    assert stats.json()["total"] >= 1
    assert stats.json()["pendiente"] >= 1

    review = client.post(
        f"/api/v1/purchasing/requests/{purchase_request['id']}/review",
        headers=headers,
        json={"version": purchase_request["version"], "status": "aprobada"},
    )
    assert review.status_code == 200, review.text
    purchase_request = review.json()
    assert purchase_request["status"] == "aprobada"
    assert purchase_request["reviewedBy"] == membership_id
    assert purchase_request["reviewedAt"] is not None

    edit_reviewed = client.patch(
        f"/api/v1/purchasing/requests/{purchase_request['id']}",
        headers=headers,
        json={"version": purchase_request["version"], "notes": "No permitido"},
    )
    assert edit_reviewed.status_code == 400

    delivered = client.post(
        f"/api/v1/purchasing/requests/{purchase_request['id']}/deliver",
        headers=headers,
        json={"version": purchase_request["version"]},
    )
    assert delivered.status_code == 200, delivered.text
    assert delivered.json()["status"] == "entregada"
    assert delivered.json()["deliveredAt"] is not None

    archive = client.delete(
        f"/api/v1/purchasing/suppliers/{supplier['id']}", headers=headers
    )
    assert archive.status_code == 204, archive.text
    missing_supplier = client.get(
        f"/api/v1/purchasing/suppliers/{supplier['id']}", headers=headers
    )
    assert missing_supplier.status_code == 404
    historical_request = client.get(
        f"/api/v1/purchasing/requests/{purchase_request['id']}", headers=headers
    )
    assert historical_request.status_code == 200, historical_request.text
    assert historical_request.json()["supplierName"] == supplier["name"]
