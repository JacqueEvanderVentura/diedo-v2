from datetime import UTC, datetime, timedelta

import pytest
from app.core.security import hash_password
from app.db.session import session_scope
from app.services.authorization import PermissionGrant
from app.services.crm import CrmService
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient

_PASSWORD = "crm-test-password-not-a-secret"


@pytest.mark.integration
def test_list_leads_filters_by_updated_at() -> None:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session, hash_password(_PASSWORD))
        membership_id = summary.membership_id
        grant = PermissionGrant(
            permission_code="crm.read",
            workspace_id=summary.workspace_id,
            membership_id=membership_id,
            allowed_legal_entity_ids=None,
            allowed_branch_ids=None,
        )
        service = CrmService(session)
        all_leads = service.list_leads(
            grant,
            branch_id=None,
            status=None,
            source=None,
            search=None,
            updated_after=None,
            updated_before=None,
            sort="updated_at",
            sort_dir="desc",
            page=1,
            page_size=5,
        )
        assert all_leads.total_items >= 1
        newest = all_leads.items[0].lead.updated_at
        window_start = newest - timedelta(days=1)
        window_end = newest + timedelta(days=1)
        filtered = service.list_leads(
            grant,
            branch_id=None,
            status=None,
            source=None,
            search=None,
            updated_after=window_start,
            updated_before=window_end,
            sort="updated_at",
            sort_dir="desc",
            page=1,
            page_size=50,
        )
        assert filtered.total_items >= 1
        assert all(
            window_start <= record.lead.updated_at <= window_end for record in filtered.items
        )


@pytest.mark.integration
def test_lead_status_change_creates_stage_activity(client: TestClient) -> None:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session, hash_password(_PASSWORD))
        branch_id = str(summary.branch_id)
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@erp.dev", "password": _PASSWORD},
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    suffix = datetime.now(UTC).strftime("%H%M%S%f")

    created = client.post(
        "/api/v1/crm/leads",
        headers={**headers, "Idempotency-Key": f"stage-act-{suffix}"},
        json={
            "branchId": branch_id,
            "name": f"Stage {suffix}",
            "company": f"Co {suffix}",
            "status": "nuevo",
        },
    )
    assert created.status_code == 201, created.text
    lead = created.json()

    updated = client.patch(
        f"/api/v1/crm/leads/{lead['id']}",
        headers=headers,
        json={"version": lead["version"], "status": "propuesta"},
    )
    assert updated.status_code == 200, updated.text

    activities = client.get(
        "/api/v1/crm/activities",
        headers=headers,
        params={"leadId": lead["id"], "pageSize": 50},
    )
    assert activities.status_code == 200, activities.text
    titles = [item["title"] for item in activities.json()["items"]]
    assert "Movido de Nuevo a Interesado" in titles
