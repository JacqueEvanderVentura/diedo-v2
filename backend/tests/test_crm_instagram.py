from pathlib import Path
from uuid import uuid7

import pytest
from alembic import command
from alembic.config import Config
from app.core.security import hash_password
from app.db.models import Branch
from app.db.session import dispose_engine, session_scope
from app.main import app
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from sqlalchemy import select

_PASSWORD = "crm-instagram-test-password-not-a-secret"


@pytest.fixture
def client():
    with TestClient(app, raise_server_exceptions=True) as test_client:
        yield test_client


@pytest.mark.integration
def test_lead_instagram_survives_conversion(client: TestClient) -> None:
    marker = uuid7().hex[-12:]
    with session_scope() as session:
        seeded = bootstrap_local_foundation(session, hash_password(_PASSWORD))
        branch_id = session.scalar(
            select(Branch.id).where(
                Branch.workspace_id == seeded.workspace_id, Branch.status == "active"
            )
        )
        assert branch_id is not None
    login = client.post(
        "/api/v1/auth/login", json={"email": "owner@erp.dev", "password": _PASSWORD}
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    ig_url = f"https://www.instagram.com/helios_{marker}/"

    lead = client.post(
        "/api/v1/crm/leads",
        headers={**headers, "Idempotency-Key": f"instagram-lead-{marker}"},
        json={
            "branchId": str(branch_id),
            "name": f"Antes {marker}",
            "website": "https://empresa.example",
            "instagramUrl": ig_url,
            "status": "propuesta",
        },
    )
    assert lead.status_code == 201, lead.text
    assert lead.json()["instagramUrl"] == ig_url
    renamed = client.patch(
        f"/api/v1/crm/leads/{lead.json()['id']}",
        headers=headers,
        json={"version": lead.json()["version"], "name": f"Despues {marker}"},
    )
    assert renamed.status_code == 200, renamed.text
    converted = client.post(
        f"/api/v1/crm/leads/{lead.json()['id']}/convert",
        headers={**headers, "Idempotency-Key": f"instagram-convert-{marker}"},
        json={"version": renamed.json()["version"]},
    )
    assert converted.status_code == 200, converted.text
    assert converted.json()["instagramUrl"] == ig_url
    customer = client.get(f"/api/v1/customers/{converted.json()['id']}", headers=headers)
    assert customer.json()["instagramUrl"] == ig_url


@pytest.mark.integration
def test_migration_recovers_instagram_website_for_converted_customer(client: TestClient) -> None:
    marker = uuid7().hex[-12:]
    with session_scope() as session:
        seeded = bootstrap_local_foundation(session, hash_password(_PASSWORD))
        branch_id = session.scalar(
            select(Branch.id).where(
                Branch.workspace_id == seeded.workspace_id, Branch.status == "active"
            )
        )
        assert branch_id is not None
    login = client.post(
        "/api/v1/auth/login", json={"email": "owner@erp.dev", "password": _PASSWORD}
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    ig_url = f"https://www.instagram.com/legado_{marker}/"
    lead = client.post(
        "/api/v1/crm/leads",
        headers={**headers, "Idempotency-Key": f"legacy-lead-{marker}"},
        json={"branchId": str(branch_id), "name": f"Legado {marker}", "website": ig_url},
    )
    assert lead.status_code == 201, lead.text
    converted = client.post(
        f"/api/v1/crm/leads/{lead.json()['id']}/convert",
        headers={**headers, "Idempotency-Key": f"legacy-convert-{marker}"},
        json={"version": lead.json()["version"]},
    )
    assert converted.status_code == 200, converted.text

    migration_config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    dispose_engine()
    command.downgrade(migration_config, "20260921_0043")
    command.upgrade(migration_config, "head")
    dispose_engine()

    restored_lead = client.get(f"/api/v1/crm/leads/{lead.json()['id']}", headers=headers)
    restored_customer = client.get(f"/api/v1/customers/{converted.json()['id']}", headers=headers)
    assert restored_lead.status_code == 200, restored_lead.text
    assert restored_customer.status_code == 200, restored_customer.text
    assert restored_lead.json()["website"] == ig_url
    assert restored_lead.json()["instagramUrl"] == ig_url
    assert restored_customer.json()["instagramUrl"] == ig_url
