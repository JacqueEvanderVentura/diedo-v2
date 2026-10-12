from hashlib import sha256
from uuid import uuid7

import pytest
from app.core.security import hash_password
from app.db.session import session_scope
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "phase-two-owner-password-not-a-secret"


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
    return headers, me.json()


def _import_customers(
    client: TestClient,
    headers: dict[str, str],
    branch_id: str,
    items: list[dict[str, object]],
) -> list[dict[str, object]]:
    suffix = uuid7().hex[-8:]
    response = client.post(
        "/api/v1/customers/import",
        headers={**headers, "Idempotency-Key": sha256(suffix.encode()).hexdigest()},
        json={"branchIds": [branch_id], "items": items},
    )
    assert response.status_code == 201, response.text
    return response.json()["items"]


@pytest.mark.integration
def test_import_customer_updates_existing_phone_with_new_name(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = session["visibleBranches"][0]["id"]
    suffix = uuid7().hex[-8:]
    phone = f"809{suffix[:7]}"
    created = _import_customers(
        client,
        headers,
        branch_id,
        [
            {
                "externalId": f"first-{suffix}",
                "displayName": "Cliente sin nombre",
                "phone": phone,
                "acquisitionSource": "otros",
            }
        ],
    )
    assert created[0]["status"] == "created"

    updated = _import_customers(
        client,
        headers,
        branch_id,
        [
            {
                "externalId": f"second-{suffix}",
                "displayName": "María Actualizada",
                "firstName": "María",
                "lastName": "Actualizada",
                "phone": phone,
                "acquisitionSource": "otros",
            }
        ],
    )
    assert updated[0]["status"] == "updated"
    assert updated[0]["customerId"] == created[0]["customerId"]


@pytest.mark.integration
def test_import_customer_skips_when_duplicate_has_no_new_data(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = session["visibleBranches"][0]["id"]
    suffix = uuid7().hex[-8:]
    phone = f"829{suffix[:7]}"
    item = {
        "externalId": f"dup-{suffix}",
        "displayName": "Cliente estable",
        "phone": phone,
        "acquisitionSource": "otros",
    }
    first = _import_customers(client, headers, branch_id, [item])
    assert first[0]["status"] == "created"

    second = _import_customers(client, headers, branch_id, [item])
    assert second[0]["status"] == "skipped"


@pytest.mark.integration
def test_import_customer_updates_by_email_when_phone_missing(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = session["visibleBranches"][0]["id"]
    suffix = uuid7().hex[-8:]
    email = f"import.{suffix}@example.com"
    created = _import_customers(
        client,
        headers,
        branch_id,
        [
            {
                "externalId": f"email-{suffix}",
                "displayName": "Cliente sin nombre",
                "email": email,
                "acquisitionSource": "otros",
            }
        ],
    )
    assert created[0]["status"] == "created"

    updated = _import_customers(
        client,
        headers,
        branch_id,
        [
            {
                "externalId": f"email-upd-{suffix}",
                "displayName": "Correo Actualizado",
                "email": email,
                "acquisitionSource": "otros",
            }
        ],
    )
    assert updated[0]["status"] == "updated"


@pytest.mark.integration
def test_import_customer_creates_when_phone_differs(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = session["visibleBranches"][0]["id"]
    suffix = uuid7().hex[-8:]
    email = f"shared.{suffix}@example.com"
    first = _import_customers(
        client,
        headers,
        branch_id,
        [
            {
                "externalId": f"a-{suffix}",
                "displayName": "Primero",
                "phone": f"809{suffix[:7]}",
                "email": email,
                "acquisitionSource": "otros",
            }
        ],
    )
    second = _import_customers(
        client,
        headers,
        branch_id,
        [
            {
                "externalId": f"b-{suffix}",
                "displayName": "Segundo",
                "phone": f"829{suffix[:7]}",
                "email": email,
                "acquisitionSource": "otros",
            }
        ],
    )
    assert first[0]["status"] == "created"
    assert second[0]["status"] == "created"
    assert second[0]["customerId"] != first[0]["customerId"]
