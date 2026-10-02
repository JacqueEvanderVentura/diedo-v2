"""Tenant self-service workspace operational data reset."""

from __future__ import annotations

import pytest
from app.config import settings
from app.core.security import hash_password
from app.db.models import Customer, PaymentMethod, WorkspaceMembership
from app.db.session import session_scope
from app.services.local_bootstrap import (
    LOCAL_BACKOFFICE_OPERATOR_EMAIL,
    bootstrap_local_foundation,
)
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from tests.test_backoffice_management import member, workspace

_OPERATOR_PASSWORD = "Backoffice!Reset-Test-1"


def _login(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    body = response.json()
    return {"Authorization": f"Bearer {body['accessToken']}"}


@pytest.fixture
def operator_headers(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    monkeypatch.setattr(settings, "local_bootstrap_admin_password", None)
    monkeypatch.setattr(settings, "local_bootstrap_backoffice_password", None)
    monkeypatch.setattr(settings, "backoffice_api_key", None)
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OPERATOR_PASSWORD))
    return _login(client, LOCAL_BACKOFFICE_OPERATOR_EMAIL, _OPERATOR_PASSWORD)


@pytest.mark.integration
def test_tenant_reset_happy_path(
    client: TestClient,
    operator_headers: dict[str, str],
) -> None:
    company = workspace(client, operator_headers)
    slug = company["slug"]
    workspace_id = company["workspaceId"]
    owner_headers = _login(client, company["owner"]["email"], _OPERATOR_PASSWORD)
    branch_id = company["branches"][0]["id"]

    customer = client.post(
        "/api/v1/customers",
        headers=owner_headers,
        json={
            "customerType": "person",
            "displayName": "Cliente Tenant",
            "firstName": "Cliente",
            "lastName": "Tenant",
            "email": "tenant-reset@example.com",
            "branchIds": [branch_id],
        },
    )
    assert customer.status_code == 201, customer.text

    wrong = client.post(
        "/api/v1/workspace/data-reset",
        headers=owner_headers,
        json={"confirmationSlug": "wrong-slug"},
    )
    assert wrong.status_code == 409

    reset = client.post(
        "/api/v1/workspace/data-reset",
        headers=owner_headers,
        json={"confirmationSlug": slug},
    )
    assert reset.status_code == 200, reset.text
    body = reset.json()
    assert body["workspaceId"] == workspace_id
    assert body["deletedCounts"]["customers"] >= 1

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

    me = client.get("/api/v1/auth/me", headers=owner_headers)
    assert me.status_code == 401

    owner_headers_fresh = _login(client, company["owner"]["email"], _OPERATOR_PASSWORD)
    idempotent = client.post(
        "/api/v1/workspace/data-reset",
        headers=owner_headers_fresh,
        json={"confirmationSlug": slug},
    )
    assert idempotent.status_code == 200


@pytest.mark.integration
def test_tenant_reset_rejects_non_admin(
    client: TestClient,
    operator_headers: dict[str, str],
) -> None:
    company = workspace(client, operator_headers)
    seller = member(client, operator_headers, company, admin=False)
    seller_headers = _login(client, seller["email"], _OPERATOR_PASSWORD)
    response = client.post(
        "/api/v1/workspace/data-reset",
        headers=seller_headers,
        json={"confirmationSlug": company["slug"]},
    )
    assert response.status_code == 403
