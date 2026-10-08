from uuid import uuid7

import pytest
from app.core.security import hash_password
from app.db.session import session_scope
from app.services.local_bootstrap import bootstrap_local_foundation
from app.services.membership_access_messages import user_inactive_message
from fastapi.testclient import TestClient

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "Local-test!password-not-a-secret"


def _login(client: TestClient, email: str, password: str) -> dict[str, object]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _authorization(tokens: dict[str, object]) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['accessToken']}"}


def _admin_headers(client: TestClient) -> dict[str, str]:
    return _authorization(_login(client, _OWNER_EMAIL, _OWNER_PASSWORD))


def _seller_assignment(client: TestClient) -> list[dict[str, object]]:
    options = client.get("/api/v1/users/form-options", headers=_admin_headers(client))
    assert options.status_code == 200
    seller = next(role for role in options.json()["roles"] if role["code"] == "seller")
    branch = options.json()["branches"][0]
    return [
        {
            "roleId": seller["id"],
            "scopeType": "branch",
            "branchId": branch["id"],
        }
    ]


@pytest.mark.integration
def test_login_rejects_inactive_user(client: TestClient) -> None:
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OWNER_PASSWORD))

    email = f"inactive-{uuid7()}@example.com"
    password = "Inactive!workspace-password-not-secret"
    created = client.post(
        "/api/v1/users",
        headers=_admin_headers(client),
        json={
            "displayName": "Usuario Inactivo",
            "email": email,
            "password": password,
            "roleAssignments": _seller_assignment(client),
        },
    )
    assert created.status_code == 201
    membership_id = created.json()["id"]
    version = created.json()["version"]

    suspended = client.patch(
        f"/api/v1/users/{membership_id}",
        headers=_admin_headers(client),
        json={"status": "inactive", "version": version},
    )
    assert suspended.status_code == 200

    inactive_login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert inactive_login.status_code == 401
    assert inactive_login.json()["message"] == user_inactive_message(email)


@pytest.mark.integration
def test_same_email_in_second_company_is_inactive_via_backoffice(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from pydantic import SecretStr

    from app.config import settings

    backoffice_key = "membership-cross-workspace-key"
    monkeypatch.setattr(settings, "backoffice_api_key", SecretStr(backoffice_key))
    monkeypatch.setattr(settings, "local_bootstrap_backoffice_password", None)

    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OWNER_PASSWORD))

    suffix = str(uuid7()).replace("-", "")[:12]
    email = f"shared-{suffix}@example.com"
    first = client.post(
        "/api/v1/backoffice/workspaces",
        headers={"X-Backoffice-Key": backoffice_key},
        json={
            "slug": f"first-{suffix}",
            "name": "First Co",
            "defaultCurrency": "DOP",
            "timezone": "America/Santo_Domingo",
            "locale": "es-DO",
            "owner": {
                "email": f"owner-a-{suffix}@example.com",
                "displayName": "Owner A",
                "password": "OwnerA!password-not-secret",
            },
        },
    )
    assert first.status_code == 201, first.text
    first_id = first.json()["workspaceId"]
    options = client.get(
        f"/api/v1/backoffice/workspaces/{first_id}/member-options",
        headers={"X-Backoffice-Key": backoffice_key},
    ).json()
    seller = next(role for role in options["roles"] if role["code"] == "seller")
    branch = options["branches"][0]
    shared = client.post(
        "/api/v1/backoffice/users",
        headers={"X-Backoffice-Key": backoffice_key},
        json={
            "workspaceId": first_id,
            "displayName": "Shared User",
            "email": email,
            "password": "Shared!password-not-secret",
            "roleAssignments": [
                {"roleId": seller["id"], "scopeType": "branch", "branchId": branch["id"]},
            ],
        },
    )
    assert shared.status_code == 201, shared.text

    second = client.post(
        "/api/v1/backoffice/workspaces",
        headers={"X-Backoffice-Key": backoffice_key},
        json={
            "slug": f"second-{suffix}",
            "name": "Second Co",
            "defaultCurrency": "DOP",
            "timezone": "America/Santo_Domingo",
            "locale": "es-DO",
            "owner": {
                "email": f"owner-b-{suffix}@example.com",
                "displayName": "Owner B",
                "password": "OwnerB!password-not-secret",
            },
        },
    )
    assert second.status_code == 201, second.text
    second_id = second.json()["workspaceId"]
    options_b = client.get(
        f"/api/v1/backoffice/workspaces/{second_id}/member-options",
        headers={"X-Backoffice-Key": backoffice_key},
    ).json()
    seller_b = next(role for role in options_b["roles"] if role["code"] == "seller")
    branch_b = options_b["branches"][0]
    cross = client.post(
        "/api/v1/backoffice/users",
        headers={"X-Backoffice-Key": backoffice_key},
        json={
            "workspaceId": second_id,
            "displayName": "Shared User",
            "email": email,
            "roleAssignments": [
                {"roleId": seller_b["id"], "scopeType": "branch", "branchId": branch_b["id"]},
            ],
        },
    )
    assert cross.status_code == 201, cross.text
    assert cross.json()["membershipStatus"] == "suspended"
