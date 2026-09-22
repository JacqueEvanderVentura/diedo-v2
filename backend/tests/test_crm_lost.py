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
def test_lost_opportunity_persists_and_reopening_preserves_audit_and_lead() -> None:
    marker = uuid7().hex[-12:]
    with TestClient(app) as client:
        headers, branch_id = _owner(client)
        lead = client.post(
            "/api/v1/crm/leads",
            headers={**headers, "Idempotency-Key": f"lost-lead-{marker}"},
            json={"branchId": branch_id, "name": f"Prospecto {marker}"},
        )
        assert lead.status_code == 201, lead.text
        opportunity = client.post(
            f"/api/v1/crm/leads/{lead.json()['id']}/opportunity",
            headers={**headers, "Idempotency-Key": f"lost-opportunity-{marker}"},
            json={"stage": "propuesta"},
        )
        assert opportunity.status_code == 201, opportunity.text
        opportunity_id = opportunity.json()["id"]
        lead_status_before_loss = client.get(
            f"/api/v1/crm/leads/{lead.json()['id']}", headers=headers
        ).json()["status"]

        lost = client.patch(
            f"/api/v1/crm/opportunities/{opportunity_id}",
            headers=headers,
            json={
                "version": opportunity.json()["version"],
                "stage": "perdido",
                "lostReason": "Precio alto",
            },
        )
        assert lost.status_code == 200, lost.text
        assert lost.json()["lostReason"] == "Precio alto"
        assert lost.json()["closedAt"] is not None
        assert (
            client.get(f"/api/v1/crm/leads/{lead.json()['id']}", headers=headers).json()["status"]
            == lead_status_before_loss
        )
        listing = client.get(
            "/api/v1/crm/opportunities",
            headers=headers,
            params={"stage": "perdido", "page": 1, "pageSize": 1},
        )
        assert listing.status_code == 200, listing.text
        assert listing.json()["totalItems"] >= 1
        assert (
            client.get(f"/api/v1/crm/opportunities/{opportunity_id}", headers=headers).json()[
                "lostReason"
            ]
            == "Precio alto"
        )

        reopened = client.patch(
            f"/api/v1/crm/opportunities/{opportunity_id}",
            headers=headers,
            json={"version": lost.json()["version"], "stage": "negociacion"},
        )
        assert reopened.status_code == 200, reopened.text
        assert reopened.json()["stage"] == "negociacion"
        assert reopened.json()["lostReason"] is None
        assert reopened.json()["closedAt"] is None
        with session_scope() as session:
            saved_lead = session.get(CrmLead, UUID(lead.json()["id"]))
            assert saved_lead is not None
            assert saved_lead.status == "calificado"
            audits = session.scalars(
                select(AuditEntry)
                .where(
                    AuditEntry.target_type == "crm_opportunity",
                    AuditEntry.target_id == UUID(opportunity_id),
                    AuditEntry.action == "crm.opportunity.update",
                )
                .order_by(AuditEntry.occurred_at.desc())
            ).all()
            assert any(row.details.get("lostReason") == "Precio alto" for row in audits)
            assert any(
                row.details.get("previousLostReason") == "Precio alto"
                and row.details.get("previousStage") == "perdido"
                and row.details.get("stage") == "negociacion"
                for row in audits
            )

        stale = client.patch(
            f"/api/v1/crm/opportunities/{opportunity_id}",
            headers=headers,
            json={"version": lost.json()["version"], "stage": "nuevo"},
        )
        assert stale.status_code == 409
        assert (
            client.patch(
                f"/api/v1/crm/opportunities/{opportunity_id}",
                json={"version": reopened.json()["version"], "stage": "perdido", "lostReason": "X"},
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
            f"/api/v1/crm/opportunities/{opportunity_id}",
            headers=cashier_headers,
            json={"version": reopened.json()["version"], "stage": "nuevo"},
        )
        assert denied.status_code == 403


@pytest.mark.integration
def test_reopening_does_not_change_a_converted_lead() -> None:
    marker = uuid7().hex[-12:]
    with TestClient(app) as client:
        headers, branch_id = _owner(client)
        lead = client.post(
            "/api/v1/crm/leads",
            headers={**headers, "Idempotency-Key": f"converted-lost-lead-{marker}"},
            json={"branchId": branch_id, "name": f"Convertido {marker}"},
        )
        assert lead.status_code == 201, lead.text
        opportunity = client.post(
            f"/api/v1/crm/leads/{lead.json()['id']}/opportunity",
            headers={**headers, "Idempotency-Key": f"converted-lost-opp-{marker}"},
            json={"stage": "propuesta"},
        )
        assert opportunity.status_code == 201, opportunity.text
        current_lead = client.get(f"/api/v1/crm/leads/{lead.json()['id']}", headers=headers)
        converted = client.post(
            f"/api/v1/crm/leads/{lead.json()['id']}/convert",
            headers={**headers, "Idempotency-Key": f"converted-lost-convert-{marker}"},
            json={"version": current_lead.json()["version"]},
        )
        assert converted.status_code == 200, converted.text
        current_opportunity = client.get(
            f"/api/v1/crm/opportunities/{opportunity.json()['id']}", headers=headers
        ).json()
        lost = client.patch(
            f"/api/v1/crm/opportunities/{opportunity.json()['id']}",
            headers=headers,
            json={
                "version": current_opportunity["version"],
                "stage": "perdido",
                "lostReason": "Otro motivo",
            },
        )
        assert lost.status_code == 200, lost.text
        reopened = client.patch(
            f"/api/v1/crm/opportunities/{opportunity.json()['id']}",
            headers=headers,
            json={"version": lost.json()["version"], "stage": "propuesta"},
        )
        assert reopened.status_code == 200, reopened.text
        assert (
            client.get(f"/api/v1/crm/leads/{lead.json()['id']}", headers=headers).json()["status"]
            == "convertido"
        )


@pytest.mark.integration
def test_lost_standalone_opportunity_searches_customer_phone_and_name() -> None:
    marker = uuid7().hex[-12:]
    with TestClient(app) as client:
        headers, branch_id = _owner(client)
        phone = f"809-{marker[-7:]}"
        customer = client.post(
            "/api/v1/customers",
            headers=headers,
            json={
                "displayName": f"Cliente sin lead {marker}",
                "phone": phone,
                "branchIds": [branch_id],
            },
        )
        assert customer.status_code == 201, customer.text
        opportunity = client.post(
            "/api/v1/crm/opportunities",
            headers={**headers, "Idempotency-Key": f"lost-standalone-{marker}"},
            json={
                "branchId": branch_id,
                "customerId": customer.json()["id"],
                "title": f"Plan {marker}",
                "customerName": f"Cliente sin lead {marker}",
                "stage": "perdido",
                "lostReason": "Sin presupuesto",
            },
        )
        assert opportunity.status_code == 201, opportunity.text
        second = client.post(
            "/api/v1/crm/opportunities",
            headers={**headers, "Idempotency-Key": f"lost-standalone-second-{marker}"},
            json={
                "branchId": branch_id,
                "customerId": customer.json()["id"],
                "title": f"Plan adicional {marker}",
                "customerName": f"Cliente sin lead {marker}",
                "stage": "perdido",
                "lostReason": "Sin presupuesto",
            },
        )
        assert second.status_code == 201, second.text
        for search in (phone, marker):
            first_page = client.get(
                "/api/v1/crm/opportunities",
                headers=headers,
                params={"stage": "perdido", "search": search, "page": 1, "pageSize": 1},
            )
            second_page = client.get(
                "/api/v1/crm/opportunities",
                headers=headers,
                params={"stage": "perdido", "search": search, "page": 2, "pageSize": 1},
            )
            assert first_page.status_code == 200, first_page.text
            assert second_page.status_code == 200, second_page.text
            assert first_page.json()["totalItems"] == 2
            assert second_page.json()["totalItems"] == 2
            assert {
                first_page.json()["items"][0]["id"],
                second_page.json()["items"][0]["id"],
            } == {opportunity.json()["id"], second.json()["id"]}
        other_branch = client.get(
            "/api/v1/crm/opportunities",
            headers=headers,
            params={"stage": "perdido", "search": marker, "branchIds": str(uuid7())},
        )
        assert other_branch.status_code == 200, other_branch.text
        assert other_branch.json()["totalItems"] == 0
