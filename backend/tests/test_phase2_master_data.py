from datetime import date, timedelta
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from uuid import uuid7

import pytest
from app.api.deps import get_attachment_storage
from app.core.security import hash_password
from app.db.session import session_scope
from app.main import app
from app.schemas.master_data import (
    CreateCustomerRequest,
    CreateEmployeeRequest,
    UpdateCustomerRequest,
    UpdateEmployeeRequest,
    WeeklySchedule,
    WorkBlock,
)
from app.services.attachment_storage import (
    AttachmentContentMismatchError,
    AttachmentTooLargeError,
    LocalAttachmentStorage,
)
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from pydantic import ValidationError

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


def test_weekly_schedule_rejects_overlapping_blocks() -> None:
    with pytest.raises(ValidationError, match="no pueden solaparse"):
        WeeklySchedule.model_validate(
            {"mon": [{"start": "08:00", "end": "10:00"}, {"start": "09:30", "end": "11:00"}]}
        )


def test_phase2_request_schemas_normalize_and_reject_ambiguous_changes() -> None:
    branch_id = uuid7()
    supervisor_id = uuid7()

    with pytest.raises(ValidationError, match="posterior"):
        WorkBlock(start="10:00", end="09:00")
    with pytest.raises(ValidationError, match="No repitas sucursales"):
        CreateCustomerRequest(displayName="Cliente", branchIds=[branch_id, branch_id])
    customer = CreateCustomerRequest(
        displayName="  Cliente   Normalizado  ",
        firstName="  María  ",
        phone="   ",
        branchIds=[branch_id],
    )
    assert customer.display_name == "Cliente Normalizado"
    assert customer.first_name == "María"
    assert customer.phone is None
    with pytest.raises(ValidationError, match="al menos un cambio"):
        UpdateCustomerRequest(version=1)
    with pytest.raises(ValidationError, match="no puede ser nulo"):
        UpdateCustomerRequest(version=1, displayName=None)
    with pytest.raises(ValidationError, match="No repitas sucursales"):
        UpdateCustomerRequest(version=1, branchIds=[branch_id, branch_id])
    assert UpdateCustomerRequest(version=1, firstName="  Ana  ").first_name == "Ana"

    with pytest.raises(ValidationError, match="No repitas identificadores"):
        CreateEmployeeRequest(
            employeeNumber=" emp-9 ",
            firstName="Ada",
            lastName="Lovelace",
            position="Analista",
            hireDate=date.today(),
            branchIds=[branch_id],
            supervisorIds=[supervisor_id, supervisor_id],
        )
    employee = CreateEmployeeRequest(
        employeeNumber=" emp-9 ",
        firstName=" Ada ",
        lastName=" Lovelace ",
        position=" Analista ",
        department="   ",
        branchIds=[branch_id],
        hireDate=date.today(),
    )
    assert employee.employee_number == "EMP-9"
    assert employee.department is None
    with pytest.raises(ValidationError, match="al menos un cambio"):
        UpdateEmployeeRequest(version=1)
    with pytest.raises(ValidationError, match="no puede ser nulo"):
        UpdateEmployeeRequest(version=1, position=None)
    with pytest.raises(ValidationError, match="No repitas identificadores"):
        UpdateEmployeeRequest(version=1, branchIds=[branch_id, branch_id])
    updated_employee = UpdateEmployeeRequest(
        version=1,
        employeeNumber=" emp-10 ",
        firstName=" Grace ",
        department="   ",
    )
    assert updated_employee.employee_number == "EMP-10"
    assert updated_employee.first_name == "Grace"
    assert updated_employee.department is None


def test_local_attachment_storage_streams_checksums_and_confines_paths(tmp_path: Path) -> None:
    storage = LocalAttachmentStorage(tmp_path)
    content = b"%PDF-1.4\nphase-2\n%%EOF"
    blob = storage.save(
        BytesIO(content),
        storage_key="workspace/customer/record.pdf",
        content_type="application/pdf",
        max_bytes=1024,
    )

    assert blob.size_bytes == len(content)
    assert blob.checksum_sha256 == sha256(content).hexdigest()
    assert storage.path_for(blob.storage_key).read_bytes() == content

    with pytest.raises(AttachmentTooLargeError):
        storage.save(
            BytesIO(content),
            storage_key="workspace/customer/large.pdf",
            content_type="application/pdf",
            max_bytes=4,
        )
    with pytest.raises(AttachmentContentMismatchError):
        storage.save(
            BytesIO(b"not-a-pdf"),
            storage_key="workspace/customer/fake.pdf",
            content_type="application/pdf",
            max_bytes=1024,
        )
    with pytest.raises(ValueError, match="Invalid attachment storage key"):
        storage.path_for("../../outside.pdf")


@pytest.mark.integration
def test_phase2_customers_employees_schedules_and_attachments(
    client: TestClient, tmp_path: Path
) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = session["visibleBranches"][0]["id"]
    suffix = uuid7().hex[-12:]

    user_options = client.get("/api/v1/users/form-options", headers=headers)
    assert user_options.status_code == 200
    seller_role_id = next(
        role["id"] for role in user_options.json()["roles"] if role["code"] == "seller"
    )
    platform_user = client.post(
        "/api/v1/users",
        headers=headers,
        json={
            "displayName": f"Usuario Empleado {suffix}",
            "email": f"employee.user.{suffix}@example.com",
            "password": "Phase!two-user-password-not-a-secret",
            "roleAssignments": [
                {
                    "roleId": seller_role_id,
                    "scopeType": "branch",
                    "branchId": branch_id,
                }
            ],
        },
    )
    assert platform_user.status_code == 201, platform_user.text
    platform_user_id = platform_user.json()["userId"]

    customer_response = client.post(
        "/api/v1/customers",
        headers=headers,
        json={
            "customerType": "person",
            "displayName": f"María Cliente {suffix}",
            "firstName": "María",
            "lastName": f"Cliente {suffix}",
            "email": f"maria.{suffix}@example.com",
            "phone": f"+1 809 555 {suffix[:4]}",
            "branchIds": [branch_id],
        },
    )
    assert customer_response.status_code == 201, customer_response.text
    customer = customer_response.json()
    assert customer["version"] == 1
    assert customer["branches"][0]["id"] == branch_id

    by_phone = client.get(
        "/api/v1/customers",
        headers=headers,
        params={"phone": customer["phone"], "branchId": branch_id},
    )
    assert by_phone.status_code == 200, by_phone.text
    assert [item["id"] for item in by_phone.json()["items"]] == [customer["id"]]

    changed = client.patch(
        f"/api/v1/customers/{customer['id']}",
        headers=headers,
        json={"displayName": f"Cliente Actualizada {suffix}", "version": customer["version"]},
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["version"] == 2
    stale = client.patch(
        f"/api/v1/customers/{customer['id']}",
        headers=headers,
        json={"phone": "+1 809 000 0000", "version": customer["version"]},
    )
    assert stale.status_code == 409
    assert stale.json()["parameter"] == "version"

    storage = LocalAttachmentStorage(tmp_path / "attachments")
    app.dependency_overrides[get_attachment_storage] = lambda: storage
    pdf = b"%PDF-1.4\nphase-2-api\n%%EOF"
    try:
        attachment_response = client.post(
            f"/api/v1/customers/{customer['id']}/attachments",
            headers=headers,
            files={"file": ("../private.pdf", pdf, "application/pdf")},
            data={
                "classification": "customer_document",
                "retentionUntil": str(date.today() + timedelta(days=30)),
            },
        )
        assert attachment_response.status_code == 201, attachment_response.text
        attachment = attachment_response.json()
        assert attachment["originalFilename"] == "private.pdf"
        assert attachment["checksumSha256"] == sha256(pdf).hexdigest()

        listed = client.get(f"/api/v1/customers/{customer['id']}/attachments", headers=headers)
        assert listed.status_code == 200
        assert [item["id"] for item in listed.json()] == [attachment["id"]]
        downloaded = client.get(
            f"/api/v1/customers/{customer['id']}/attachments/{attachment['id']}/content",
            headers=headers,
        )
        assert downloaded.status_code == 200
        assert downloaded.content == pdf
        retained_delete = client.delete(
            f"/api/v1/customers/{customer['id']}/attachments/{attachment['id']}",
            headers=headers,
        )
        assert retained_delete.status_code == 400
        assert retained_delete.json()["parameter"] == "retentionUntil"

        deletable_response = client.post(
            f"/api/v1/customers/{customer['id']}/attachments",
            headers=headers,
            files={"file": ("deletable.pdf", pdf, "application/pdf")},
        )
        assert deletable_response.status_code == 201, deletable_response.text
        deletable = deletable_response.json()
        deleted = client.delete(
            f"/api/v1/customers/{customer['id']}/attachments/{deletable['id']}",
            headers=headers,
        )
        assert deleted.status_code == 204
        deleted_download = client.get(
            f"/api/v1/customers/{customer['id']}/attachments/{deletable['id']}/content",
            headers=headers,
        )
        assert deleted_download.status_code == 404
        assert len(list((tmp_path / "attachments").rglob("*.pdf"))) == 1

        bad_mime = client.post(
            f"/api/v1/customers/{customer['id']}/attachments",
            headers=headers,
            files={"file": ("fake.pdf", b"plain text", "application/pdf")},
        )
        assert bad_mime.status_code == 400
        assert bad_mime.json()["parameter"] == "file"
        expired = client.post(
            f"/api/v1/customers/{customer['id']}/attachments",
            headers=headers,
            files={"file": ("expired.pdf", pdf, "application/pdf")},
            data={"retentionUntil": str(date.today() - timedelta(days=1))},
        )
        assert expired.status_code == 400
        assert expired.json()["parameter"] == "retentionUntil"
        wrong_classification = client.post(
            f"/api/v1/customers/{customer['id']}/attachments",
            headers=headers,
            files={"file": ("employee.pdf", pdf, "application/pdf")},
            data={"classification": "employee_document"},
        )
        assert wrong_classification.status_code == 400
        unsupported = client.post(
            f"/api/v1/customers/{customer['id']}/attachments",
            headers=headers,
            files={"file": ("notes.txt", b"notes", "text/plain")},
        )
        assert unsupported.status_code == 400
        missing_attachment = client.get(
            f"/api/v1/customers/{customer['id']}/attachments/{uuid7()}/content",
            headers=headers,
        )
        assert missing_attachment.status_code == 404
        missing_owner = client.get(f"/api/v1/customers/{uuid7()}/attachments", headers=headers)
        assert missing_owner.status_code == 404
    finally:
        app.dependency_overrides.pop(get_attachment_storage, None)

    supervisor_response = client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "employeeNumber": f"SUP-{suffix}",
            "firstName": "Ada",
            "lastName": f"Supervisora {suffix}",
            "position": "Supervisora",
            "department": "Operaciones",
            "hireDate": "2025-01-15",
            "platformUserId": platform_user_id,
            "branchIds": [branch_id],
            "schedule": {"mon": [{"start": "08:00", "end": "12:00"}]},
        },
    )
    assert supervisor_response.status_code == 201, supervisor_response.text
    supervisor = supervisor_response.json()

    employee_response = client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "employeeNumber": f"EMP-{suffix}",
            "firstName": "Grace",
            "lastName": f"Empleado {suffix}",
            "email": f"grace.{suffix}@example.com",
            "position": "Especialista",
            "department": "Operaciones",
            "hireDate": "2026-02-01",
            "branchIds": [branch_id],
            "supervisorIds": [supervisor["id"]],
        },
    )
    assert employee_response.status_code == 201, employee_response.text
    employee = employee_response.json()
    assert employee["supervisorIds"] == [supervisor["id"]]
    assert employee["schedule"]["version"] == 1

    employee_detail = client.get(f"/api/v1/employees/{employee['id']}", headers=headers)
    assert employee_detail.status_code == 200
    employee_schedule = client.get(f"/api/v1/employees/{employee['id']}/schedule", headers=headers)
    assert employee_schedule.status_code == 200
    employees_page = client.get(
        "/api/v1/employees",
        headers=headers,
        params={
            "search": "Grace",
            "status": "active",
            "branchId": branch_id,
            "department": "Operaciones",
            "pageSize": 1,
            "sortBy": "updatedAt",
            "sortDirection": "desc",
        },
    )
    assert employees_page.status_code == 200, employees_page.text
    assert employees_page.json()["totalItems"] >= 1
    assert employees_page.json()["items"][0]["id"] == employee["id"]

    employee_changed = client.patch(
        f"/api/v1/employees/{employee['id']}",
        headers=headers,
        json={
            "version": employee["version"],
            "firstName": "Grace Editada",
            "phone": "+1 809 555 8888",
            "branchIds": [branch_id],
            "supervisorIds": [],
        },
    )
    assert employee_changed.status_code == 200, employee_changed.text
    employee = employee_changed.json()
    assert employee["version"] == 2
    assert employee["supervisorIds"] == []
    self_supervision = client.patch(
        f"/api/v1/employees/{employee['id']}",
        headers=headers,
        json={"version": employee["version"], "supervisorIds": [employee["id"]]},
    )
    assert self_supervision.status_code == 409
    stale_employee = client.patch(
        f"/api/v1/employees/{employee['id']}",
        headers=headers,
        json={"version": 1, "position": "Otro cargo"},
    )
    assert stale_employee.status_code == 409

    duplicate_link = client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "employeeNumber": f"DUP-{suffix}",
            "firstName": "Linus",
            "lastName": f"Duplicado {suffix}",
            "position": "Especialista",
            "hireDate": "2026-02-02",
            "platformUserId": platform_user_id,
            "branchIds": [branch_id],
        },
    )
    assert duplicate_link.status_code == 409
    assert duplicate_link.json()["parameter"] == "platformUserId"

    duplicate_number = client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "employeeNumber": supervisor["employeeNumber"],
            "firstName": "Otro",
            "lastName": "Número",
            "position": "Especialista",
            "hireDate": "2026-02-02",
            "branchIds": [branch_id],
        },
    )
    assert duplicate_number.status_code == 409
    missing_user = client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "firstName": "Usuario",
            "lastName": "Ausente",
            "position": "Especialista",
            "hireDate": "2026-02-02",
            "platformUserId": str(uuid7()),
            "branchIds": [branch_id],
        },
    )
    assert missing_user.status_code == 404

    app.dependency_overrides[get_attachment_storage] = lambda: storage
    try:
        employee_attachment = client.post(
            f"/api/v1/employees/{employee['id']}/attachments",
            headers=headers,
            files={"file": ("employee.pdf", pdf, "application/pdf")},
            data={"classification": "employee_document"},
        )
        assert employee_attachment.status_code == 201, employee_attachment.text
        attachment_id = employee_attachment.json()["id"]
        employee_attachments = client.get(
            f"/api/v1/employees/{employee['id']}/attachments", headers=headers
        )
        assert [item["id"] for item in employee_attachments.json()] == [attachment_id]
        employee_download = client.get(
            f"/api/v1/employees/{employee['id']}/attachments/{attachment_id}/content",
            headers=headers,
        )
        assert employee_download.content == pdf
        wrong_employee_classification = client.post(
            f"/api/v1/employees/{employee['id']}/attachments",
            headers=headers,
            files={"file": ("customer.pdf", pdf, "application/pdf")},
            data={"classification": "customer_document"},
        )
        assert wrong_employee_classification.status_code == 400
    finally:
        app.dependency_overrides.pop(get_attachment_storage, None)

    schedule_response = client.put(
        f"/api/v1/employees/{employee['id']}/schedule",
        headers=headers,
        json={
            "timezone": "America/La_Paz",
            "week": {
                "mon": [{"start": "09:00", "end": "13:00"}],
                "wed": [{"start": "14:00", "end": "18:00"}],
            },
            "version": employee["schedule"]["version"],
        },
    )
    assert schedule_response.status_code == 200, schedule_response.text
    assert schedule_response.json()["version"] == 2
    assert schedule_response.json()["week"]["wed"] == [{"start": "14:00", "end": "18:00"}]
    stale_schedule = client.put(
        f"/api/v1/employees/{employee['id']}/schedule",
        headers=headers,
        json={
            "timezone": "America/La_Paz",
            "week": {},
            "version": 1,
        },
    )
    assert stale_schedule.status_code == 409

    timeline = client.get(f"/api/v1/customers/{customer['id']}/timeline", headers=headers)
    assert timeline.status_code == 200
    assert {item["eventType"] for item in timeline.json()["items"]} >= {
        "master_data.customer.create",
        "master_data.customer.update",
    }

    archived = client.patch(
        f"/api/v1/customers/{customer['id']}",
        headers=headers,
        json={"status": "archived", "version": changed.json()["version"]},
    )
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"
    default_list = client.get(
        "/api/v1/customers", headers=headers, params={"email": customer["email"]}
    )
    assert default_list.status_code == 200
    assert default_list.json()["items"] == []
    archived_list = client.get(
        "/api/v1/customers",
        headers=headers,
        params={"email": customer["email"], "status": "archived"},
    )
    assert [item["id"] for item in archived_list.json()["items"]] == [customer["id"]]
