"""Backoffice workspace operational data reset."""

from __future__ import annotations

import pytest
from app.config import settings
from app.core.security import hash_password
from app.db.models import (
    Customer,
    PaymentMethod,
    Workspace,
    WorkspaceMembership,
)
from app.db.session import session_scope
from app.services.local_bootstrap import (
    LOCAL_BACKOFFICE_OPERATOR_EMAIL,
    bootstrap_local_foundation,
)
from app.services.platform_workspace import PLATFORM_WORKSPACE_SLUG
from fastapi.testclient import TestClient
from sqlalchemy import func, select

_OPERATOR_PASSWORD = "Backoffice!Reset-Test-1"


def _login(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    body = response.json()
    return {"Authorization": f"Bearer {body['accessToken']}"}


def _provision_workspace(client: TestClient, headers: dict[str, str], slug: str) -> str:
    create = client.post(
        "/api/v1/backoffice/workspaces",
        headers=headers,
        json={
            "slug": slug,
            "name": "Reset Demo Co",
            "defaultCurrency": "DOP",
            "timezone": "America/Santo_Domingo",
            "locale": "es-DO",
            "taxDefaultRate": "18.00",
            "owner": {
                "email": f"owner-{slug}@example.com",
                "displayName": "Owner Reset",
                "password": _OPERATOR_PASSWORD,
            },
        },
    )
    assert create.status_code == 201, create.text
    return create.json()["workspaceId"]


@pytest.fixture
def operator_headers(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    monkeypatch.setattr(settings, "local_bootstrap_admin_password", None)
    monkeypatch.setattr(settings, "local_bootstrap_backoffice_password", None)
    monkeypatch.setattr(settings, "backoffice_api_key", None)
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OPERATOR_PASSWORD))
    return _login(client, LOCAL_BACKOFFICE_OPERATOR_EMAIL, _OPERATOR_PASSWORD)


@pytest.mark.integration
def test_reset_workspace_data_happy_path(
    client: TestClient,
    operator_headers: dict[str, str],
) -> None:
    slug = "reset-happy"
    workspace_id = _provision_workspace(client, operator_headers, slug)
    owner_headers = _login(client, f"owner-{slug}@example.com", _OPERATOR_PASSWORD)

    detail_before = client.get(
        f"/api/v1/backoffice/workspaces/{workspace_id}",
        headers=operator_headers,
    )
    assert detail_before.status_code == 200
    branch_id = detail_before.json()["branches"][0]["id"]

    customer = client.post(
        "/api/v1/customers",
        headers=owner_headers,
        json={
            "customerType": "person",
            "displayName": "Ana Cliente",
            "firstName": "Ana",
            "lastName": "Cliente",
            "email": "ana@example.com",
            "branchIds": [branch_id],
        },
    )
    assert customer.status_code == 201, customer.text

    wrong_slug = client.post(
        f"/api/v1/backoffice/workspaces/{workspace_id}/data-reset",
        headers=operator_headers,
        json={"confirmationSlug": "wrong-slug"},
    )
    assert wrong_slug.status_code == 409

    with session_scope() as session:
        assert session.scalar(select(func.count()).select_from(Customer)) >= 1

    reset = client.post(
        f"/api/v1/backoffice/workspaces/{workspace_id}/data-reset",
        headers=operator_headers,
        json={"confirmationSlug": slug},
    )
    assert reset.status_code == 200, reset.text
    body = reset.json()
    assert body["workspaceId"] == workspace_id
    assert body["deletedCounts"]["customers"] >= 1
    assert body["storageCleanup"] in {"complete", "partial", "pending"}

    with session_scope() as session:
        customers = session.scalar(
            select(func.count())
            .select_from(Customer)
            .where(Customer.workspace_id == workspace_id)
        )
        memberships = session.scalar(
            select(func.count())
            .select_from(WorkspaceMembership)
            .where(WorkspaceMembership.workspace_id == workspace_id)
        )
        system_pms = session.scalar(
            select(func.count())
            .select_from(PaymentMethod)
            .where(
                PaymentMethod.workspace_id == workspace_id,
                PaymentMethod.is_system.is_(True),
            )
        )
        assert customers == 0
        assert memberships == 1
        assert system_pms == 5

    detail = client.get(
        f"/api/v1/backoffice/workspaces/{workspace_id}",
        headers=operator_headers,
    )
    assert detail.status_code == 200
    assert detail.json()["slug"] == slug
    assert len(detail.json()["branches"]) >= 1

    idempotent = client.post(
        f"/api/v1/backoffice/workspaces/{workspace_id}/data-reset",
        headers=operator_headers,
        json={"confirmationSlug": slug},
    )
    assert idempotent.status_code == 200


@pytest.mark.integration
def test_reset_rejects_platform_workspace(
    client: TestClient,
    operator_headers: dict[str, str],
) -> None:
    with session_scope() as session:
        platform_id = session.scalar(
            select(Workspace.id).where(Workspace.slug == PLATFORM_WORKSPACE_SLUG)
        )
    assert platform_id is not None
    response = client.post(
        f"/api/v1/backoffice/workspaces/{platform_id}/data-reset",
        headers=operator_headers,
        json={"confirmationSlug": PLATFORM_WORKSPACE_SLUG},
    )
    assert response.status_code == 404


@pytest.mark.integration
def test_reset_rejects_tenant_user(
    client: TestClient,
    operator_headers: dict[str, str],
) -> None:
    slug = "reset-tenant-deny"
    workspace_id = _provision_workspace(client, operator_headers, slug)
    tenant_headers = _login(client, f"owner-{slug}@example.com", _OPERATOR_PASSWORD)
    response = client.post(
        f"/api/v1/backoffice/workspaces/{workspace_id}/data-reset",
        headers=tenant_headers,
        json={"confirmationSlug": slug},
    )
    assert response.status_code in {401, 403, 503}
