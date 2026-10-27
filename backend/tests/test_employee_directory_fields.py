from pathlib import Path
from uuid import uuid7

import pytest
from app.api.deps import get_attachment_storage
from app.core.security import hash_password
from app.db.session import session_scope
from app.main import app
from app.schemas.master_data import CreateEmployeeRequest, UpdateEmployeeRequest
from app.services.attachment_storage import LocalAttachmentStorage
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from pydantic import ValidationError

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "directory-owner-password-not-a-secret"
_CASHIER_PASSWORD = "Cashier!password-not-a-secret"


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


def _create_cashier(client: TestClient, headers: dict[str, str], branch_id: str) -> dict[str, str]:
    options = client.get("/api/v1/users/form-options", headers=headers)
    assert options.status_code == 200, options.text
    roles = {role["code"]: role for role in options.json()["roles"]}
    matrix = client.get("/api/v1/permissions/matrix", headers=headers)
    assert matrix.status_code == 200, matrix.text
    body = matrix.json()
    cashier_role = next(role for role in body["roles"] if role["code"] == "cashier")
    permission_by_code = {
        permission["code"]: permission
        for module in body["modules"]
        for permission in module["permissions"]
    }
    current_ids = [
        permission["id"]
        for module in body["modules"]
        for permission in module["permissions"]
        if cashier_role["id"] in permission["grantedRoleIds"]
    ]
    employee_read_id = permission_by_code["employee.read"]["id"]
    if employee_read_id not in current_ids:
        granted = client.put(
            f"/api/v1/roles/{cashier_role['id']}/permissions",
            headers=headers,
            json={
                "permissionIds": [*current_ids, employee_read_id],
                "version": cashier_role["version"],
            },
        )
        assert granted.status_code == 200, granted.text
    email = f"cashier-{uuid7().hex[-10:]}@example.com"
    created = client.post(
        "/api/v1/users",
        headers=headers,
        json={
            "displayName": "Cajero Directorio",
            "email": email,
            "password": _CASHIER_PASSWORD,
            "roleAssignments": [
                {
                    "roleId": roles["cashier"]["id"],
                    "scopeType": "branch",
                    "branchId": branch_id,
                }
            ],
        },
    )
    assert created.status_code == 201, created.text
    login = client.post("/api/v1/auth/login", json={"email": email, "password": _CASHIER_PASSWORD})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['accessToken']}"}


def test_employee_document_schema_rejects_partial_pairs() -> None:
    branch_id = uuid7()
    with pytest.raises(ValidationError, match="juntos"):
        CreateEmployeeRequest(
            firstName="Ada",
            lastName="Lovelace",
            position="Analista",
            hireDate="2026-01-01",
            branchIds=[branch_id],
            documentType="cedula",
        )
    with pytest.raises(ValidationError, match="juntos"):
        UpdateEmployeeRequest(version=1, documentId="001-1234567-8")


@pytest.mark.integration
def test_employee_cedula_residence_salary_and_labor_contract(
    client: TestClient, tmp_path: Path
) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = session["visibleBranches"][0]["id"]
    suffix = uuid7().hex[-10:]
    cedula = f"402{uuid7().int % 10**8:08d}"
    cedula_display = f"{cedula[:3]}-{cedula[3:10]}-{cedula[10]}"
    pdf = b"%PDF-1.4 labor contract"

    created = client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "employeeNumber": f"DIR-{suffix}",
            "firstName": "Camila",
            "lastName": f"Directorio {suffix}",
            "position": "Especialista",
            "hireDate": "2026-03-01",
            "branchIds": [branch_id],
            "documentType": "cedula",
            "documentId": cedula_display,
        },
    )
    assert created.status_code == 201, created.text
    employee = created.json()
    assert employee["documentType"] == "cedula"
    assert employee["documentId"] == cedula_display
    assert "salary" not in employee
    assert "residenceLocation" not in employee

    blank_document = client.patch(
        f"/api/v1/employees/{employee['id']}",
        headers=headers,
        json={"version": employee["version"], "documentType": None, "documentId": None},
    )
    assert blank_document.status_code == 200, blank_document.text
    assert blank_document.json()["documentId"] is None
    employee = blank_document.json()

    restored = client.patch(
        f"/api/v1/employees/{employee['id']}",
        headers=headers,
        json={
            "version": employee["version"],
            "documentType": "cedula",
            "documentId": cedula,
        },
    )
    assert restored.status_code == 200, restored.text
    employee = restored.json()
    assert employee["documentId"] == cedula_display

    invalid = client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "employeeNumber": f"INV-{suffix}",
            "firstName": "Invalida",
            "lastName": suffix,
            "position": "Especialista",
            "hireDate": "2026-03-01",
            "branchIds": [branch_id],
            "documentType": "cedula",
            "documentId": "0011234",
        },
    )
    assert invalid.status_code == 400

    duplicate = client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "employeeNumber": f"DUP-{suffix}",
            "firstName": "Duplicada",
            "lastName": suffix,
            "position": "Especialista",
            "hireDate": "2026-03-01",
            "branchIds": [branch_id],
            "documentType": "cedula",
            "documentId": cedula_display,
        },
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["parameter"] == "documentId"

    profiles = client.get("/api/v1/hr/profiles", headers=headers)
    assert profiles.status_code == 200, profiles.text
    profile = next(
        item for item in profiles.json()["items"] if item["employeeId"] == employee["id"]
    )
    updated_profile = client.patch(
        f"/api/v1/hr/profiles/{employee['id']}",
        headers=headers,
        json={
            "version": profile["version"],
            "salary": "42000.00",
            "residenceLocation": "Santo Domingo, DN",
        },
    )
    assert updated_profile.status_code == 200, updated_profile.text
    body = updated_profile.json()
    assert body["salary"] == "42000.00"
    assert body["initialSalary"] == "42000.00"
    assert body["residenceLocation"] == "Santo Domingo, DN"

    storage = LocalAttachmentStorage(tmp_path / "attachments")
    app.dependency_overrides[get_attachment_storage] = lambda: storage
    try:
        labor = client.post(
            f"/api/v1/employees/{employee['id']}/attachments",
            headers=headers,
            files={"file": ("contrato.pdf", pdf, "application/pdf")},
            data={"classification": "labor_contract"},
        )
        assert labor.status_code == 201, labor.text
        labor_id = labor.json()["id"]
        listed = client.get(f"/api/v1/employees/{employee['id']}/attachments", headers=headers)
        assert listed.status_code == 200
        assert any(item["id"] == labor_id for item in listed.json())
        detail = client.get(f"/api/v1/employees/{employee['id']}", headers=headers)
        assert detail.json()["attachmentCount"] >= 1

        cashier_headers = _create_cashier(client, headers, str(branch_id))
        cashier_list = client.get(
            f"/api/v1/employees/{employee['id']}/attachments",
            headers=cashier_headers,
        )
        assert cashier_list.status_code == 200, cashier_list.text
        assert cashier_list.json() == []
        cashier_detail = client.get(f"/api/v1/employees/{employee['id']}", headers=cashier_headers)
        assert cashier_detail.status_code == 200, cashier_detail.text
        assert cashier_detail.json()["attachmentCount"] == 0
        cashier_download = client.get(
            f"/api/v1/employees/{employee['id']}/attachments/{labor_id}/content",
            headers=cashier_headers,
        )
        assert cashier_download.status_code == 404
        cashier_upload = client.post(
            f"/api/v1/employees/{employee['id']}/attachments",
            headers=cashier_headers,
            files={"file": ("contrato.pdf", pdf, "application/pdf")},
            data={"classification": "labor_contract"},
        )
        assert cashier_upload.status_code == 403
        cashier_profile = client.patch(
            f"/api/v1/hr/profiles/{employee['id']}",
            headers=cashier_headers,
            json={"version": 1, "residenceLocation": "Oculto"},
        )
        assert cashier_profile.status_code == 403
    finally:
        app.dependency_overrides.pop(get_attachment_storage, None)
