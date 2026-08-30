from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid7

import pytest
from app.core.security import hash_password
from app.db.session import session_scope
from app.schemas.hr import (
    CreateEmployeeDebtRequest,
    CreateHrDocumentRequest,
    CreateLeaveRequest,
    UpdateEmployeeHrProfileRequest,
)
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from pydantic import ValidationError

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "hr-owner-password-not-a-secret"


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


def test_hr_schemas_enforce_dates_money_and_document_rules() -> None:
    today = date.today()
    with pytest.raises(ValidationError, match="igual o posterior"):
        CreateLeaveRequest(
            startDate=today,
            endDate=today - timedelta(days=1),
            reason="Vacaciones",
        )
    with pytest.raises(ValidationError):
        CreateEmployeeDebtRequest(employeeId=uuid7(), concept="Adelanto", amount=Decimal("0"))
    with pytest.raises(ValidationError, match="sólo puede incluirse"):
        CreateHrDocumentRequest(
            employeeId=uuid7(),
            templateId="certificado",
            issueDate=today,
            includeSalary=True,
        )
    with pytest.raises(ValidationError, match="al menos un cambio"):
        UpdateEmployeeHrProfileRequest(version=1)


@pytest.mark.integration
def test_hr_profiles_leave_debts_documents_and_overview(client: TestClient) -> None:
    headers, session = _bootstrap_and_login(client)
    branch_id = session["visibleBranches"][0]["id"]
    user_id = session["userId"]
    suffix = uuid7().hex[-10:]

    employee_response = client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "employeeNumber": f"HR-{suffix}",
            "firstName": "Ada",
            "lastName": f"RRHH {suffix}",
            "position": "Analista RRHH",
            "department": "Recursos Humanos",
            "hireDate": "2025-01-10",
            "platformUserId": user_id,
            "branchIds": [branch_id],
        },
    )
    assert employee_response.status_code == 201, employee_response.text
    employee = employee_response.json()

    profiles = client.get("/api/v1/hr/profiles", headers=headers)
    assert profiles.status_code == 200, profiles.text
    profile = next(
        item for item in profiles.json()["items"] if item["employeeId"] == employee["id"]
    )
    assert profile["vacationDays"] == 0

    updated_profile = client.patch(
        f"/api/v1/hr/profiles/{employee['id']}",
        headers=headers,
        json={
            "version": profile["version"],
            "initialSalary": "30000.00",
            "salary": "35000.00",
            "vacationDays": 15,
            "bankName": "Banco de prueba",
            "bankAccountType": "ahorro",
        },
    )
    assert updated_profile.status_code == 200, updated_profile.text
    assert updated_profile.json()["salary"] == "35000.00"

    start = date.today() + timedelta(days=30)
    leave_response = client.post(
        "/api/v1/hr/leave-requests",
        headers=headers,
        json={
            "startDate": start.isoformat(),
            "endDate": (start + timedelta(days=4)).isoformat(),
            "reason": "Vacaciones familiares",
        },
    )
    assert leave_response.status_code == 201, leave_response.text
    leave = leave_response.json()
    own_balance = client.get("/api/v1/hr/leave-requests/me", headers=headers)
    assert own_balance.status_code == 200, own_balance.text
    assert own_balance.json()["availableDays"] == 15

    approved = client.post(
        f"/api/v1/hr/leave-requests/{leave['id']}/decision",
        headers=headers,
        json={"status": "aprobada", "version": leave["version"]},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "aprobada"
    own_balance = client.get("/api/v1/hr/leave-requests/me", headers=headers)
    assert own_balance.json()["usedDays"] == 5
    assert own_balance.json()["availableDays"] == 10

    review_queue = client.get(
        "/api/v1/hr/leave-requests",
        headers=headers,
        params={"employeeId": employee["id"], "status": "aprobada"},
    )
    assert review_queue.status_code == 200, review_queue.text
    assert {item["id"] for item in review_queue.json()["items"]} == {leave["id"]}

    cancellable_start = start + timedelta(days=10)
    cancellable = client.post(
        "/api/v1/hr/leave-requests",
        headers=headers,
        json={
            "startDate": cancellable_start.isoformat(),
            "endDate": (cancellable_start + timedelta(days=1)).isoformat(),
            "reason": "Trámite personal",
        },
    )
    assert cancellable.status_code == 201, cancellable.text
    cancelled = client.post(
        f"/api/v1/hr/leave-requests/{cancellable.json()['id']}/cancel",
        headers=headers,
        json={"version": cancellable.json()["version"]},
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelada"

    debt_headers = {**headers, "Idempotency-Key": f"debt-{suffix}"}
    debt_response = client.post(
        "/api/v1/hr/debts",
        headers=debt_headers,
        json={
            "employeeId": employee["id"],
            "concept": "Préstamo interno",
            "amount": "8000.00",
        },
    )
    assert debt_response.status_code == 201, debt_response.text
    debt = debt_response.json()
    repeated = client.post(
        "/api/v1/hr/debts",
        headers=debt_headers,
        json={
            "employeeId": employee["id"],
            "concept": "Préstamo interno",
            "amount": "8000.00",
        },
    )
    assert repeated.status_code == 201
    assert repeated.json()["id"] == debt["id"]

    payment = client.post(
        f"/api/v1/hr/debts/{debt['id']}/payments",
        headers={**headers, "Idempotency-Key": f"payment-{suffix}"},
        json={"amount": "3000.00", "paidOn": date.today().isoformat()},
    )
    assert payment.status_code == 201, payment.text
    assert payment.json()["status"] == "parcial"
    assert payment.json()["balance"] == "5000.00"
    overpayment = client.post(
        f"/api/v1/hr/debts/{debt['id']}/payments",
        headers={**headers, "Idempotency-Key": f"overpay-{suffix}"},
        json={"amount": "5000.01", "paidOn": date.today().isoformat()},
    )
    assert overpayment.status_code == 400
    assert overpayment.json()["parameter"] == "amount"

    debts = client.get(
        "/api/v1/hr/debts",
        headers=headers,
        params={"search": "Préstamo", "employeeId": employee["id"], "status": "parcial"},
    )
    assert debts.status_code == 200, debts.text
    assert {item["id"] for item in debts.json()["items"]} == {debt["id"]}
    debt_stats = client.get("/api/v1/hr/debts/stats", headers=headers)
    assert debt_stats.status_code == 200, debt_stats.text
    assert debt_stats.json()["pending"] == "5000.00"

    document = client.post(
        "/api/v1/hr/documents",
        headers={**headers, "Idempotency-Key": f"document-{suffix}"},
        json={
            "employeeId": employee["id"],
            "templateId": "bancaria",
            "issueDate": date.today().isoformat(),
            "includeSalary": True,
        },
    )
    assert document.status_code == 201, document.text
    assert document.json()["snapshot"]["salary"] == "35000.00"
    documents = client.get("/api/v1/hr/documents", headers=headers)
    assert document.json()["id"] in {item["id"] for item in documents.json()["items"]}
    filtered_documents = client.get(
        "/api/v1/hr/documents",
        headers=headers,
        params={"employeeId": employee["id"], "templateId": "bancaria"},
    )
    assert filtered_documents.status_code == 200, filtered_documents.text
    assert {item["id"] for item in filtered_documents.json()["items"]} == {document.json()["id"]}

    overview = client.get("/api/v1/hr/overview", headers=headers)
    assert overview.status_code == 200, overview.text
    assert overview.json()["totalEmployees"] >= 1
    assert overview.json()["approvedVacations"] >= 1
    assert overview.json()["debt"]["pending"] == "5000.00"
