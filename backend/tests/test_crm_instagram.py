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
def test_lead_name_and_instagram_survive_conversion_and_existing_customer_close(
    client: TestClient,
) -> None:
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
        },
    )
    assert lead.status_code == 201, lead.text
    assert lead.json()["instagramUrl"] == ig_url
    opportunity = client.post(
        f"/api/v1/crm/leads/{lead.json()['id']}/opportunity",
        headers={**headers, "Idempotency-Key": f"instagram-opportunity-{marker}"},
        json={"stage": "propuesta"},
    )
    assert opportunity.status_code == 201, opportunity.text
    current_lead = client.get(f"/api/v1/crm/leads/{lead.json()['id']}", headers=headers)
    assert current_lead.status_code == 200, current_lead.text
    renamed = client.patch(
        f"/api/v1/crm/leads/{lead.json()['id']}",
        headers=headers,
        json={"version": current_lead.json()["version"], "name": f"Despues {marker}"},
    )
    assert renamed.status_code == 200, renamed.text
    refreshed_opportunity = client.get(
        f"/api/v1/crm/opportunities/{opportunity.json()['id']}", headers=headers
    )
    assert refreshed_opportunity.json()["customerName"] == f"Despues {marker}"
    custom_name = f"Oportunidad especial {marker}"
    customized = client.patch(
        f"/api/v1/crm/opportunities/{opportunity.json()['id']}",
        headers=headers,
        json={"version": refreshed_opportunity.json()["version"], "customerName": custom_name},
    )
    assert customized.status_code == 200, customized.text
    renamed_again = client.patch(
        f"/api/v1/crm/leads/{lead.json()['id']}",
        headers=headers,
        json={"version": renamed.json()["version"], "name": f"Final {marker}"},
    )
    assert renamed_again.status_code == 200, renamed_again.text
    after_customization = client.get(
        f"/api/v1/crm/opportunities/{opportunity.json()['id']}", headers=headers
    )
    assert after_customization.json()["customerName"] == custom_name
    converted = client.post(
        f"/api/v1/crm/leads/{lead.json()['id']}/convert",
        headers={**headers, "Idempotency-Key": f"instagram-convert-{marker}"},
        json={"version": renamed_again.json()["version"]},
    )
    assert converted.status_code == 200, converted.text
    assert converted.json()["instagramUrl"] == ig_url
    customer = client.get(f"/api/v1/customers/{converted.json()['id']}", headers=headers)
    assert customer.json()["instagramUrl"] == ig_url
    converted_opportunity = client.get(
        f"/api/v1/crm/opportunities/{opportunity.json()['id']}", headers=headers
    )
    assert converted_opportunity.json()["customerName"] == custom_name

    existing = client.post(
        "/api/v1/customers",
        headers=headers,
        json={"displayName": f"Cliente existente {marker}", "branchIds": [str(branch_id)]},
    )
    assert existing.status_code == 201, existing.text
    another = client.post(
        "/api/v1/crm/leads",
        headers={**headers, "Idempotency-Key": f"instagram-existing-lead-{marker}"},
        json={"branchId": str(branch_id), "name": f"Otro {marker}", "instagramUrl": ig_url},
    )
    assert another.status_code == 201, another.text
    linked = client.post(
        f"/api/v1/crm/leads/{another.json()['id']}/opportunity",
        headers={**headers, "Idempotency-Key": f"instagram-existing-opportunity-{marker}"},
        json={"stage": "propuesta"},
    )
    assert linked.status_code == 201, linked.text
    closed = client.patch(
        f"/api/v1/crm/opportunities/{linked.json()['id']}",
        headers=headers,
        json={
            "version": linked.json()["version"],
            "customerId": existing.json()["id"],
            "stage": "cerrado",
        },
    )
    assert closed.status_code == 200, closed.text
    retained = client.get(f"/api/v1/customers/{existing.json()['id']}", headers=headers)
    assert retained.json()["instagramUrl"] == ig_url
    assert retained.json()["version"] == existing.json()["version"] + 1

    preferred_url = f"https://www.instagram.com/preferido_{marker}/"
    preferred = client.post(
        "/api/v1/customers",
        headers=headers,
        json={
            "displayName": f"Cliente con IG {marker}",
            "branchIds": [str(branch_id)],
            "instagramUrl": preferred_url,
        },
    )
    assert preferred.status_code == 201, preferred.text
    third_lead = client.post(
        "/api/v1/crm/leads",
        headers={**headers, "Idempotency-Key": f"instagram-third-lead-{marker}"},
        json={"branchId": str(branch_id), "name": f"Tercero {marker}", "instagramUrl": ig_url},
    )
    assert third_lead.status_code == 201, third_lead.text
    third_opportunity = client.post(
        f"/api/v1/crm/leads/{third_lead.json()['id']}/opportunity",
        headers={**headers, "Idempotency-Key": f"instagram-third-opportunity-{marker}"},
        json={"stage": "propuesta"},
    )
    assert third_opportunity.status_code == 201, third_opportunity.text
    closed_preferred = client.patch(
        f"/api/v1/crm/opportunities/{third_opportunity.json()['id']}",
        headers=headers,
        json={
            "version": third_opportunity.json()["version"],
            "customerId": preferred.json()["id"],
            "stage": "cerrado",
        },
    )
    assert closed_preferred.status_code == 200, closed_preferred.text
    preferred_after = client.get(f"/api/v1/customers/{preferred.json()['id']}", headers=headers)
    assert preferred_after.json()["instagramUrl"] == preferred_url
    assert preferred_after.json()["version"] == preferred.json()["version"]


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
