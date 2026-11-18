from uuid import uuid7

import pytest
from app.core.security import hash_password
from app.db.session import session_scope
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient

_PDF = b"%PDF-1.4\nportal-task-test\n%%EOF"
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


@pytest.mark.integration
def test_portal_task_template_accept_flow(client: TestClient) -> None:
    headers, me = _bootstrap_and_login(client)
    branch_id = me["visibleBranches"][0]["id"]
    listed = client.get("/api/v1/branches", headers=headers)
    assert listed.status_code == 200, listed.text
    branch_row = next(row for row in listed.json() if row["id"] == branch_id)
    enabled = client.patch(
        f"/api/v1/branches/{branch_id}",
        headers=headers,
        json={"onlineBookingSelectable": True, "version": branch_row["version"]},
    )
    assert enabled.status_code == 200, enabled.text
    document_id = f"PT{uuid7().hex[:12]}"

    created = client.post(
        "/api/v1/portal-tasks/templates",
        headers=headers,
        data={
            "title": "Consentimiento informado",
            "checkboxLabel": "He leído y acepto",
            "isDefaultForAll": "true",
        },
        files={"file": ("consent.pdf", _PDF, "application/pdf")},
    )
    assert created.status_code == 201, created.text
    template_id = created.json()["id"]

    register = client.post(
        f"/api/v1/public/portal/branches/{branch_id}/register",
        json={
            "documentType": "pasaporte",
            "documentId": document_id,
            "displayName": "Cliente Portal",
            "wantsInvoice": False,
            "wantsContact": False,
        },
    )
    assert register.status_code == 200, register.text
    customer_id = register.json()["customerId"]
    doc_params = {"documentType": "pasaporte", "documentId": document_id}

    listed = client.get(f"/api/v1/public/portal/branches/{branch_id}/tasks", params=doc_params)
    assert listed.status_code == 200, listed.text
    items = listed.json()["items"]
    row = next(item for item in items if item["id"] == template_id)
    assert row["acceptedAt"] is None

    pdf = client.get(
        f"/api/v1/public/portal/branches/{branch_id}/tasks/{template_id}/pdf",
        params=doc_params,
    )
    assert pdf.status_code == 200, pdf.text
    assert pdf.content[:4] == b"%PDF"

    accept = client.post(
        f"/api/v1/public/portal/branches/{branch_id}/tasks/{template_id}/accept",
        params=doc_params,
        json={"accepted": True},
    )
    assert accept.status_code == 200, accept.text
    accepted_at = accept.json()["acceptedAt"]
    assert accepted_at

    again = client.post(
        f"/api/v1/public/portal/branches/{branch_id}/tasks/{template_id}/accept",
        params=doc_params,
        json={"accepted": True},
    )
    assert again.status_code == 200, again.text
    assert again.json()["acceptedAt"] == accepted_at

    reject = client.post(
        f"/api/v1/public/portal/branches/{branch_id}/tasks/{template_id}/accept",
        params=doc_params,
        json={"accepted": False},
    )
    assert reject.status_code == 409, reject.text

    staff_view = client.get(f"/api/v1/customers/{customer_id}/portal-tasks", headers=headers)
    assert staff_view.status_code == 200, staff_view.text
    staff_rows = staff_view.json()["items"]
    staff_row = next(item for item in staff_rows if item["templateId"] == template_id)
    assert staff_row["acceptedAt"] == accepted_at

    unknown = client.get(
        f"/api/v1/public/portal/branches/{branch_id}/tasks/{uuid7()}/pdf",
        params=doc_params,
    )
    assert unknown.status_code == 404, unknown.text
