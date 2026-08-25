from uuid import UUID, uuid7

import pytest
from app.core.security import hash_password
from app.db.models import Branch, PlatformUser, Workspace, WorkspaceMembership
from app.db.session import session_scope
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from sqlalchemy import select

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "local-test-password-not-a-secret"


def _bootstrap_owner() -> tuple[UUID, UUID]:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session, hash_password(_OWNER_PASSWORD))
        branch = Branch(
            workspace_id=summary.workspace_id,
            legal_entity_id=summary.legal_entity_id,
            code=f"B{str(uuid7()).replace('-', '')[:12]}",
            name=f"Secondary {uuid7()}",
            status="active",
            timezone="America/Santo_Domingo",
        )
        session.add(branch)
        session.flush()
        return summary.branch_id, branch.id


def _login(client: TestClient, email: str, password: str) -> dict[str, object]:
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": email,
            "password": password,
        },
    )
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()


def _authorization(tokens: dict[str, object]) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['accessToken']}"}


@pytest.mark.integration
def test_auth_login_refresh_logout_and_protected_contract(client: TestClient) -> None:
    _bootstrap_owner()

    unauthenticated = client.get("/api/v1/users")
    assert unauthenticated.status_code == 401
    assert unauthenticated.headers["www-authenticate"] == "Bearer"
    assert unauthenticated.json()["message"] == "Debes enviar un Bearer token válido."

    bad_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": _OWNER_EMAIL,
            "password": "incorrect-password",
        },
    )
    assert bad_login.status_code == 401
    assert bad_login.json() == {
        "message": "Email o contraseña incorrectos.",
        "parameter": None,
    }

    unknown_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "unknown-user@example.com",
            "password": "incorrect-password",
        },
    )
    assert unknown_login.status_code == 401

    with session_scope() as session:
        owner = session.scalar(
            select(PlatformUser).where(PlatformUser.normalized_email == _OWNER_EMAIL)
        )
        assert owner is not None
        primary_membership = session.scalar(
            select(WorkspaceMembership).where(
                WorkspaceMembership.platform_user_id == owner.id,
                WorkspaceMembership.is_default.is_(True),
            )
        )
        assert primary_membership is not None
        primary_membership_id = primary_membership.id
        extra_workspace = Workspace(
            slug=f"extra-{str(uuid7()).replace('-', '')[:16]}",
            name="Extra workspace",
            status="active",
            default_currency="DOP",
            timezone="America/Santo_Domingo",
            locale="es-DO",
        )
        session.add(extra_workspace)
        session.flush()
        extra_workspace_id = extra_workspace.id
        session.add(
            WorkspaceMembership(
                workspace_id=extra_workspace.id,
                platform_user_id=owner.id,
                status="active",
                is_default=False,
            )
        )

    automatic_workspace = client.post(
        "/api/v1/auth/login",
        json={"email": _OWNER_EMAIL, "password": _OWNER_PASSWORD},
    )
    assert automatic_workspace.status_code == 200
    automatic_me = client.get(
        "/api/v1/auth/me",
        headers=_authorization(automatic_workspace.json()),
    )
    assert automatic_me.status_code == 200
    assert UUID(automatic_me.json()["workspaceId"]) != extra_workspace_id

    obsolete_workspace_field = client.post(
        "/api/v1/auth/login",
        json={
            "email": _OWNER_EMAIL,
            "password": _OWNER_PASSWORD,
            "workspaceSlug": "local-erp",
        },
    )
    assert obsolete_workspace_field.status_code == 400
    assert obsolete_workspace_field.json()["parameter"] == "workspaceSlug"

    with session_scope() as session:
        primary_membership = session.get(WorkspaceMembership, primary_membership_id)
        assert primary_membership is not None
        primary_membership.is_default = False

    ambiguous_workspace = client.post(
        "/api/v1/auth/login",
        json={"email": _OWNER_EMAIL, "password": _OWNER_PASSWORD},
    )
    assert ambiguous_workspace.status_code == 409
    assert ambiguous_workspace.json()["parameter"] is None

    with session_scope() as session:
        primary_membership = session.get(WorkspaceMembership, primary_membership_id)
        assert primary_membership is not None
        primary_membership.is_default = True

    tokens = _login(client, _OWNER_EMAIL, _OWNER_PASSWORD)
    me = client.get("/api/v1/auth/me", headers=_authorization(tokens))
    assert me.status_code == 200
    assert me.json()["email"] == _OWNER_EMAIL

    refreshed = client.post(
        "/api/v1/auth/refresh",
        json={"refreshToken": tokens["refreshToken"]},
    )
    assert refreshed.status_code == 200
    rotated = refreshed.json()
    assert rotated["refreshToken"] != tokens["refreshToken"]

    replay = client.post(
        "/api/v1/auth/refresh",
        json={"refreshToken": tokens["refreshToken"]},
    )
    assert replay.status_code == 401

    malformed_refresh = client.post(
        "/api/v1/auth/refresh",
        json={"refreshToken": "x" * 40},
    )
    assert malformed_refresh.status_code == 401

    logout = client.post("/api/v1/auth/logout", headers=_authorization(rotated))
    assert logout.status_code == 204
    revoked = client.get("/api/v1/auth/me", headers=_authorization(rotated))
    assert revoked.status_code == 401


@pytest.mark.integration
def test_users_roles_permissions_and_branch_isolation(client: TestClient) -> None:
    primary_branch_id, secondary_branch_id = _bootstrap_owner()
    admin_tokens = _login(client, _OWNER_EMAIL, _OWNER_PASSWORD)
    admin_headers = _authorization(admin_tokens)

    options_response = client.get("/api/v1/users/form-options", headers=admin_headers)
    assert options_response.status_code == 200
    options = options_response.json()
    roles = {role["code"]: role for role in options["roles"]}
    assert {"workspace_admin", "manager", "supervisor", "cashier", "seller"} <= roles.keys()
    assert {UUID(branch["id"]) for branch in options["branches"]} >= {
        primary_branch_id,
        secondary_branch_id,
    }

    role_options_response = client.get("/api/v1/lookups/roles", headers=admin_headers)
    assert role_options_response.status_code == 200
    role_options = role_options_response.json()
    assert all(set(option) == {"id", "name"} for option in role_options)
    assert {option["name"] for option in role_options} >= {
        "Administrador",
        "Gerente",
        "Supervisor",
        "Cajero",
        "Vendedor",
    }

    branch_options_response = client.get("/api/v1/lookups/branches", headers=admin_headers)
    assert branch_options_response.status_code == 200
    branch_options = branch_options_response.json()
    assert all(set(option) == {"id", "name"} for option in branch_options)
    assert {UUID(option["id"]) for option in branch_options} >= {
        primary_branch_id,
        secondary_branch_id,
    }

    matrix_response = client.get("/api/v1/permissions/matrix", headers=admin_headers)
    assert matrix_response.status_code == 200
    matrix = matrix_response.json()
    assert matrix["totalPermissions"] == 12
    permission_ids = {
        permission["code"]: permission["id"]
        for module in matrix["modules"]
        for permission in module["permissions"]
    }
    matrix_roles = {role["code"]: role for role in matrix["roles"]}
    manager = matrix_roles["manager"]

    role_summary_response = client.get("/api/v1/roles/summary", headers=admin_headers)
    assert role_summary_response.status_code == 200
    role_summary = role_summary_response.json()
    assert role_summary["totalPermissions"] == 12
    role_cards = {role["code"]: role for role in role_summary["roles"]}
    assert role_cards["workspace_admin"]["permissionCount"] == 12
    assert role_cards["workspace_admin"]["permissionPercentage"] == 100
    assert role_cards["manager"]["permissionCount"] == 0
    assert role_cards["manager"]["permissionPercentage"] == 0

    cleared = client.put(
        f"/api/v1/roles/{manager['id']}/permissions",
        headers=admin_headers,
        json={"permissionIds": [], "version": manager["version"]},
    )
    assert cleared.status_code == 200
    cleared_manager = cleared.json()
    assert cleared_manager["permissionCount"] == 0

    unique = str(uuid7()).replace("-", "")
    manager_email = f"manager-{unique}@example.com"
    manager_password = "manager-password-not-a-secret"
    create_manager = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "displayName": "Pablo Lara",
            "email": manager_email,
            "password": manager_password,
            "roleId": manager["id"],
            "branchIds": [str(primary_branch_id)],
        },
    )
    assert create_manager.status_code == 201, create_manager.text
    created_manager = create_manager.json()
    assert created_manager["initials"] == "PL"
    assert created_manager["role"]["code"] == "manager"
    assert [UUID(branch["id"]) for branch in created_manager["branches"]] == [primary_branch_id]

    duplicate_email = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "displayName": "Duplicate Email",
            "email": manager_email.upper(),
            "password": "duplicate-password-not-a-secret",
            "roleId": manager["id"],
            "branchIds": [str(primary_branch_id)],
        },
    )
    assert duplicate_email.status_code == 409
    assert duplicate_email.json()["parameter"] == "email"

    manager_tokens = _login(client, manager_email, manager_password)
    manager_headers = _authorization(manager_tokens)
    denied_before_grant = client.get("/api/v1/users", headers=manager_headers)
    assert denied_before_grant.status_code == 403

    granted_codes = ["membership.read", "membership.manage", "role.manage"]
    granted = client.put(
        f"/api/v1/roles/{manager['id']}/permissions",
        headers=admin_headers,
        json={
            "permissionIds": [permission_ids[code] for code in granted_codes],
            "version": cleared_manager["version"],
        },
    )
    assert granted.status_code == 200

    manager_branch_options = client.get(
        "/api/v1/lookups/branches",
        headers=manager_headers,
    )
    assert manager_branch_options.status_code == 200
    assert {UUID(option["id"]) for option in manager_branch_options.json()} == {primary_branch_id}

    stale_update = client.put(
        f"/api/v1/roles/{manager['id']}/permissions",
        headers=admin_headers,
        json={"permissionIds": [], "version": cleared_manager["version"]},
    )
    assert stale_update.status_code == 409
    assert stale_update.json()["parameter"] == "version"

    visible_without_new_token = client.get(
        "/api/v1/users",
        headers=manager_headers,
        params={"search": manager_email, "page": 1, "pageSize": 10},
    )
    assert visible_without_new_token.status_code == 200
    assert visible_without_new_token.json()["totalItems"] == 1

    outside_filter = client.get(
        "/api/v1/users",
        headers=manager_headers,
        params={"branchId": str(secondary_branch_id)},
    )
    assert outside_filter.status_code == 403

    branch_scoped_role_update = client.put(
        f"/api/v1/roles/{roles['seller']['id']}/permissions",
        headers=manager_headers,
        json={"permissionIds": [], "version": 1},
    )
    assert branch_scoped_role_update.status_code == 403

    denied_superior_role = client.post(
        "/api/v1/users",
        headers=manager_headers,
        json={
            "displayName": "Superior Role",
            "email": f"superior-{unique}@example.com",
            "password": "superior-password-not-a-secret",
            "roleId": roles["workspace_admin"]["id"],
            "branchIds": [str(primary_branch_id)],
        },
    )
    assert denied_superior_role.status_code == 403

    denied_cross_branch_create = client.post(
        "/api/v1/users",
        headers=manager_headers,
        json={
            "displayName": "Outside Branch",
            "email": f"outside-{unique}@example.com",
            "password": "outside-password-not-a-secret",
            "roleId": roles["seller"]["id"],
            "branchIds": [str(secondary_branch_id)],
        },
    )
    assert denied_cross_branch_create.status_code == 403

    secondary_email = f"secondary-{unique}@example.com"
    create_secondary = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "displayName": "Secondary User",
            "email": secondary_email,
            "password": "secondary-password-not-a-secret",
            "roleId": roles["seller"]["id"],
            "branchIds": [str(secondary_branch_id)],
        },
    )
    assert create_secondary.status_code == 201
    secondary_membership_id = UUID(create_secondary.json()["id"])

    hidden_secondary = client.get(
        "/api/v1/users",
        headers=manager_headers,
        params={"search": secondary_email},
    )
    assert hidden_secondary.status_code == 200
    assert hidden_secondary.json()["totalItems"] == 0

    with session_scope() as session:
        secondary_membership = session.get(WorkspaceMembership, secondary_membership_id)
        assert secondary_membership is not None
        secondary_membership.status = "suspended"

    inactive = client.get(
        "/api/v1/users",
        headers=admin_headers,
        params={"search": secondary_email, "status": "inactive"},
    )
    assert inactive.status_code == 200
    assert inactive.json()["totalItems"] == 1

    filtered = client.get(
        "/api/v1/users",
        headers=admin_headers,
        params={
            "search": manager_email,
            "status": "active",
            "roleId": manager["id"],
            "branchId": str(primary_branch_id),
            "sortBy": "lastAccessAt",
            "sortDirection": "desc",
            "page": 1,
            "pageSize": 1,
        },
    )
    assert filtered.status_code == 200
    assert filtered.json()["totalItems"] == 1
    assert filtered.json()["totalPages"] == 1

    summary = client.get("/api/v1/users/summary", headers=admin_headers)
    assert summary.status_code == 200
    assert summary.json()["totalUsers"] >= 3
    assert summary.json()["activeUsers"] >= 2
    assert summary.json()["inactiveUsers"] >= 1

    roles_response = client.get("/api/v1/roles", headers=admin_headers)
    assert roles_response.status_code == 200
    assert any(role["code"] == "workspace_admin" for role in roles_response.json())

    missing_role = client.put(
        f"/api/v1/roles/{uuid7()}/permissions",
        headers=admin_headers,
        json={"permissionIds": [], "version": 1},
    )
    assert missing_role.status_code == 404

    current_manager_version = granted.json()["version"]
    missing_permission = client.put(
        f"/api/v1/roles/{manager['id']}/permissions",
        headers=admin_headers,
        json={"permissionIds": [str(uuid7())], "version": current_manager_version},
    )
    assert missing_permission.status_code == 404

    admin_role = matrix_roles["workspace_admin"]
    lockout_attempt = client.put(
        f"/api/v1/roles/{admin_role['id']}/permissions",
        headers=admin_headers,
        json={"permissionIds": [], "version": admin_role["version"]},
    )
    assert lockout_attempt.status_code == 409
    assert lockout_attempt.json()["parameter"] == "permissionIds"
