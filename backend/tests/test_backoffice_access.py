import pytest
from app.api.routers import backoffice
from app.config import settings
from app.core.security import hash_password
from app.db.models import PlatformUser, Workspace
from app.db.session import session_scope
from app.services.local_bootstrap import bootstrap_local_foundation
from app.services.platform_workspace import (
    LOCAL_BACKOFFICE_OPERATOR_EMAIL,
    PLATFORM_WORKSPACE_SLUG,
)
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import select

_BACKOFFICE_KEY = "test-backoffice-key-with-at-least-32-characters"
_OPERATOR_PASSWORD = "local-test-password-not-a-secret"
_OWNER_EMAIL = "owner@erp.dev"


def _authorization(tokens: dict[str, object]) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['accessToken']}"}


def _login(client: TestClient, email: str, password: str) -> dict[str, object]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.integration
def test_bootstrap_installs_platform_operator_and_workspace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "local_bootstrap_admin_password", None)
    monkeypatch.setattr(settings, "local_bootstrap_backoffice_password", None)
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OPERATOR_PASSWORD))
        platform_workspace = session.scalar(
            select(Workspace).where(Workspace.slug == PLATFORM_WORKSPACE_SLUG)
        )
        operator = session.scalar(
            select(PlatformUser).where(
                PlatformUser.normalized_email == LOCAL_BACKOFFICE_OPERATOR_EMAIL
            )
        )

    assert platform_workspace is not None
    assert platform_workspace.name == "Helios Platform"
    assert operator is not None
    assert operator.is_platform_operator is True


@pytest.mark.integration
def test_auth_me_exposes_platform_operator_flag(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "local_bootstrap_admin_password", None)
    monkeypatch.setattr(settings, "local_bootstrap_backoffice_password", None)
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OPERATOR_PASSWORD))

    owner_tokens = _login(client, _OWNER_EMAIL, _OPERATOR_PASSWORD)
    owner_me = client.get("/api/v1/auth/me", headers=_authorization(owner_tokens))
    assert owner_me.status_code == 200
    assert owner_me.json()["isPlatformOperator"] is False

    operator_tokens = _login(client, LOCAL_BACKOFFICE_OPERATOR_EMAIL, _OPERATOR_PASSWORD)
    operator_me = client.get("/api/v1/auth/me", headers=_authorization(operator_tokens))
    assert operator_me.status_code == 200
    assert operator_me.json()["isPlatformOperator"] is True


@pytest.mark.integration
def test_backoffice_context_accepts_operator_jwt_without_api_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(backoffice.settings, "backoffice_api_key", None)
    monkeypatch.setattr(settings, "local_bootstrap_admin_password", None)
    monkeypatch.setattr(settings, "local_bootstrap_backoffice_password", None)
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OPERATOR_PASSWORD))

    operator_tokens = _login(client, LOCAL_BACKOFFICE_OPERATOR_EMAIL, _OPERATOR_PASSWORD)
    response = client.get(
        "/api/v1/backoffice/context",
        headers=_authorization(operator_tokens),
    )

    assert response.status_code == 200
    assert response.json() == {"ready": True}


@pytest.mark.integration
def test_backoffice_context_rejects_tenant_user_without_api_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(backoffice.settings, "backoffice_api_key", None)
    monkeypatch.setattr(settings, "local_bootstrap_admin_password", None)
    monkeypatch.setattr(settings, "local_bootstrap_backoffice_password", None)
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OPERATOR_PASSWORD))

    owner_tokens = _login(client, _OWNER_EMAIL, _OPERATOR_PASSWORD)
    response = client.get(
        "/api/v1/backoffice/context",
        headers=_authorization(owner_tokens),
    )

    assert response.status_code == 503


@pytest.mark.integration
def test_backoffice_workspace_lifecycle(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "local_bootstrap_admin_password", None)
    monkeypatch.setattr(settings, "local_bootstrap_backoffice_password", None)
    monkeypatch.setattr(settings, "backoffice_api_key", None)
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OPERATOR_PASSWORD))

    operator_tokens = _login(client, LOCAL_BACKOFFICE_OPERATOR_EMAIL, _OPERATOR_PASSWORD)
    headers = _authorization(operator_tokens)

    list_before = client.get("/api/v1/backoffice/workspaces", headers=headers)
    assert list_before.status_code == 200
    assert any(item["slug"] == "local-erp" for item in list_before.json()["items"])
    assert all(item["slug"] != PLATFORM_WORKSPACE_SLUG for item in list_before.json()["items"])

    suffix = "acme-demo"
    create = client.post(
        "/api/v1/backoffice/workspaces",
        headers=headers,
        json={
            "slug": suffix,
            "name": "Acme Demo",
            "defaultCurrency": "DOP",
            "timezone": "America/Santo_Domingo",
            "locale": "es-DO",
            "taxDefaultRate": "18.00",
            "owner": {
                "email": f"owner-{suffix}@example.com",
                "displayName": "Owner Acme",
                "password": _OPERATOR_PASSWORD,
            },
        },
    )
    assert create.status_code == 201, create.text
    workspace_id = create.json()["workspaceId"]

    detail = client.get(f"/api/v1/backoffice/workspaces/{workspace_id}", headers=headers)
    assert detail.status_code == 200
    body = detail.json()
    assert body["slug"] == suffix
    assert body["owner"]["email"] == f"owner-{suffix}@example.com"
    assert len(body["branches"]) == 1
    assert body["branches"][0]["name"] == "Principal"

    owner_login = client.post(
        "/api/v1/auth/login",
        json={"email": f"owner-{suffix}@example.com", "password": _OPERATOR_PASSWORD},
    )
    assert owner_login.status_code == 200

    suspended = client.patch(
        f"/api/v1/backoffice/workspaces/{workspace_id}",
        headers=headers,
        json={"version": body["version"], "status": "suspended"},
    )
    assert suspended.status_code == 200
    assert suspended.json()["status"] == "suspended"

    blocked = client.post(
        "/api/v1/auth/login",
        json={"email": f"owner-{suffix}@example.com", "password": _OPERATOR_PASSWORD},
    )
    assert blocked.status_code == 401


@pytest.mark.integration
def test_basico_plan_limits_enabled_modules(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "local_bootstrap_admin_password", None)
    monkeypatch.setattr(settings, "local_bootstrap_backoffice_password", None)
    monkeypatch.setattr(settings, "backoffice_api_key", None)
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OPERATOR_PASSWORD))

    headers = _authorization(_login(client, LOCAL_BACKOFFICE_OPERATOR_EMAIL, _OPERATOR_PASSWORD))
    slug = "basico-only"
    created = client.post(
        "/api/v1/backoffice/workspaces",
        headers=headers,
        json={
            "slug": slug,
            "name": "Basico Only",
            "defaultCurrency": "DOP",
            "timezone": "America/Santo_Domingo",
            "locale": "es-DO",
            "planCode": "basico",
            "owner": {
                "email": "owner-basico@example.com",
                "displayName": "Owner Basico",
                "password": _OPERATOR_PASSWORD,
            },
        },
    )
    assert created.status_code == 201, created.text
    enabled = set(created.json()["enabledModules"])
    assert "crm" in enabled
    assert "finance" not in enabled
    assert "hr" not in enabled


@pytest.mark.integration
def test_backoffice_user_register_and_disable(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "local_bootstrap_admin_password", None)
    monkeypatch.setattr(settings, "local_bootstrap_backoffice_password", None)
    monkeypatch.setattr(settings, "backoffice_api_key", None)
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OPERATOR_PASSWORD))

    headers = _authorization(_login(client, LOCAL_BACKOFFICE_OPERATOR_EMAIL, _OPERATOR_PASSWORD))
    overview = client.get("/api/v1/backoffice/overview", headers=headers)
    assert overview.status_code == 200, overview.text
    assert overview.json()["activeWorkspaces"] >= 1

    suffix = "user-co"
    created = client.post(
        "/api/v1/backoffice/workspaces",
        headers=headers,
        json={
            "slug": suffix,
            "name": "User Co",
            "defaultCurrency": "DOP",
            "timezone": "America/Santo_Domingo",
            "locale": "es-DO",
            "owner": {
                "email": f"owner-{suffix}@example.com",
                "displayName": "Owner User Co",
                "password": _OPERATOR_PASSWORD,
            },
        },
    )
    assert created.status_code == 201, created.text
    workspace_id = created.json()["workspaceId"]
    member_email = f"staff-{suffix}@example.com"
    registered = client.post(
        "/api/v1/backoffice/users",
        headers=headers,
        json={
            "workspaceId": workspace_id,
            "email": member_email,
            "displayName": "Staff User",
            "password": _OPERATOR_PASSWORD,
            "roleCode": "seller",
        },
    )
    assert registered.status_code == 201, registered.text
    user_id = registered.json()["userId"]
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": member_email, "password": _OPERATOR_PASSWORD},
        ).status_code
        == 200
    )

    disabled = client.patch(
        f"/api/v1/backoffice/users/{user_id}",
        headers=headers,
        json={"version": registered.json()["version"], "status": "disabled"},
    )
    assert disabled.status_code == 200, disabled.text
    blocked = client.post(
        "/api/v1/auth/login",
        json={"email": member_email, "password": _OPERATOR_PASSWORD},
    )
    assert blocked.status_code == 401


@pytest.mark.integration
def test_backoffice_context_still_accepts_api_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(backoffice.settings, "backoffice_api_key", SecretStr(_BACKOFFICE_KEY))
    response = client.get(
        "/api/v1/backoffice/context",
        headers={"X-Backoffice-Key": _BACKOFFICE_KEY},
    )

    assert response.status_code == 200
    assert response.json() == {"ready": True}
