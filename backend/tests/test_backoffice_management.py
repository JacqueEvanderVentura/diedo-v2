from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid7

import pytest
from app.config import settings
from app.core.security import hash_password
from app.db.models import PlatformUser, SubscriptionPlan, WorkspaceMembership
from app.db.session import session_scope
from app.main import app
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from pydantic import SecretStr

pytestmark = pytest.mark.integration
PASSWORD = "Backoffice-test!password-2026"
BASE = "/api/v1/backoffice"


def login(client, email):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


@pytest.fixture
def operator(client, monkeypatch):
    monkeypatch.setattr(settings, "local_bootstrap_admin_password", None)
    monkeypatch.setattr(settings, "local_bootstrap_backoffice_password", None)
    monkeypatch.setattr(settings, "backoffice_api_key", None)
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(PASSWORD))
    return login(client, "backoffice@erp.dev")


def workspace(client, operator, *, email=None):
    suffix = uuid7().hex
    owner = {"email": email or f"owner-{suffix}@example.com", "displayName": "Test Owner"}
    if email is None:
        owner["password"] = PASSWORD
    response = client.post(
        f"{BASE}/workspaces",
        headers=operator,
        json={
            "slug": f"bo-{suffix}",
            "name": f"Backoffice {suffix}",
            "defaultCurrency": "DOP",
            "timezone": "America/Santo_Domingo",
            "locale": "es-DO",
            "owner": owner,
        },
    )
    assert response.status_code == 201, response.text
    return client.get(
        f"{BASE}/workspaces/{response.json()['workspaceId']}", headers=operator
    ).json()


def member(client, operator, company, *, email=None, admin=False):
    wid = company["workspaceId"]
    options = client.get(f"{BASE}/workspaces/{wid}/member-options", headers=operator).json()
    code = "workspace_admin" if admin else "seller"
    role_id = next(role["id"] for role in options["roles"] if role["code"] == code)
    assignment = {"roleId": role_id, "scopeType": "workspace" if admin else "branch"}
    if not admin:
        assignment["branchId"] = options["branches"][0]["id"]
    payload = {
        "workspaceId": wid,
        "displayName": "Backoffice Member",
        "email": email or f"member-{uuid7().hex}@example.com",
        "roleAssignments": [assignment],
    }
    if email is None:
        payload["password"] = PASSWORD
    response = client.post(f"{BASE}/users", headers=operator, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_member_pagination_aliases_and_global_metrics(client, operator):
    company = workspace(client, operator)
    other = workspace(client, operator)
    shared = member(client, operator, company)
    member(client, operator, other, email=shared["email"])
    with session_scope() as session:
        for i in range(505):
            user_id = uuid7()
            user = PlatformUser(
                id=user_id,
                external_subject=f"bo-test:{user_id}",
                email=f"page-{user_id}@example.com",
                normalized_email=f"page-{user_id}@example.com",
                display_name=f"Paging {i:02}",
                status="active",
            )
            session.add(user)
            session.flush()
            session.add(
                WorkspaceMembership(
                    workspace_id=UUID(company["workspaceId"]),
                    platform_user_id=user_id,
                    status="active",
                    is_default=True,
                )
            )
    wid = company["workspaceId"]
    result = client.get(
        f"{BASE}/users", headers=operator, params={"workspaceId": wid, "pageSize": 10, "page": 2}
    )
    assert result.status_code == 200
    body = result.json()
    assert body["totalItems"] == 507 and body["totalPages"] == 51
    assert len(body["items"]) == 10
    assert {item["workspaceId"] for item in body["items"]} == {wid}
    legacy = client.get(
        f"{BASE}/users", headers=operator, params={"workspace_id": wid, "page_size": 10, "page": 2}
    )
    assert legacy.json() == body
    assert (
        client.get(
            f"{BASE}/users",
            headers=operator,
            params={"workspaceId": wid, "workspace_id": other["workspaceId"]},
        ).status_code
        == 400
    )
    assert (
        client.get(
            f"{BASE}/users", headers=operator, params={"pageSize": 10, "page_size": 11}
        ).status_code
        == 400
    )
    assert client.get(f"{BASE}/users?pageSize=101", headers=operator).status_code == 400
    members = client.get(
        f"{BASE}/workspaces/{wid}/members?page=51&pageSize=10", headers=operator
    ).json()
    assert members["totalItems"] == 507 and len(members["items"]) == 7
    identities = client.get(
        f"{BASE}/users", headers=operator, params={"search": shared["email"]}
    ).json()
    assert identities["totalItems"] == 2 and identities["totalUsers"] == 1


def test_existing_identity_and_membership_lifecycle(client, operator):
    company = workspace(client, operator)
    other = workspace(client, operator, email=company["owner"]["email"])
    staff = member(client, operator, company)
    second = member(client, operator, other, email=staff["email"])
    with TestClient(app) as staff_client:
        first_token = login(staff_client, staff["email"])
        switched = staff_client.post(
            "/api/v1/auth/switch-workspace",
            headers=first_token,
            json={"workspaceId": other["workspaceId"]},
        )
        assert switched.status_code == 200
        second_token = {"Authorization": f"Bearer {switched.json()['accessToken']}"}
        endpoint = f"{BASE}/workspaces/{company['workspaceId']}/members/{staff['membershipId']}"
        suspended = client.patch(
            endpoint,
            headers=operator,
            json={"version": staff["membershipVersion"], "status": "suspended"},
        )
        assert suspended.status_code == 200, suspended.text
        assert staff_client.get("/api/v1/auth/me", headers=second_token).status_code == 200
        assert (
            client.patch(
                endpoint,
                headers=operator,
                json={"version": staff["membershipVersion"], "status": "active"},
            ).status_code
            == 409
        )
        disabled = client.patch(
            f"{BASE}/users/{staff['userId']}",
            headers=operator,
            json={"version": staff["version"], "status": "disabled"},
        )
        assert disabled.status_code == 200, disabled.text
        assert staff_client.get("/api/v1/auth/me", headers=second_token).status_code == 401
        assert staff_client.post("/api/v1/auth/refresh").status_code == 401
        enabled = client.patch(
            f"{BASE}/users/{staff['userId']}",
            headers=operator,
            json={"version": disabled.json()["version"], "status": "active"},
        )
        assert enabled.status_code == 200
        current = client.get(endpoint, headers=operator).json()
        assert current["membershipStatus"] == "suspended"
        assert (
            client.patch(
                endpoint,
                headers=operator,
                json={"version": current["membershipVersion"], "status": "active"},
            ).status_code
            == 200
        )
        assert login(staff_client, second["email"])
    duplicate = client.post(
        f"{BASE}/users",
        headers=operator,
        json={
            "workspaceId": company["workspaceId"],
            "email": staff["email"],
            "displayName": "Existing",
        },
    )
    assert duplicate.status_code == 409 and "ya pertenece" in duplicate.json()["message"]
    existing_with_password = client.post(
        f"{BASE}/users",
        headers=operator,
        json={
            "workspaceId": company["workspaceId"],
            "email": other["owner"]["email"],
            "displayName": "Existing",
            "password": PASSWORD,
        },
    )
    assert existing_with_password.status_code == 409


def test_last_admin_cross_workspace_scopes_and_operator_exclusion(client, operator):
    company = workspace(client, operator)
    other = workspace(client, operator)
    wid = company["workspaceId"]
    owner = client.get(f"{BASE}/workspaces/{wid}/members", headers=operator).json()["items"][0]
    path = f"{BASE}/workspaces/{wid}/members/{owner['membershipId']}"
    assert (
        client.patch(
            path,
            headers=operator,
            json={"version": owner["membershipVersion"], "status": "suspended"},
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"{BASE}/users/{owner['userId']}",
            headers=operator,
            json={"version": owner["version"], "status": "disabled"},
        ).status_code
        == 409
    )
    staff = member(client, operator, company)
    foreign = member(client, operator, other)
    wrong_scope = {
        "roleId": staff["roleAssignments"][0]["roleId"],
        "scopeType": "branch",
        "branchId": foreign["roleAssignments"][0]["branchId"],
    }
    assert (
        client.patch(
            f"{BASE}/workspaces/{wid}/members/{staff['membershipId']}",
            headers=operator,
            json={"version": staff["membershipVersion"], "roleAssignments": [wrong_scope]},
        ).status_code
        == 404
    )
    assert (
        client.get(
            f"{BASE}/workspaces/{wid}/members/{foreign['membershipId']}", headers=operator
        ).status_code
        == 404
    )
    request = {
        "slug": f"operator-{uuid7().hex}",
        "name": "Operator Owner",
        "defaultCurrency": "DOP",
        "timezone": "UTC",
        "locale": "es-DO",
        "owner": {"email": "backoffice@erp.dev", "displayName": "Operator"},
    }
    assert client.post(f"{BASE}/workspaces", headers=operator, json=request).status_code == 400
    owner_header = login(client, company["owner"]["email"])
    assert client.get(f"{BASE}/audit", headers=owner_header).status_code != 200
    assert client.get(f"{BASE}/workspaces/{wid}/member-options").status_code != 200


def test_concurrent_last_admin_removal_keeps_one_admin(client, operator):
    company = workspace(client, operator)
    second = member(client, operator, company, admin=True)
    wid = company["workspaceId"]
    owner = next(
        item
        for item in client.get(f"{BASE}/workspaces/{wid}/members", headers=operator).json()["items"]
        if item["userId"] == company["owner"]["userId"]
    )

    def suspend(item):
        with TestClient(app) as request_client:
            return request_client.patch(
                f"{BASE}/workspaces/{wid}/members/{item['membershipId']}",
                headers=operator,
                json={"version": item["membershipVersion"], "status": "suspended"},
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(suspend, [owner, second]))
    assert sorted(statuses) == [200, 409]


def test_subscription_access_dates_plan_and_audit(client, operator, monkeypatch):
    company = workspace(client, operator)
    wid = company["workspaceId"]
    path = f"{BASE}/workspaces/{wid}"
    with TestClient(app) as owner_client:
        owner_token = login(owner_client, company["owner"]["email"])
        assert (
            owner_client.get("/api/v1/catalog/categories", headers=owner_token).status_code == 200
        )
        end = datetime.now(UTC) - timedelta(days=1)
        payload = {
            "version": company["subscription"]["version"],
            "status": "active",
            "startedAt": (end - timedelta(days=30)).isoformat(),
            "endsAt": end.isoformat(),
            "notes": "Regression test",
        }
        expired = client.patch(f"{path}/subscription", headers=operator, json=payload)
        assert expired.status_code == 200, expired.text
        data = expired.json()
        assert data["subscription"]["effectiveStatus"] == "expired"
        assert set(data["enabledModules"]) == {"foundation", "iam"}
        assert data["configuredModules"] == company["configuredModules"]
        assert data["planCustomized"] == company["planCustomized"]
        me = owner_client.get("/api/v1/auth/me", headers=owner_token)
        assert me.json()["subscriptionStatus"] == "expired"
        assert (
            owner_client.get("/api/v1/catalog/categories", headers=owner_token).status_code == 403
        )
        refresh = owner_client.post("/api/v1/auth/refresh")
        assert refresh.status_code == 200
        refreshed = {"Authorization": f"Bearer {refresh.json()['accessToken']}"}
        assert owner_client.get("/api/v1/catalog/categories", headers=refreshed).status_code == 403
        assert (
            client.patch(f"{path}/subscription", headers=operator, json=payload).status_code == 409
        )
        changed_plan = client.patch(
            path, headers=operator, json={"version": data["version"], "planCode": "pro"}
        )
        assert changed_plan.status_code == 200, changed_plan.text
        assert datetime.fromisoformat(
            changed_plan.json()["subscription"]["endsAt"]
        ) == datetime.fromisoformat(data["subscription"]["endsAt"])
        renewed = client.patch(
            f"{path}/subscription",
            headers=operator,
            json={
                **payload,
                "version": changed_plan.json()["subscription"]["version"],
                "endsAt": None,
            },
        )
        assert renewed.status_code == 200
        assert owner_client.get("/api/v1/catalog/categories", headers=refreshed).status_code == 200
    audit = client.get(f"{BASE}/audit", headers=operator, params={"workspaceId": wid}).json()
    assert audit["totalItems"] >= 4
    assert all(
        item["actorPlatformUserId"] and item["actorType"] == "operator" for item in audit["items"]
    )
    assert PASSWORD not in str(audit)
    assert (
        client.patch(
            f"{path}/subscription",
            headers=operator,
            json={**payload, "endsAt": "2000-01-01T00:00:00Z"},
        ).status_code
        == 400
    )
    key = "test-backoffice-automation-key-12345678"
    monkeypatch.setattr(settings, "backoffice_api_key", SecretStr(key))
    current = client.get(path, headers=operator).json()
    assert (
        client.patch(
            path,
            headers={"X-Backoffice-Key": key},
            json={"version": current["version"], "name": "Audited key change"},
        ).status_code
        == 200
    )
    latest = client.get(
        f"{BASE}/audit", headers=operator, params={"workspaceId": wid, "pageSize": 1}
    ).json()["items"][0]
    assert latest["actorType"] == "api_key" and latest["actorPlatformUserId"] is None
    assert key not in str(latest)
    assert latest["requestId"]
    for params in [
        {"dateFrom": "2026-01-01T00:00:00"},
        {"dateFrom": "2026-01-02T00:00:00Z", "dateTo": "2026-01-01T00:00:00Z"},
    ]:
        assert client.get(f"{BASE}/audit", headers=operator, params=params).status_code == 400


def test_unknown_modules_and_dependencies_are_rejected_atomically(client, operator):
    company = workspace(client, operator)
    path = f"{BASE}/workspaces/{company['workspaceId']}"
    for codes in [["not-a-module"], ["appointments"]]:
        result = client.patch(
            path, headers=operator, json={"version": company["version"], "enabledModules": codes}
        )
        assert result.status_code == 400
        current = client.get(path, headers=operator).json()
        assert current["version"] == company["version"]
        assert current["configuredModules"] == company["configuredModules"]
    modules = client.get(f"{BASE}/modules", headers=operator).json()["items"]
    agenda = next(item for item in modules if item["code"] == "appointments")
    assert "hr" in agenda["dependencyCodes"]


def test_plan_catalog_is_versioned_audited_and_does_not_change_existing_entitlements(
    client, operator
):
    company = workspace(client, operator)
    plan_id = uuid7()
    plan_code = f"test-{plan_id.hex[:16]}"
    with session_scope() as session:
        session.add(
            SubscriptionPlan(
                id=plan_id,
                code=plan_code,
                name="Test Catalog",
                description="Before",
                status="active",
                module_codes=company["configuredModules"],
                sort_order=99,
            )
        )
    path = f"{BASE}/workspaces/{company['workspaceId']}"
    assigned = client.patch(
        path,
        headers=operator,
        json={
            "version": company["version"],
            "planCode": plan_code,
        },
    )
    assert assigned.status_code == 200
    plan_path = f"{BASE}/plans/{plan_id}"
    invalid = client.patch(
        plan_path,
        headers=operator,
        json={
            "version": 1,
            "moduleCodes": ["missing-module"],
        },
    )
    assert invalid.status_code == 400
    payload = {"version": 1, "moduleCodes": ["foundation", "iam"], "description": "After"}
    updated = client.patch(plan_path, headers=operator, json=payload)
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == 2
    assert client.patch(plan_path, headers=operator, json=payload).status_code == 409
    current = client.get(path, headers=operator).json()
    assert current["configuredModules"] == company["configuredModules"]
    assert current["planCustomized"] is True
    restored = client.patch(
        path,
        headers=operator,
        json={
            "version": current["version"],
            "enabledModules": updated.json()["moduleCodes"],
        },
    )
    assert restored.status_code == 200
    assert restored.json()["planCustomized"] is False
    audit = client.get(
        f"{BASE}/audit",
        headers=operator,
        params={
            "targetId": str(plan_id),
            "action": "plan.backoffice_update",
        },
    ).json()
    assert audit["totalItems"] == 1
    event = audit["items"][0]
    assert event["workspaceId"] is None
    assert event["details"]["before"]["description"] == "Before"
    assert event["details"]["after"]["description"] == "After"
