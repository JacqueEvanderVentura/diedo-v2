import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from http.cookies import SimpleCookie
from threading import Barrier
from uuid import UUID, uuid7

import pytest
from app.config import settings
from app.core.security import hash_password
from app.db.models import (
    AccessScope,
    AuditEntry,
    Branch,
    Permission,
    PlatformUser,
    Role,
    RoleAssignment,
    RolePermission,
    Workspace,
    WorkspaceMembership,
)
from app.db.session import get_session_factory, session_scope
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.errors import ConflictError
from app.services.local_bootstrap import bootstrap_local_foundation
from app.services.users import UsersService
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
    cookies = SimpleCookie()
    cookies.load(response.headers["set-cookie"])
    refresh_cookie = cookies[settings.refresh_cookie_name]
    assert refresh_cookie["path"] == settings.refresh_cookie_path
    assert refresh_cookie["httponly"] is True
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
    workspaces = client.get(
        "/api/v1/auth/workspaces",
        headers=_authorization(automatic_workspace.json()),
    )
    assert workspaces.status_code == 200
    assert {UUID(item["workspaceId"]) for item in workspaces.json()} >= {
        UUID(automatic_me.json()["workspaceId"]),
        extra_workspace_id,
    }
    switched = client.post(
        "/api/v1/auth/switch-workspace",
        headers=_authorization(automatic_workspace.json()),
        json={"workspaceId": str(extra_workspace_id)},
    )
    assert switched.status_code == 200
    switched_me = client.get("/api/v1/auth/me", headers=_authorization(switched.json()))
    assert switched_me.status_code == 200
    assert UUID(switched_me.json()["workspaceId"]) == extra_workspace_id
    assert (
        client.get(
            "/api/v1/auth/me",
            headers=_authorization(automatic_workspace.json()),
        ).status_code
        == 401
    )

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
    assert "refreshToken" not in tokens
    refresh_cookie = client.cookies.get(settings.refresh_cookie_name)
    assert refresh_cookie is not None
    me = client.get("/api/v1/auth/me", headers=_authorization(tokens))
    assert me.status_code == 200
    assert me.json()["email"] == _OWNER_EMAIL

    refreshed = client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    rotated = refreshed.json()
    assert "refreshToken" not in rotated
    rotated_cookie = client.cookies.get(settings.refresh_cookie_name)
    assert rotated_cookie is not None
    assert rotated_cookie != refresh_cookie

    client.cookies.set(
        settings.refresh_cookie_name,
        refresh_cookie,
        path=settings.refresh_cookie_path,
    )
    replay = client.post("/api/v1/auth/refresh")
    assert replay.status_code == 401

    client.cookies.set(
        settings.refresh_cookie_name,
        "x" * 40,
        path=settings.refresh_cookie_path,
    )
    malformed_refresh = client.post("/api/v1/auth/refresh")
    assert malformed_refresh.status_code == 401

    logout_tokens = _login(client, _OWNER_EMAIL, _OWNER_PASSWORD)
    logout = client.post("/api/v1/auth/logout", headers=_authorization(logout_tokens))
    assert logout.status_code == 204
    revoked = client.get("/api/v1/auth/me", headers=_authorization(logout_tokens))
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
    assert matrix["totalPermissions"] == 41
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
    assert role_summary["totalPermissions"] == 41
    role_cards = {role["code"]: role for role in role_summary["roles"]}
    assert role_cards["workspace_admin"]["permissionCount"] == 41
    assert role_cards["workspace_admin"]["permissionPercentage"] == 100
    assert role_cards["manager"]["permissionCount"] >= 0
    assert 0 <= role_cards["manager"]["permissionPercentage"] <= 100

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
            "roleAssignments": [
                {
                    "roleId": manager["id"],
                    "scopeType": "branch",
                    "branchId": str(primary_branch_id),
                }
            ],
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
            "roleAssignments": [
                {
                    "roleId": manager["id"],
                    "scopeType": "branch",
                    "branchId": str(primary_branch_id),
                }
            ],
        },
    )
    assert duplicate_email.status_code == 409
    assert duplicate_email.json()["parameter"] == "email"

    manager_tokens = _login(client, manager_email, manager_password)
    manager_headers = _authorization(manager_tokens)
    manager_me = client.get("/api/v1/auth/me", headers=manager_headers)
    assert manager_me.status_code == 200
    assert manager_me.json()["effectiveScope"] == {
        "workspaceWide": False,
        "legalEntityIds": [],
        "branchIds": [str(primary_branch_id)],
    }
    assert {UUID(branch["id"]) for branch in manager_me.json()["visibleBranches"]} == {
        primary_branch_id
    }
    denied_before_grant = client.get("/api/v1/users", headers=manager_headers)
    assert denied_before_grant.status_code == 403

    granted_codes = ["branch.read", "membership.read", "membership.manage", "role.manage"]
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
            "roleAssignments": [
                {
                    "roleId": roles["workspace_admin"]["id"],
                    "scopeType": "branch",
                    "branchId": str(primary_branch_id),
                }
            ],
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
            "roleAssignments": [
                {
                    "roleId": roles["seller"]["id"],
                    "scopeType": "branch",
                    "branchId": str(secondary_branch_id),
                }
            ],
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
            "roleAssignments": [
                {
                    "roleId": roles["seller"]["id"],
                    "scopeType": "branch",
                    "branchId": str(secondary_branch_id),
                }
            ],
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


@pytest.mark.integration
def test_role_assignments_are_explicit_versioned_and_scope_safe(client: TestClient) -> None:
    primary_branch_id, secondary_branch_id = _bootstrap_owner()
    admin_tokens = _login(client, _OWNER_EMAIL, _OWNER_PASSWORD)
    admin_headers = _authorization(admin_tokens)
    admin_me = client.get("/api/v1/auth/me", headers=admin_headers).json()
    options = client.get("/api/v1/users/form-options", headers=admin_headers).json()
    roles = {role["code"]: role for role in options["roles"]}
    primary_branch = next(
        branch for branch in options["branches"] if UUID(branch["id"]) == primary_branch_id
    )
    legal_entity_id = UUID(primary_branch["legalEntityId"])
    suffix = uuid7().hex

    obsolete_contract = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "displayName": "Contrato Obsoleto",
            "email": f"obsolete-{suffix}@example.com",
            "password": "obsolete-contract-password",
            "roleId": roles["seller"]["id"],
            "branchIds": [str(primary_branch_id)],
        },
    )
    assert obsolete_contract.status_code == 400
    assert obsolete_contract.json()["parameter"] == "roleAssignments"

    with session_scope() as session:
        foreign_workspace = Workspace(
            slug=f"foreign-{suffix[:16]}",
            name="Foreign workspace",
            status="active",
            default_currency="DOP",
            timezone="America/Santo_Domingo",
            locale="es-DO",
        )
        session.add(foreign_workspace)
        session.flush()
        foreign_role = Role(
            workspace_id=foreign_workspace.id,
            code="foreign_role",
            name="Foreign role",
            status="active",
            is_system=False,
        )
        session.add(foreign_role)
        session.flush()
        foreign_role_id = foreign_role.id
    foreign_role_assignment = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "displayName": "Rol De Otro Workspace",
            "email": f"foreign-role-{suffix}@example.com",
            "password": "foreign-role-password",
            "roleAssignments": [
                {
                    "roleId": str(foreign_role_id),
                    "scopeType": "branch",
                    "branchId": str(primary_branch_id),
                }
            ],
        },
    )
    assert foreign_role_assignment.status_code == 404
    assert foreign_role_assignment.json()["parameter"] == "roleAssignments"

    multi_email = f"multi-scope-{suffix}@example.com"
    multi_password = "multi-scope-password-not-a-secret"
    created = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "displayName": "Usuario Multi Alcance",
            "email": multi_email,
            "password": multi_password,
            "roleAssignments": [
                {
                    "roleId": roles["manager"]["id"],
                    "scopeType": "branch",
                    "branchId": str(primary_branch_id),
                },
                {
                    "roleId": roles["seller"]["id"],
                    "scopeType": "branch",
                    "branchId": str(secondary_branch_id),
                },
                {
                    "roleId": roles["cashier"]["id"],
                    "scopeType": "legalEntity",
                    "legalEntityId": str(legal_entity_id),
                },
            ],
        },
    )
    assert created.status_code == 201, created.text
    user = created.json()
    assert len(user["roleAssignments"]) == 3
    assert {
        (assignment["roleCode"], assignment["scopeType"], assignment["branchId"])
        for assignment in user["roleAssignments"]
    } == {
        ("manager", "branch", str(primary_branch_id)),
        ("seller", "branch", str(secondary_branch_id)),
        ("cashier", "legalEntity", None),
    }
    assert {UUID(branch["id"]) for branch in user["branches"]} >= {
        primary_branch_id,
        secondary_branch_id,
    }

    detail = client.get(f"/api/v1/users/{user['id']}", headers=admin_headers)
    assert detail.status_code == 200
    assert {item["id"] for item in detail.json()["roleAssignments"]} == {
        item["id"] for item in user["roleAssignments"]
    }

    member_tokens = _login(client, multi_email, multi_password)
    replacement = [
        {
            "roleId": roles["seller"]["id"],
            "scopeType": "branch",
            "branchId": str(primary_branch_id),
        },
        {
            "roleId": roles["cashier"]["id"],
            "scopeType": "branch",
            "branchId": str(secondary_branch_id),
        },
    ]
    replaced = client.patch(
        f"/api/v1/users/{user['id']}",
        headers=admin_headers,
        json={"roleAssignments": replacement, "version": user["version"]},
    )
    assert replaced.status_code == 200, replaced.text
    assert replaced.json()["version"] == user["version"] + 1
    assert {
        (assignment["roleCode"], assignment["branchId"])
        for assignment in replaced.json()["roleAssignments"]
    } == {
        ("seller", str(primary_branch_id)),
        ("cashier", str(secondary_branch_id)),
    }
    assert client.get("/api/v1/auth/me", headers=_authorization(member_tokens)).status_code == 401

    stale = client.patch(
        f"/api/v1/users/{user['id']}",
        headers=admin_headers,
        json={"roleAssignments": replacement, "version": user["version"]},
    )
    assert stale.status_code == 409
    assert stale.json()["parameter"] == "version"
    after_stale = client.get(f"/api/v1/users/{user['id']}", headers=admin_headers).json()
    assert after_stale["version"] == replaced.json()["version"]
    assert {item["id"] for item in after_stale["roleAssignments"]} == {
        item["id"] for item in replaced.json()["roleAssignments"]
    }

    with session_scope() as session:
        audit = session.scalar(
            select(AuditEntry)
            .where(
                AuditEntry.target_id == UUID(user["id"]),
                AuditEntry.action == "membership.update",
            )
            .order_by(AuditEntry.occurred_at.desc())
        )
        assert audit is not None
        assert audit.details["roleAssignments"] == [
            {
                "roleId": item["roleId"],
                "scopeType": "branch",
                "legalEntityId": str(legal_entity_id),
                "branchId": item["branchId"],
            }
            for item in replacement
        ]
        assert "password" not in str(audit.details).casefold()

    administrators_before = client.get(
        "/api/v1/users/summary",
        headers=admin_headers,
    ).json()["administrators"]
    rejected_branch_admin = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "displayName": "Pseudo Admin Solo Sucursal",
            "email": f"rejected-branch-admin-{suffix}@example.com",
            "password": "rejected-branch-admin-password",
            "roleAssignments": [
                {
                    "roleId": roles["workspace_admin"]["id"],
                    "scopeType": "branch",
                    "branchId": str(primary_branch_id),
                }
            ],
        },
    )
    assert rejected_branch_admin.status_code == 409, rejected_branch_admin.text
    assert rejected_branch_admin.json() == {
        "message": "El rol Administrador solo admite alcance workspace.",
        "parameter": "roleAssignments",
    }

    rejected_entity_admin = client.post(
        "/api/v1/users/invitations",
        headers=admin_headers,
        json={
            "displayName": "Pseudo Admin Entidad",
            "email": f"rejected-entity-admin-{suffix}@example.com",
            "roleAssignments": [
                {
                    "roleId": roles["workspace_admin"]["id"],
                    "scopeType": "legalEntity",
                    "legalEntityId": str(legal_entity_id),
                }
            ],
        },
    )
    assert rejected_entity_admin.status_code == 409, rejected_entity_admin.text
    assert rejected_entity_admin.json()["parameter"] == "roleAssignments"

    branch_manager_email = f"branch-manager-{suffix}@example.com"
    branch_manager_password = "branch-manager-password-not-secret"
    branch_manager = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "displayName": "Gestor Solo Sucursal",
            "email": branch_manager_email,
            "password": branch_manager_password,
            "roleAssignments": [
                {
                    "roleId": roles["manager"]["id"],
                    "scopeType": "branch",
                    "branchId": str(primary_branch_id),
                }
            ],
        },
    )
    assert branch_manager.status_code == 201, branch_manager.text
    administrators_after = client.get(
        "/api/v1/users/summary",
        headers=admin_headers,
    ).json()["administrators"]
    assert administrators_after == administrators_before

    branch_manager_tokens = _login(client, branch_manager_email, branch_manager_password)
    branch_manager_headers = _authorization(branch_manager_tokens)
    branch_manager_me = client.get("/api/v1/auth/me", headers=branch_manager_headers)
    assert branch_manager_me.status_code == 200
    assert branch_manager_me.json()["effectiveScope"] == {
        "workspaceWide": False,
        "legalEntityIds": [],
        "branchIds": [str(primary_branch_id)],
    }
    assert branch_manager_me.json()["workspacePermissionCodes"] == []
    branch_manager_options = client.get(
        "/api/v1/users/form-options",
        headers=branch_manager_headers,
    )
    assert branch_manager_options.status_code == 200, branch_manager_options.text
    assert roles["workspace_admin"]["id"] not in branch_manager_options.text

    branch_multi_detail = client.get(
        f"/api/v1/users/{user['id']}",
        headers=branch_manager_headers,
    )
    assert branch_multi_detail.status_code == 200
    branch_multi_user = branch_multi_detail.json()
    assert branch_multi_user["role"]["code"] == "seller"
    assert [
        (assignment["roleCode"], assignment["scopeType"], assignment["branchId"])
        for assignment in branch_multi_user["roleAssignments"]
    ] == [("seller", "branch", str(primary_branch_id))]
    assert [branch["id"] for branch in branch_multi_user["branches"]] == [str(primary_branch_id)]
    assert roles["cashier"]["id"] not in branch_multi_detail.text
    assert str(secondary_branch_id) not in branch_multi_detail.text

    branch_multi_list = client.get(
        "/api/v1/users",
        headers=branch_manager_headers,
        params={"search": multi_email},
    )
    assert branch_multi_list.status_code == 200
    visible_items = branch_multi_list.json()["items"]
    assert len(visible_items) == 1
    assert visible_items[0]["id"] == user["id"]
    assert visible_items[0]["roleAssignments"] == branch_multi_user["roleAssignments"]
    assert visible_items[0]["branches"] == branch_multi_user["branches"]

    hidden_role_filter = client.get(
        "/api/v1/users",
        headers=branch_manager_headers,
        params={"search": multi_email, "roleId": roles["cashier"]["id"]},
    )
    assert hidden_role_filter.status_code == 200
    assert hidden_role_filter.json()["items"] == []
    visible_role_filter = client.get(
        "/api/v1/users",
        headers=branch_manager_headers,
        params={"search": multi_email, "roleId": roles["seller"]["id"]},
    )
    assert visible_role_filter.status_code == 200
    assert [item["id"] for item in visible_role_filter.json()["items"]] == [user["id"]]

    denied_partial_update = client.patch(
        f"/api/v1/users/{user['id']}",
        headers=branch_manager_headers,
        json={
            "roleAssignments": [
                {
                    "roleId": roles["seller"]["id"],
                    "scopeType": "branch",
                    "branchId": str(primary_branch_id),
                }
            ],
            "version": branch_multi_user["version"],
        },
    )
    assert denied_partial_update.status_code == 403

    workspace_multi_detail = client.get(
        f"/api/v1/users/{user['id']}",
        headers=admin_headers,
    )
    assert workspace_multi_detail.status_code == 200
    assert workspace_multi_detail.json()["version"] == branch_multi_user["version"]
    assert {
        (assignment["roleCode"], assignment["branchId"])
        for assignment in workspace_multi_detail.json()["roleAssignments"]
    } == {
        ("seller", str(primary_branch_id)),
        ("cashier", str(secondary_branch_id)),
    }

    denied_workspace_assignment = client.post(
        "/api/v1/users",
        headers=branch_manager_headers,
        json={
            "displayName": "No Debe Crearse",
            "email": f"denied-workspace-{suffix}@example.com",
            "password": "denied-workspace-password",
            "roleAssignments": [{"roleId": roles["seller"]["id"], "scopeType": "workspace"}],
        },
    )
    assert denied_workspace_assignment.status_code == 403
    denied_legal_entity_assignment = client.post(
        "/api/v1/users",
        headers=branch_manager_headers,
        json={
            "displayName": "Tampoco Debe Crearse",
            "email": f"denied-entity-{suffix}@example.com",
            "password": "denied-entity-password",
            "roleAssignments": [
                {
                    "roleId": roles["seller"]["id"],
                    "scopeType": "legalEntity",
                    "legalEntityId": str(legal_entity_id),
                }
            ],
        },
    )
    assert denied_legal_entity_assignment.status_code == 403
    owner_for_branch_actor = client.get(
        f"/api/v1/users/{admin_me['membershipId']}",
        headers=branch_manager_headers,
    )
    assert owner_for_branch_actor.status_code == 200
    assert owner_for_branch_actor.json()["role"] is None
    assert owner_for_branch_actor.json()["roleAssignments"] == []
    assert [branch["id"] for branch in owner_for_branch_actor.json()["branches"]] == [
        str(primary_branch_id)
    ]
    assert roles["workspace_admin"]["id"] not in owner_for_branch_actor.text
    assert str(secondary_branch_id) not in owner_for_branch_actor.text
    denied_global_admin_update = client.patch(
        f"/api/v1/users/{admin_me['membershipId']}",
        headers=branch_manager_headers,
        json={
            "status": "suspended",
            "version": owner_for_branch_actor.json()["version"],
        },
    )
    assert denied_global_admin_update.status_code == 403

    with session_scope() as session:
        other_global_admins = session.scalars(
            select(WorkspaceMembership)
            .join(
                RoleAssignment,
                (RoleAssignment.workspace_id == WorkspaceMembership.workspace_id)
                & (RoleAssignment.membership_id == WorkspaceMembership.id),
            )
            .join(
                Role,
                (Role.workspace_id == RoleAssignment.workspace_id)
                & (Role.id == RoleAssignment.role_id),
            )
            .join(
                AccessScope,
                (AccessScope.workspace_id == RoleAssignment.workspace_id)
                & (AccessScope.id == RoleAssignment.access_scope_id),
            )
            .where(
                WorkspaceMembership.workspace_id == UUID(admin_me["workspaceId"]),
                WorkspaceMembership.id != UUID(admin_me["membershipId"]),
                WorkspaceMembership.status == "active",
                RoleAssignment.status == "active",
                Role.code == "workspace_admin",
                AccessScope.scope_type == "workspace",
            )
        ).all()
        for other_admin in other_global_admins:
            other_admin.status = "suspended"

    admin_detail = client.get(
        f"/api/v1/users/{admin_me['membershipId']}",
        headers=admin_headers,
    )
    assert admin_detail.status_code == 200
    last_global_admin = client.patch(
        f"/api/v1/users/{admin_me['membershipId']}",
        headers=admin_headers,
        json={"status": "suspended", "version": admin_detail.json()["version"]},
    )
    assert last_global_admin.status_code == 409


@pytest.mark.integration
def test_global_endpoints_require_workspace_permission_not_scoped_union(
    client: TestClient,
) -> None:
    primary_branch_id, _ = _bootstrap_owner()
    suffix = uuid7().hex[:16]
    scoped_email = f"legacy-scoped-admin-{suffix}@example.com"
    scoped_password = "legacy-scoped-admin-password"
    now = datetime.now(UTC)

    with session_scope() as session:
        owner_membership = session.scalar(
            select(WorkspaceMembership)
            .join(PlatformUser, PlatformUser.id == WorkspaceMembership.platform_user_id)
            .where(
                PlatformUser.normalized_email == _OWNER_EMAIL,
                WorkspaceMembership.is_default.is_(True),
            )
        )
        branch = session.get(Branch, primary_branch_id)
        assert owner_membership is not None
        assert branch is not None
        admin_role = session.scalar(
            select(Role).where(
                Role.workspace_id == owner_membership.workspace_id,
                Role.code == "workspace_admin",
            )
        )
        assert admin_role is not None
        branch_scope = session.scalar(
            select(AccessScope).where(
                AccessScope.workspace_id == owner_membership.workspace_id,
                AccessScope.scope_type == "branch",
                AccessScope.branch_id == branch.id,
            )
        )
        if branch_scope is None:
            branch_scope = AccessScope(
                workspace_id=owner_membership.workspace_id,
                scope_type="branch",
                legal_entity_id=branch.legal_entity_id,
                branch_id=branch.id,
            )
            session.add(branch_scope)
            session.flush()
        scoped_user = PlatformUser(
            external_subject=f"password:legacy-scoped-admin-{suffix}",
            email=scoped_email,
            normalized_email=scoped_email,
            display_name="Legacy Scoped Admin",
            password_hash=hash_password(scoped_password),
            password_changed_at=now,
            status="active",
        )
        session.add(scoped_user)
        session.flush()
        scoped_membership = WorkspaceMembership(
            workspace_id=owner_membership.workspace_id,
            platform_user_id=scoped_user.id,
            status="active",
            invited_at=now,
            activated_at=now,
            is_default=True,
        )
        session.add(scoped_membership)
        session.flush()
        session.add(
            RoleAssignment(
                workspace_id=owner_membership.workspace_id,
                membership_id=scoped_membership.id,
                role_id=admin_role.id,
                access_scope_id=branch_scope.id,
                status="active",
                valid_from=now,
            )
        )

    scoped_headers = _authorization(_login(client, scoped_email, scoped_password))
    scoped_me = client.get("/api/v1/auth/me", headers=scoped_headers)
    assert scoped_me.status_code == 200, scoped_me.text
    assert {"catalog.manage", "role.manage"} <= set(scoped_me.json()["effectivePermissionCodes"])
    assert "catalog.manage" not in scoped_me.json()["workspacePermissionCodes"]
    assert "role.manage" not in scoped_me.json()["workspacePermissionCodes"]

    denied_category = client.post(
        "/api/v1/catalog/categories",
        headers=scoped_headers,
        json={"name": f"Scoped category {suffix}"},
    )
    assert denied_category.status_code == 403, denied_category.text
    assert denied_category.json()["message"] == (
        "Gestionar categorías requiere alcance sobre todo el workspace."
    )

    matrix = client.get("/api/v1/permissions/matrix", headers=scoped_headers)
    assert matrix.status_code == 200, matrix.text
    seller = next(role for role in matrix.json()["roles"] if role["code"] == "seller")
    denied_permissions = client.put(
        "/api/v1/roles/permissions:batch",
        headers=scoped_headers,
        json={
            "roles": [
                {
                    "roleId": seller["id"],
                    "permissionIds": [],
                    "version": seller["version"],
                }
            ]
        },
    )
    assert denied_permissions.status_code == 403, denied_permissions.text
    assert denied_permissions.json()["message"] == (
        "Gestionar permisos de roles requiere alcance sobre todo el workspace."
    )

    owner_headers = _authorization(_login(client, _OWNER_EMAIL, _OWNER_PASSWORD))
    owner_category = client.post(
        "/api/v1/catalog/categories",
        headers=owner_headers,
        json={"name": f"Workspace category {suffix}"},
    )
    assert owner_category.status_code == 201, owner_category.text
    owner_permissions = client.put(
        "/api/v1/roles/permissions:batch",
        headers=owner_headers,
        json={
            "roles": [
                {
                    "roleId": seller["id"],
                    "permissionIds": [],
                    "version": seller["version"],
                }
            ]
        },
    )
    assert owner_permissions.status_code == 200, owner_permissions.text


@pytest.mark.integration
def test_role_permissions_batch_is_atomic_when_a_later_role_is_stale(
    client: TestClient,
) -> None:
    _bootstrap_owner()
    headers = _authorization(_login(client, _OWNER_EMAIL, _OWNER_PASSWORD))
    matrix_response = client.get("/api/v1/permissions/matrix", headers=headers)
    assert matrix_response.status_code == 200
    matrix = matrix_response.json()
    roles = {role["code"]: role for role in matrix["roles"]}
    permission_ids = {
        permission["code"]: permission["id"]
        for module in matrix["modules"]
        for permission in module["permissions"]
    }
    seller = roles["seller"]
    cashier = roles["cashier"]

    successful = client.put(
        "/api/v1/roles/permissions:batch",
        headers=headers,
        json={
            "roles": [
                {
                    "roleId": seller["id"],
                    "permissionIds": [permission_ids["membership.read"]],
                    "version": seller["version"],
                },
                {
                    "roleId": cashier["id"],
                    "permissionIds": [permission_ids["branch.read"]],
                    "version": cashier["version"],
                },
            ]
        },
    )
    assert successful.status_code == 200, successful.text
    saved_roles = successful.json()["roles"]
    assert [role["id"] for role in saved_roles] == [seller["id"], cashier["id"]]
    assert [role["version"] for role in saved_roles] == [
        seller["version"] + 1,
        cashier["version"] + 1,
    ]
    assert [role["permissionCount"] for role in saved_roles] == [1, 1]

    seller_after, cashier_after = saved_roles
    stale_second = client.put(
        "/api/v1/roles/permissions:batch",
        headers=headers,
        json={
            "roles": [
                {
                    "roleId": seller_after["id"],
                    "permissionIds": [
                        permission_ids["membership.read"],
                        permission_ids["branch.read"],
                    ],
                    "version": seller_after["version"],
                },
                {
                    "roleId": cashier_after["id"],
                    "permissionIds": [permission_ids["branch.read"]],
                    "version": cashier_after["version"] - 1,
                },
            ]
        },
    )
    assert stale_second.status_code == 409
    assert stale_second.json()["parameter"] == "version"

    with session_scope() as session:
        persisted_versions = {
            role_id: version
            for role_id, version in session.execute(
                select(Role.id, Role.version).where(
                    Role.id.in_([UUID(seller_after["id"]), UUID(cashier_after["id"])])
                )
            ).tuples()
        }
        persisted_grants: dict[UUID, set[str]] = {
            UUID(seller_after["id"]): set(),
            UUID(cashier_after["id"]): set(),
        }
        for role_id, permission_code in session.execute(
            select(RolePermission.role_id, Permission.code)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .where(RolePermission.role_id.in_(persisted_grants))
        ):
            persisted_grants[role_id].add(permission_code)

    assert persisted_versions == {
        UUID(seller_after["id"]): seller_after["version"],
        UUID(cashier_after["id"]): cashier_after["version"],
    }
    assert persisted_grants == {
        UUID(seller_after["id"]): {"membership.read"},
        UUID(cashier_after["id"]): {"branch.read"},
    }


@pytest.mark.integration
def test_role_permission_mutation_rejects_mixed_scope_laundering_atomically(
    client: TestClient,
) -> None:
    primary_branch_id, _ = _bootstrap_owner()
    suffix = uuid7().hex[:16]
    actor_email = f"mixed-scope-permissions-{suffix}@example.com"
    actor_password = "mixed-scope-permissions-password"
    now = datetime.now(UTC)

    with session_scope() as session:
        owner_membership = session.scalar(
            select(WorkspaceMembership)
            .join(PlatformUser, PlatformUser.id == WorkspaceMembership.platform_user_id)
            .where(
                PlatformUser.normalized_email == _OWNER_EMAIL,
                WorkspaceMembership.is_default.is_(True),
            )
        )
        branch = session.get(Branch, primary_branch_id)
        assert owner_membership is not None
        assert branch is not None
        workspace_id = owner_membership.workspace_id
        workspace_scope = session.scalar(
            select(AccessScope).where(
                AccessScope.workspace_id == workspace_id,
                AccessScope.scope_type == "workspace",
            )
        )
        branch_scope = session.scalar(
            select(AccessScope).where(
                AccessScope.workspace_id == workspace_id,
                AccessScope.branch_id == primary_branch_id,
            )
        )
        if branch_scope is None:
            branch_scope = AccessScope(
                workspace_id=workspace_id,
                scope_type="branch",
                legal_entity_id=branch.legal_entity_id,
                branch_id=branch.id,
            )
            session.add(branch_scope)
        permissions = {
            permission.code: permission
            for permission in session.scalars(
                select(Permission).where(Permission.code.in_(["role.manage", "customer.manage"]))
            )
        }
        assert workspace_scope is not None
        assert set(permissions) == {"role.manage", "customer.manage"}

        actor = PlatformUser(
            external_subject=f"password:mixed-scope-permissions-{suffix}",
            email=actor_email,
            normalized_email=actor_email,
            display_name="Mixed Scope Permission Manager",
            password_hash=hash_password(actor_password),
            password_changed_at=now,
            status="active",
        )
        workspace_manager_role = Role(
            workspace_id=workspace_id,
            code=f"scope-role-manager-{suffix}",
            name="Scope Role Manager",
            status="active",
            is_system=False,
        )
        branch_customer_role = Role(
            workspace_id=workspace_id,
            code=f"scope-customer-manager-{suffix}",
            name="Scoped Customer Manager",
            status="active",
            is_system=False,
        )
        safe_target_role = Role(
            workspace_id=workspace_id,
            code=f"scope-safe-target-{suffix}",
            name="Scope Safe Target",
            status="active",
            is_system=False,
        )
        unsafe_target_role = Role(
            workspace_id=workspace_id,
            code=f"scope-unsafe-target-{suffix}",
            name="Scope Unsafe Target",
            status="active",
            is_system=False,
        )
        session.add_all(
            [
                actor,
                workspace_manager_role,
                branch_customer_role,
                safe_target_role,
                unsafe_target_role,
            ]
        )
        session.flush()
        membership = WorkspaceMembership(
            workspace_id=workspace_id,
            platform_user_id=actor.id,
            status="active",
            invited_at=now,
            activated_at=now,
            is_default=True,
        )
        session.add(membership)
        session.flush()
        session.add_all(
            [
                RolePermission(
                    workspace_id=workspace_id,
                    role_id=workspace_manager_role.id,
                    permission_id=permissions["role.manage"].id,
                ),
                RolePermission(
                    workspace_id=workspace_id,
                    role_id=branch_customer_role.id,
                    permission_id=permissions["customer.manage"].id,
                ),
                RoleAssignment(
                    workspace_id=workspace_id,
                    membership_id=membership.id,
                    role_id=workspace_manager_role.id,
                    access_scope_id=workspace_scope.id,
                    status="active",
                    valid_from=now,
                ),
                RoleAssignment(
                    workspace_id=workspace_id,
                    membership_id=membership.id,
                    role_id=branch_customer_role.id,
                    access_scope_id=branch_scope.id,
                    status="active",
                    valid_from=now,
                ),
            ]
        )
        role_manage_permission_id = permissions["role.manage"].id
        customer_manage_permission_id = permissions["customer.manage"].id
        safe_target_id = safe_target_role.id
        unsafe_target_id = unsafe_target_role.id
        safe_target_version = safe_target_role.version
        unsafe_target_version = unsafe_target_role.version

    actor_headers = _authorization(_login(client, actor_email, actor_password))
    actor_session = client.get("/api/v1/auth/me", headers=actor_headers)
    assert actor_session.status_code == 200, actor_session.text
    assert {"role.manage", "customer.manage"} <= set(
        actor_session.json()["effectivePermissionCodes"]
    )
    assert actor_session.json()["workspacePermissionCodes"] == ["role.manage"]

    denied_individual = client.put(
        f"/api/v1/roles/{unsafe_target_id}/permissions",
        headers=actor_headers,
        json={
            "permissionIds": [str(customer_manage_permission_id)],
            "version": unsafe_target_version,
        },
    )
    assert denied_individual.status_code == 403, denied_individual.text
    assert denied_individual.json()["message"] == "No puedes conceder permisos que tú no posees."

    denied_batch = client.put(
        "/api/v1/roles/permissions:batch",
        headers=actor_headers,
        json={
            "roles": [
                {
                    "roleId": str(safe_target_id),
                    "permissionIds": [str(role_manage_permission_id)],
                    "version": safe_target_version,
                },
                {
                    "roleId": str(unsafe_target_id),
                    "permissionIds": [str(customer_manage_permission_id)],
                    "version": unsafe_target_version,
                },
            ]
        },
    )
    assert denied_batch.status_code == 403, denied_batch.text
    assert denied_batch.json()["message"] == "No puedes conceder permisos que tú no posees."

    with session_scope() as session:
        persisted_versions = {
            role_id: version
            for role_id, version in session.execute(
                select(Role.id, Role.version).where(Role.id.in_([safe_target_id, unsafe_target_id]))
            ).tuples()
        }
        persisted_grants = session.scalars(
            select(RolePermission).where(
                RolePermission.role_id.in_([safe_target_id, unsafe_target_id])
            )
        ).all()
        persisted_audits = session.scalars(
            select(AuditEntry).where(
                AuditEntry.target_id.in_([safe_target_id, unsafe_target_id]),
                AuditEntry.action == "role.permissions.replace",
            )
        ).all()

    assert persisted_versions == {
        safe_target_id: safe_target_version,
        unsafe_target_id: unsafe_target_version,
    }
    assert persisted_grants == []
    assert persisted_audits == []


@pytest.mark.integration
def test_concurrent_admin_demotions_preserve_one_workspace_admin(
    client: TestClient,
) -> None:
    _bootstrap_owner()
    owner_headers = _authorization(_login(client, _OWNER_EMAIL, _OWNER_PASSWORD))
    options_response = client.get("/api/v1/users/form-options", headers=owner_headers)
    assert options_response.status_code == 200, options_response.text
    roles = {role["code"]: role for role in options_response.json()["roles"]}
    workspace_admin_role_id = roles["workspace_admin"]["id"]

    created_admins: list[dict[str, object]] = []
    for index in range(2):
        suffix = uuid7().hex[:16]
        response = client.post(
            "/api/v1/users",
            headers=owner_headers,
            json={
                "displayName": f"Concurrent Admin {index}",
                "email": f"concurrent-admin-{suffix}@example.com",
                "password": f"concurrent-admin-{suffix}-password",
                "roleAssignments": [
                    {
                        "roleId": workspace_admin_role_id,
                        "scopeType": "workspace",
                    }
                ],
            },
        )
        assert response.status_code == 201, response.text
        created_admins.append(response.json())

    owner_me = client.get("/api/v1/auth/me", headers=owner_headers)
    assert owner_me.status_code == 200, owner_me.text
    workspace_id = UUID(str(owner_me.json()["workspaceId"]))
    kept_membership_ids = {UUID(str(item["id"])) for item in created_admins}
    with session_scope() as session:
        other_admins = session.scalars(
            select(WorkspaceMembership)
            .join(
                RoleAssignment,
                (RoleAssignment.workspace_id == WorkspaceMembership.workspace_id)
                & (RoleAssignment.membership_id == WorkspaceMembership.id),
            )
            .join(
                Role,
                (Role.workspace_id == RoleAssignment.workspace_id)
                & (Role.id == RoleAssignment.role_id),
            )
            .join(
                AccessScope,
                (AccessScope.workspace_id == RoleAssignment.workspace_id)
                & (AccessScope.id == RoleAssignment.access_scope_id),
            )
            .where(
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.id.not_in(kept_membership_ids),
                WorkspaceMembership.status == "active",
                RoleAssignment.status == "active",
                Role.code == "workspace_admin",
                AccessScope.scope_type == "workspace",
            )
        ).all()
        for membership in other_admins:
            membership.status = "suspended"

    start = Barrier(2)

    def suspend_admin(item: dict[str, object]) -> str:
        membership_id = UUID(str(item["id"]))
        principal = AuthPrincipal(
            platform_user_id=UUID(str(item["userId"])),
            membership_id=membership_id,
            workspace_id=workspace_id,
            session_id=uuid7(),
            email=str(item["email"]),
            display_name=str(item["displayName"]),
        )
        grant = PermissionGrant(
            permission_code="membership.manage",
            workspace_id=workspace_id,
            membership_id=membership_id,
            allowed_legal_entity_ids=None,
            allowed_branch_ids=None,
        )
        start.wait(timeout=10)
        with get_session_factory()() as session:
            try:
                UsersService(session).update_user(
                    principal=principal,
                    grant=grant,
                    membership_id=membership_id,
                    version=int(str(item["version"])),
                    status="suspended",
                    role_assignments=None,
                )
            except ConflictError:
                return "conflict"
        return "suspended"

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(suspend_admin, item) for item in created_admins]
        outcomes = sorted(future.result(timeout=15) for future in futures)

    assert outcomes == ["conflict", "suspended"]
    with session_scope() as session:
        active_kept_admins = session.scalars(
            select(WorkspaceMembership).where(
                WorkspaceMembership.id.in_(kept_membership_ids),
                WorkspaceMembership.status == "active",
            )
        ).all()
        assert len(active_kept_admins) == 1


@pytest.mark.integration
def test_existing_identity_invitation_keeps_global_password_and_hides_token(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    foundation = _bootstrap_owner()
    del foundation
    owner_headers = _authorization(_login(client, _OWNER_EMAIL, _OWNER_PASSWORD))
    options_response = client.get("/api/v1/users/form-options", headers=owner_headers)
    assert options_response.status_code == 200, options_response.text
    roles = {role["code"]: role for role in options_response.json()["roles"]}

    victim_id = uuid7()
    victim_email = f"cross-workspace-victim-{victim_id.hex[:16]}@example.com"
    victim_password = "victim-original-password"
    victim_password_hash = hash_password(victim_password)
    with session_scope() as session:
        foreign_workspace = Workspace(
            slug=f"victim-workspace-{uuid7().hex[:16]}",
            name="Victim foreign workspace",
            status="active",
            default_currency="DOP",
            timezone="America/Santo_Domingo",
            locale="es-DO",
        )
        victim = PlatformUser(
            id=victim_id,
            external_subject=f"password:{victim_id}",
            email=victim_email,
            normalized_email=victim_email,
            display_name="Cross Workspace Victim",
            password_hash=victim_password_hash,
            status="active",
        )
        session.add_all([foreign_workspace, victim])
        session.flush()
        session.add(
            WorkspaceMembership(
                workspace_id=foreign_workspace.id,
                platform_user_id=victim.id,
                status="active",
                is_default=True,
            )
        )

    raw_token = f"existing-identity-invitation-token-{uuid7().hex}"
    monkeypatch.setattr(settings, "demo_seed_enabled", False)
    monkeypatch.setattr(
        "app.services.users.secrets.token_urlsafe",
        lambda _size: raw_token,
    )
    invitation_response = client.post(
        "/api/v1/users/invitations",
        headers=owner_headers,
        json={
            "displayName": "Ignored Existing Name",
            "email": victim_email,
            "roleAssignments": [
                {
                    "roleId": roles["seller"]["id"],
                    "scopeType": "workspace",
                }
            ],
        },
    )
    assert invitation_response.status_code == 201, invitation_response.text
    invitation_payload = invitation_response.json()
    assert "acceptToken" not in invitation_payload

    attempted_password = "attacker-selected-password"
    password_takeover = client.post(
        "/api/v1/users/invitations/accept",
        json={"token": raw_token, "password": attempted_password},
    )
    assert password_takeover.status_code == 400, password_takeover.text
    assert password_takeover.json()["parameter"] == "password"

    accepted = client.post(
        "/api/v1/users/invitations/accept",
        json={"token": raw_token},
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["id"] == invitation_payload["membershipId"]

    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": victim_email, "password": attempted_password},
        ).status_code
        == 401
    )
    assert _login(client, victim_email, victim_password)["accessToken"]

    with session_scope() as session:
        loaded_victim = session.get(PlatformUser, victim_id)
        assert loaded_victim is not None
        assert loaded_victim.password_hash == victim_password_hash
        audits = session.scalars(
            select(AuditEntry)
            .where(AuditEntry.target_id == UUID(invitation_payload["membershipId"]))
            .order_by(AuditEntry.occurred_at)
        ).all()
        assert [audit.action for audit in audits] == [
            "membership.invitation.create",
            "membership.invitation.accept",
        ]
        serialized_audit = json.dumps([audit.details for audit in audits], sort_keys=True)
        assert raw_token not in serialized_audit
        assert victim_password not in serialized_audit
        assert attempted_password not in serialized_audit
        assert "password" not in serialized_audit.casefold()

    new_identity_token = f"new-identity-invitation-token-{uuid7().hex}"
    new_identity_email = f"invited-new-{uuid7().hex[:16]}@example.com"
    new_identity_password = "new-invited-identity-password"
    monkeypatch.setattr(
        "app.services.users.secrets.token_urlsafe",
        lambda _size: new_identity_token,
    )
    new_invitation = client.post(
        "/api/v1/users/invitations",
        headers=owner_headers,
        json={
            "displayName": "Brand New Invited Identity",
            "email": new_identity_email,
            "roleAssignments": [
                {
                    "roleId": roles["seller"]["id"],
                    "scopeType": "workspace",
                }
            ],
        },
    )
    assert new_invitation.status_code == 201, new_invitation.text
    assert "acceptToken" not in new_invitation.json()
    missing_password = client.post(
        "/api/v1/users/invitations/accept",
        json={"token": new_identity_token},
    )
    assert missing_password.status_code == 400, missing_password.text
    assert missing_password.json()["parameter"] == "password"
    accepted_new_identity = client.post(
        "/api/v1/users/invitations/accept",
        json={"token": new_identity_token, "password": new_identity_password},
    )
    assert accepted_new_identity.status_code == 200, accepted_new_identity.text
    assert _login(client, new_identity_email, new_identity_password)["accessToken"]
    with session_scope() as session:
        new_identity_audits = session.scalars(
            select(AuditEntry).where(
                AuditEntry.target_id == UUID(new_invitation.json()["membershipId"])
            )
        ).all()
        serialized_new_audit = json.dumps(
            [audit.details for audit in new_identity_audits], sort_keys=True
        )
        assert new_identity_token not in serialized_new_audit
        assert new_identity_password not in serialized_new_audit
        assert "password" not in serialized_new_audit.casefold()


@pytest.mark.integration
def test_admin_password_reset_is_global_only_for_single_workspace_identity(
    client: TestClient,
) -> None:
    _bootstrap_owner()
    owner_headers = _authorization(_login(client, _OWNER_EMAIL, _OWNER_PASSWORD))
    options_response = client.get("/api/v1/users/form-options", headers=owner_headers)
    assert options_response.status_code == 200, options_response.text
    roles = {role["code"]: role for role in options_response.json()["roles"]}

    def create_user(label: str) -> tuple[dict[str, object], str]:
        suffix = uuid7().hex[:16]
        password = f"{label}-{suffix}-old-password"
        response = client.post(
            "/api/v1/users",
            headers=owner_headers,
            json={
                "displayName": f"{label} Password User",
                "email": f"{label}-{suffix}@example.com",
                "password": password,
                "roleAssignments": [
                    {
                        "roleId": roles["seller"]["id"],
                        "scopeType": "workspace",
                    }
                ],
            },
        )
        assert response.status_code == 201, response.text
        return response.json(), password

    single_user, single_old_password = create_user("single")
    single_tokens_a = _login(client, str(single_user["email"]), single_old_password)
    single_tokens_b = _login(client, str(single_user["email"]), single_old_password)
    single_new_password = "single-workspace-new-password"
    reset_single = client.post(
        f"/api/v1/users/{single_user['id']}/password-reset",
        headers=owner_headers,
        json={"newPassword": single_new_password},
    )
    assert reset_single.status_code == 204, reset_single.text
    assert client.get("/api/v1/auth/me", headers=_authorization(single_tokens_a)).status_code == 401
    assert client.get("/api/v1/auth/me", headers=_authorization(single_tokens_b)).status_code == 401
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": single_user["email"], "password": single_old_password},
        ).status_code
        == 401
    )
    assert _login(client, str(single_user["email"]), single_new_password)["accessToken"]

    multi_user, multi_old_password = create_user("multi")
    multi_tokens = _login(client, str(multi_user["email"]), multi_old_password)
    with session_scope() as session:
        foreign_workspace = Workspace(
            slug=f"multi-reset-{uuid7().hex[:16]}",
            name="Multi reset foreign workspace",
            status="active",
            default_currency="DOP",
            timezone="America/Santo_Domingo",
            locale="es-DO",
        )
        session.add(foreign_workspace)
        session.flush()
        session.add(
            WorkspaceMembership(
                workspace_id=foreign_workspace.id,
                platform_user_id=UUID(str(multi_user["userId"])),
                status="active",
                is_default=False,
            )
        )

    rejected_password = "multi-workspace-rejected-password"
    reset_multi = client.post(
        f"/api/v1/users/{multi_user['id']}/password-reset",
        headers=owner_headers,
        json={"newPassword": rejected_password},
    )
    assert reset_multi.status_code == 409, reset_multi.text
    assert reset_multi.json()["parameter"] == "membershipId"
    assert client.get("/api/v1/auth/me", headers=_authorization(multi_tokens)).status_code == 200
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": multi_user["email"], "password": rejected_password},
        ).status_code
        == 401
    )
    assert _login(client, str(multi_user["email"]), multi_old_password)["accessToken"]

    with session_scope() as session:
        single_audit = session.scalar(
            select(AuditEntry).where(
                AuditEntry.target_id == UUID(str(single_user["userId"])),
                AuditEntry.action == "platform_user.password.admin_reset",
            )
        )
        assert single_audit is not None
        assert single_audit.details == {
            "membershipId": str(single_user["id"]),
            "revokedAllIdentitySessions": True,
        }
        assert single_new_password not in json.dumps(single_audit.details)
        multi_audit = session.scalar(
            select(AuditEntry).where(
                AuditEntry.target_id == UUID(str(multi_user["userId"])),
                AuditEntry.action == "platform_user.password.admin_reset",
            )
        )
        assert multi_audit is None
