import secrets
from uuid import uuid7

import pytest
from app.core.security import hash_password
from app.db.session import session_scope
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from pydantic import SecretStr

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


def _create_customer(
    client: TestClient,
    headers: dict[str, str],
    branch_id: str,
    *,
    name: str,
    phone: str | None = None,
    email: str | None = None,
) -> dict[str, object]:
    payload = customer_create_payload(display_name=name, branch_id=branch_id)
    payload["firstName"] = name.split(" ")[0]
    if phone:
        payload["phone"] = phone
    if email:
        payload["email"] = email
    response = client.post("/api/v1/customers", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.integration
def test_duplicate_customers_list_and_manual_merge(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = session["visibleBranches"][0]["id"]
    suffix = uuid7().hex[-8:]
    phone = f"809{suffix[:7]}"
    first = _create_customer(client, headers, branch_id, name=f"Cliente A {suffix}", phone=phone)
    second = _create_customer(
        client,
        headers,
        branch_id,
        name=f"María Duplicada {suffix}",
        phone=phone,
        email=f"maria.{suffix}@example.com",
    )
    first_id = first["id"]
    second_id = second["id"]

    listed = client.get("/api/v1/customers/duplicates", headers=headers)
    assert listed.status_code == 200, listed.text
    groups = listed.json()["groups"]
    phone_groups = [
        group
        for group in groups
        if group["matchType"] == "phone"
        and {row["id"] for row in group["customers"]} >= {first_id, second_id}
    ]
    assert phone_groups

    merged = client.post(
        "/api/v1/customers/merge",
        headers=headers,
        json={"customerIds": [first_id, second_id], "keepCustomerId": second_id},
    )
    assert merged.status_code == 200, merged.text
    body = merged.json()
    assert body["keptCustomerId"] == second_id
    assert first_id in body["archivedCustomerIds"]
    kept = client.get(f"/api/v1/customers/{second_id}", headers=headers)
    assert kept.status_code == 200
    assert kept.json()["phone"].replace(" ", "") == phone
    listed_after = client.get("/api/v1/customers/duplicates", headers=headers)
    leftover = [
        group
        for group in listed_after.json()["groups"]
        if {row["id"] for row in group["customers"]} >= {first_id, second_id}
    ]
    assert leftover == []


@pytest.mark.integration
def test_auto_merge_duplicates_by_phone_then_email(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = session["visibleBranches"][0]["id"]
    suffix = uuid7().hex[-8:]
    phone = f"829{suffix[:7]}"
    email = f"auto.{suffix}@example.com"
    _create_customer(client, headers, branch_id, name=f"Ana Auto {suffix}", phone=phone)
    _create_customer(client, headers, branch_id, name=f"Ana Tel {suffix}", phone=phone)
    _create_customer(client, headers, branch_id, name=f"Correo Uno {suffix}", email=email)
    _create_customer(client, headers, branch_id, name=f"Correo Dos {suffix}", email=email)
    response = client.post("/api/v1/customers/merge-auto", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["mergedGroups"] >= 2
    assert body["archivedCustomers"] >= 2
    remaining = client.get("/api/v1/customers", headers=headers, params={"phone": phone})
    assert remaining.status_code == 200
    assert remaining.json()["totalItems"] == 1


@pytest.mark.integration
def test_merge_customers_requires_auth_and_valid_ids(client: TestClient) -> None:
    assert client.get("/api/v1/customers/duplicates").status_code == 401
    assert client.post("/api/v1/customers/merge-auto").status_code == 401
    headers, session = _bootstrap_and_login(client)
    branch_id = session["visibleBranches"][0]["id"]
    suffix = uuid7().hex[-8:]
    created = _create_customer(
        client, headers, branch_id, name=f"Solo {suffix}", phone=f"849{suffix[:7]}"
    )
    missing = client.post(
        "/api/v1/customers/merge",
        headers=headers,
        json={"customerIds": [created["id"], str(uuid7())], "keepCustomerId": created["id"]},
    )
    assert missing.status_code == 404

    from app.schemas.platform_operators import CreatePlatformOperatorInput
    from app.services.platform_operators import create_platform_operator

    data = CreatePlatformOperatorInput(
        email=f"operator-dup-{uuid7().hex}@example.com",
        display_name="Operator Dup",
        password=SecretStr("Operator!" + secrets.token_hex(20)),
    )
    with session_scope() as db:
        create_platform_operator(db, data)
    login = client.post(
        "/api/v1/auth/login",
        json={"email": str(data.email), "password": data.password.get_secret_value()},
    )
    assert login.status_code == 200, login.text
    operator_headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    assert client.get("/api/v1/customers/duplicates", headers=operator_headers).status_code == 403
    assert client.post("/api/v1/customers/merge-auto", headers=operator_headers).status_code == 403
