from hashlib import sha256
from uuid import uuid7

import pytest
from app.core.security import hash_password
from app.db.session import session_scope
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient

from tests.customer_payloads import customer_create_payload

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


@pytest.mark.integration
def test_create_customer_requires_document(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = session["visibleBranches"][0]["id"]
    missing = client.post(
        "/api/v1/customers",
        headers=headers,
        json={"displayName": "Sin documento", "branchIds": [branch_id]},
    )
    assert missing.status_code == 400, missing.text
    assert missing.json()["parameter"] == "documentType"


@pytest.mark.integration
def test_create_customer_rejects_duplicate_document(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = session["visibleBranches"][0]["id"]
    suffix = uuid7().hex[-8:]
    body = customer_create_payload(
        display_name=f"Cliente A {suffix}",
        branch_id=branch_id,
        document_suffix="1",
    )
    first = client.post("/api/v1/customers", headers=headers, json=body)
    assert first.status_code == 201, first.text
    body["displayName"] = f"Cliente B {suffix}"
    second = client.post("/api/v1/customers", headers=headers, json=body)
    assert second.status_code == 409, second.text
    assert second.json()["parameter"] == "documentId"


@pytest.mark.integration
def test_import_customer_without_document_succeeds(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = session["visibleBranches"][0]["id"]
    suffix = uuid7().hex[-8:]
    response = client.post(
        "/api/v1/customers/import",
        headers={**headers, "Idempotency-Key": sha256(suffix.encode()).hexdigest()},
        json={
            "branchIds": [branch_id],
            "items": [
                {
                    "externalId": f"imp-{suffix}",
                    "displayName": f"Importado {suffix}",
                }
            ],
        },
    )
    assert response.status_code == 201, response.text
    row = response.json()["items"][0]
    assert row["status"] == "created"


@pytest.mark.integration
def test_manual_lead_requires_document(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = session["visibleBranches"][0]["id"]
    key = sha256(uuid7().bytes).hexdigest()
    response = client.post(
        "/api/v1/crm/leads",
        headers={**headers, "Idempotency-Key": key},
        json={
            "branchId": branch_id,
            "name": "Lead sin doc",
            "source": "manual",
        },
    )
    assert response.status_code == 400, response.text


@pytest.mark.integration
def test_import_lead_without_document_succeeds(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = session["visibleBranches"][0]["id"]
    suffix = uuid7().hex[-8:]
    key = sha256(suffix.encode()).hexdigest()
    response = client.post(
        "/api/v1/crm/leads/import",
        headers={**headers, "Idempotency-Key": key},
        json={
            "branchId": branch_id,
            "source": "import",
            "items": [
                {
                    "branchId": branch_id,
                    "name": f"Lead import {suffix}",
                    "company": "ACME",
                }
            ],
        },
    )
    assert response.status_code == 201, response.text
    assert len(response.json()["items"]) == 1
