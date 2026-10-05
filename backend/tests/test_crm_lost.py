from uuid import UUID, uuid7

import pytest
from app.core.security import hash_password
from app.db.models import AuditEntry, Branch, CrmLead
from app.db.session import session_scope
from app.main import app
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from sqlalchemy import select

_PASSWORD = "crm-lost-test-password-not-a-secret"


def _owner(client: TestClient) -> tuple[dict[str, str], str]:
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
    return {"Authorization": f"Bearer {login.json()['accessToken']}"}, str(branch_id)


@pytest.mark.integration
def test_lost_lead_persists_and_reopening_preserves_audit() -> None:
    marker = uuid7().hex[-12:]
    with TestClient(app) as client:
        headers, branch_id = _owner(client)
        lead = client.post(
            "/api/v1/crm/leads",
            headers={**headers, "Idempotency-Key": f"lost-lead-{marker}"},
            json={"branchId": branch_id, "name": f"Prospecto {marker}", "status": "propuesta"},
        )
        assert lead.status_code == 201, lead.text
        lost = client.patch(
            f"/api/v1/crm/leads/{lead.json()['id']}",
            headers=headers,
            json={
                "version": lead.json()["version"],
                "status": "perdido",
                "lostReason": "Precio alto",
            },
        )
        assert lost.status_code == 200, lost.text
        assert lost.json()["lostReason"] == "Precio alto"
        assert lost.json()["pipelineClosedAt"] is not None
        assert (
            client.get(f"/api/v1/crm/leads/{lead.json()['id']}", headers=headers).json()["status"]
            == "perdido"
        )
        listing = client.get(
            "/api/v1/crm/leads",
            headers=headers,
            params={"status": "perdido", "page": 1, "pageSize": 50},
        )
        assert listing.status_code == 200, listing.text
        assert any(item["id"] == lead.json()["id"] for item in listing.json()["items"])

        reopened = client.patch(
            f"/api/v1/crm/leads/{lead.json()['id']}",
            headers=headers,
            json={"version": lost.json()["version"], "status": "negociacion"},
        )
        assert reopened.status_code == 200, reopened.text
        assert reopened.json()["status"] == "negociacion"
        assert reopened.json()["lostReason"] is None
        assert reopened.json()["pipelineClosedAt"] is None
        with session_scope() as session:
            saved_lead = session.get(CrmLead, UUID(lead.json()["id"]))
            assert saved_lead is not None
            assert saved_lead.status == "negociacion"
            audits = session.scalars(
                select(AuditEntry)
                .where(
                    AuditEntry.target_type == "crm_lead",
                    AuditEntry.target_id == UUID(lead.json()["id"]),
                    AuditEntry.action == "crm.lead.update",
                )
                .order_by(AuditEntry.occurred_at.desc())
            ).all()
            assert any(row.details.get("lostReason") == "Precio alto" for row in audits)
            assert any(
                row.details.get("previousLostReason") == "Precio alto"
                and row.details.get("previousStatus") == "perdido"
                and row.details.get("status") == "negociacion"
                for row in audits
            )

        stale = client.patch(
            f"/api/v1/crm/leads/{lead.json()['id']}",
            headers=headers,
            json={"version": lost.json()["version"], "status": "nuevo"},
        )
        assert stale.status_code == 409
        assert (
            client.patch(
                f"/api/v1/crm/leads/{lead.json()['id']}",
                json={
                    "version": reopened.json()["version"],
                    "status": "perdido",
                    "lostReason": "X",
                },
            ).status_code
            == 401
        )

        options = client.get("/api/v1/users/form-options", headers=headers).json()
        cashier_role = next(role for role in options["roles"] if role["code"] == "cashier")
        cashier_email = f"lost-cashier-{marker}@example.com"
        cashier_password = "Cashier!Lost-2026"
        created_user = client.post(
            "/api/v1/users",
            headers=headers,
            json={
                "displayName": "Consulta sin CRM",
                "email": cashier_email,
                "password": cashier_password,
                "roleAssignments": [
                    {"roleId": cashier_role["id"], "scopeType": "branch", "branchId": branch_id}
                ],
            },
        )
        assert created_user.status_code == 201, created_user.text
        cashier_login = client.post(
            "/api/v1/auth/login", json={"email": cashier_email, "password": cashier_password}
        )
        assert cashier_login.status_code == 200, cashier_login.text
        cashier_headers = {"Authorization": f"Bearer {cashier_login.json()['accessToken']}"}
        denied = client.patch(
            f"/api/v1/crm/leads/{lead.json()['id']}",
            headers=cashier_headers,
            json={"version": reopened.json()["version"], "status": "nuevo"},
        )
        assert denied.status_code == 403


@pytest.mark.integration
def test_reopening_does_not_change_a_closed_lead() -> None:
    marker = uuid7().hex[-12:]
    with TestClient(app) as client:
        headers, branch_id = _owner(client)
        lead = client.post(
            "/api/v1/crm/leads",
            headers={**headers, "Idempotency-Key": f"converted-lost-lead-{marker}"},
            json={"branchId": branch_id, "name": f"Convertido {marker}"},
        )
        assert lead.status_code == 201, lead.text
        current_lead = client.get(f"/api/v1/crm/leads/{lead.json()['id']}", headers=headers)
        converted = client.post(
            f"/api/v1/crm/leads/{lead.json()['id']}/convert",
            headers={**headers, "Idempotency-Key": f"converted-lost-convert-{marker}"},
            json={"version": current_lead.json()["version"]},
        )
        assert converted.status_code == 200, converted.text
        current_lead = client.get(f"/api/v1/crm/leads/{lead.json()['id']}", headers=headers).json()
        lost = client.patch(
            f"/api/v1/crm/leads/{lead.json()['id']}",
            headers=headers,
            json={
                "version": current_lead["version"],
                "status": "perdido",
                "lostReason": "Otro motivo",
            },
        )
        assert lost.status_code == 409


@pytest.mark.integration
def test_lost_lead_search_by_phone_and_name() -> None:
    marker = uuid7().hex[-12:]
    with TestClient(app) as client:
        headers, branch_id = _owner(client)
        phone = f"809-{marker[-7:]}"
        first = client.post(
            "/api/v1/crm/leads",
            headers={**headers, "Idempotency-Key": f"lost-search-1-{marker}"},
            json={
                "branchId": branch_id,
                "name": f"Cliente sin lead {marker}",
                "phone": phone,
                "status": "nuevo",
            },
        )
        assert first.status_code == 201, first.text
        client.patch(
            f"/api/v1/crm/leads/{first.json()['id']}",
            headers=headers,
            json={
                "version": first.json()["version"],
                "status": "perdido",
                "lostReason": "Sin presupuesto",
            },
        )
        second = client.post(
            "/api/v1/crm/leads",
            headers={**headers, "Idempotency-Key": f"lost-search-2-{marker}"},
            json={
                "branchId": branch_id,
                "company": f"Plan adicional {marker}",
                "status": "nuevo",
            },
        )
        assert second.status_code == 201, second.text
        client.patch(
            f"/api/v1/crm/leads/{second.json()['id']}",
            headers=headers,
            json={
                "version": second.json()["version"],
                "status": "perdido",
                "lostReason": "Sin presupuesto",
            },
        )
        for search in (phone, marker):
            first_page = client.get(
                "/api/v1/crm/leads",
                headers=headers,
                params={"status": "perdido", "search": search, "page": 1, "pageSize": 1},
            )
            second_page = client.get(
                "/api/v1/crm/leads",
                headers=headers,
                params={"status": "perdido", "search": search, "page": 2, "pageSize": 1},
            )
            assert first_page.status_code == 200, first_page.text
            assert second_page.status_code == 200, second_page.text
            assert first_page.json()["totalItems"] == 2
            assert second_page.json()["totalItems"] == 2
            assert {
                first_page.json()["items"][0]["id"],
                second_page.json()["items"][0]["id"],
            } == {first.json()["id"], second.json()["id"]}
