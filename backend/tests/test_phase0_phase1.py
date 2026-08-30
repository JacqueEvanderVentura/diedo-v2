from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid7

import pytest
from app.core.security import hash_password
from app.db.models import (
    AccessScope,
    AuthSession,
    ModuleDefinition,
    ModuleEntitlement,
    Permission,
    PlatformUser,
    Role,
    RoleAssignment,
    RolePermission,
    WorkspaceMembership,
)
from app.db.session import get_session_factory, session_scope
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "phase-one-owner-password-not-a-secret"


def _bootstrap() -> None:
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OWNER_PASSWORD))


def _login(client: TestClient, email: str = _OWNER_EMAIL, password: str = _OWNER_PASSWORD) -> dict:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def _headers(tokens: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['accessToken']}"}


@pytest.mark.integration
def test_phase1_administration_crud_and_optimistic_concurrency(client: TestClient) -> None:
    _bootstrap()
    headers = _headers(_login(client))
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    session = me.json()
    assert session["primaryRole"]["code"] == "workspace_admin"
    assert session["effectiveScope"]["workspaceWide"] is True
    assert {"foundation", "iam", "catalog"} <= set(session["enabledModules"])
    assert "workspace.update" in session["effectivePermissionCodes"]
    assert "workspace.update" in session["workspacePermissionCodes"]

    settings_response = client.get("/api/v1/workspace/settings", headers=headers)
    assert settings_response.status_code == 200
    settings = settings_response.json()
    updated_settings = client.patch(
        "/api/v1/workspace/settings",
        headers=headers,
        json={"name": "Workspace fase 1", "taxDefaultRate": 18, "version": settings["version"]},
    )
    assert updated_settings.status_code == 200
    assert float(updated_settings.json()["taxDefaultRate"]) == 18
    stale_settings = client.patch(
        "/api/v1/workspace/settings",
        headers=headers,
        json={"name": "Cambio obsoleto", "version": settings["version"]},
    )
    assert stale_settings.status_code == 409
    assert stale_settings.json()["parameter"] == "version"

    legal_entity_id = session["visibleBranches"][0]["legalEntityId"]
    legal_entity = client.get(f"/api/v1/legal-entities/{legal_entity_id}", headers=headers)
    assert legal_entity.status_code == 200
    renamed_entity = client.patch(
        f"/api/v1/legal-entities/{legal_entity_id}",
        headers=headers,
        json={"displayName": "Entidad fase 1", "version": legal_entity.json()["version"]},
    )
    assert renamed_entity.status_code == 200

    branch_code = f"T{str(uuid7()).replace('-', '')[:12]}"
    created_branch = client.post(
        "/api/v1/branches",
        headers=headers,
        json={
            "legalEntityId": legal_entity_id,
            "code": branch_code,
            "name": "Sucursal prueba fase 1",
            "timezone": "America/Santo_Domingo",
            "details": {
                "address": "Calle de prueba",
                "partners": [{"name": "Socio Demo", "share": 50}],
            },
        },
    )
    assert created_branch.status_code == 201, created_branch.text
    branch = created_branch.json()
    assert branch["details"]["address"] == "Calle de prueba"
    changed_branch = client.patch(
        f"/api/v1/branches/{branch['id']}",
        headers=headers,
        json={"name": "Sucursal actualizada", "version": branch["version"]},
    )
    assert changed_branch.status_code == 200
    stale_branch = client.patch(
        f"/api/v1/branches/{branch['id']}",
        headers=headers,
        json={"name": "Sucursal obsoleta", "version": branch["version"]},
    )
    assert stale_branch.status_code == 409
    archived_branch = client.delete(
        f"/api/v1/branches/{branch['id']}",
        headers=headers,
        params={"version": changed_branch.json()["version"]},
    )
    assert archived_branch.status_code == 204

    method_code = f"test-{str(uuid7()).replace('-', '')[:12]}"
    created_method = client.post(
        "/api/v1/payment-methods",
        headers=headers,
        json={"code": method_code, "name": "Pago prueba", "icon": "Wallet"},
    )
    assert created_method.status_code == 201
    method = created_method.json()
    disabled_method = client.patch(
        f"/api/v1/payment-methods/{method['id']}",
        headers=headers,
        json={"status": "inactive", "version": method["version"]},
    )
    assert disabled_method.status_code == 200
    assert disabled_method.json()["status"] == "inactive"
    archived_method = client.delete(
        f"/api/v1/payment-methods/{method['id']}",
        headers=headers,
        params={"version": disabled_method.json()["version"]},
    )
    assert archived_method.status_code == 204


@pytest.mark.integration
def test_phase1_invitations_user_lifecycle_sessions_and_last_admin(client: TestClient) -> None:
    _bootstrap()
    admin_tokens = _login(client)
    headers = _headers(admin_tokens)
    me = client.get("/api/v1/auth/me", headers=headers).json()
    options = client.get("/api/v1/users/form-options", headers=headers).json()
    seller_role = next(role for role in options["roles"] if role["code"] == "seller")
    branch_id = options["branches"][0]["id"]
    invited_email = f"phase1-{str(uuid7()).replace('-', '')}@example.com"

    invitation_response = client.post(
        "/api/v1/users/invitations",
        headers=headers,
        json={
            "displayName": "Persona Invitada",
            "email": invited_email,
            "roleAssignments": [
                {
                    "roleId": seller_role["id"],
                    "scopeType": "branch",
                    "branchId": branch_id,
                }
            ],
        },
    )
    assert invitation_response.status_code == 201, invitation_response.text
    invitation = invitation_response.json()
    assert invitation["status"] == "pending"
    assert len(invitation["acceptToken"]) >= 40

    invited_password = "invited-phase-one-password-not-secret"
    accepted = client.post(
        "/api/v1/users/invitations/accept",
        json={"token": invitation["acceptToken"], "password": invited_password},
    )
    assert accepted.status_code == 200, accepted.text
    invited = accepted.json()
    assert invited["status"] == "active"
    replay = client.post(
        "/api/v1/users/invitations/accept",
        json={"token": invitation["acceptToken"], "password": invited_password},
    )
    assert replay.status_code == 404

    invited_tokens = _login(client, invited_email, invited_password)
    invited_headers = _headers(invited_tokens)
    profile = client.patch(
        "/api/v1/auth/profile",
        headers=invited_headers,
        json={"displayName": "Persona Invitada Actualizada"},
    )
    assert profile.status_code == 204
    new_password = "updated-phase-one-password-not-secret"
    changed_password = client.post(
        "/api/v1/auth/change-password",
        headers=invited_headers,
        json={"currentPassword": invited_password, "newPassword": new_password},
    )
    assert changed_password.status_code == 204
    assert _login(client, invited_email, new_password)["accessToken"]

    admin_tokens = _login(client)
    headers = _headers(admin_tokens)
    user_detail = client.get(f"/api/v1/users/{invited['id']}", headers=headers)
    assert user_detail.status_code == 200
    suspended = client.patch(
        f"/api/v1/users/{invited['id']}",
        headers=headers,
        json={"status": "suspended", "version": user_detail.json()["version"]},
    )
    assert suspended.status_code == 200
    stale = client.patch(
        f"/api/v1/users/{invited['id']}",
        headers=headers,
        json={"status": "active", "version": user_detail.json()["version"]},
    )
    assert stale.status_code == 409

    admin_detail = client.get(f"/api/v1/users/{me['membershipId']}", headers=headers)
    assert admin_detail.status_code == 200
    with session_scope() as database:
        other_admin_ids = database.scalars(
            select(WorkspaceMembership.id)
            .join(
                RoleAssignment,
                (RoleAssignment.workspace_id == WorkspaceMembership.workspace_id)
                & (RoleAssignment.membership_id == WorkspaceMembership.id),
            )
            .join(Role, Role.id == RoleAssignment.role_id)
            .join(AccessScope, AccessScope.id == RoleAssignment.access_scope_id)
            .where(
                WorkspaceMembership.workspace_id == UUID(me["workspaceId"]),
                WorkspaceMembership.id != UUID(me["membershipId"]),
                WorkspaceMembership.status == "active",
                RoleAssignment.status == "active",
                Role.code == "workspace_admin",
                AccessScope.scope_type == "workspace",
            )
        ).all()
        for membership_id in other_admin_ids:
            membership = database.get(WorkspaceMembership, membership_id)
            assert membership is not None
            membership.status = "suspended"
    last_admin = client.patch(
        f"/api/v1/users/{me['membershipId']}",
        headers=headers,
        json={"status": "suspended", "version": admin_detail.json()["version"]},
    )
    assert last_admin.status_code == 409

    older_tokens = admin_tokens
    current_tokens = _login(client)
    current_headers = _headers(current_tokens)
    sessions = client.get("/api/v1/auth/sessions", headers=current_headers)
    assert sessions.status_code == 200
    older_session = next(item for item in sessions.json() if not item["current"])
    revoked = client.delete(f"/api/v1/auth/sessions/{older_session['id']}", headers=current_headers)
    assert revoked.status_code == 204
    assert client.get("/api/v1/auth/me", headers=_headers(older_tokens)).status_code == 401


@pytest.mark.integration
def test_phase0_module_entitlement_blocks_permission_even_when_role_grants_it(
    client: TestClient,
) -> None:
    _bootstrap()
    headers = _headers(_login(client))
    assert client.get("/api/v1/catalog/categories", headers=headers).status_code == 200

    with session_scope() as session:
        catalog = session.scalar(select(ModuleDefinition).where(ModuleDefinition.code == "catalog"))
        assert catalog is not None
        entitlement = session.scalar(
            select(ModuleEntitlement).where(
                ModuleEntitlement.module_definition_id == catalog.id,
                ModuleEntitlement.status == "enabled",
            )
        )
        assert entitlement is not None
        entitlement.status = "disabled"

    denied = client.get("/api/v1/catalog/categories", headers=headers)
    assert denied.status_code == 403

    with session_scope() as session:
        catalog = session.scalar(select(ModuleDefinition).where(ModuleDefinition.code == "catalog"))
        assert catalog is not None
        entitlement = session.scalar(
            select(ModuleEntitlement).where(ModuleEntitlement.module_definition_id == catalog.id)
        )
        assert entitlement is not None
        entitlement.status = "enabled"


@pytest.mark.integration
def test_permission_matrix_preserves_dormant_grants_without_privilege_escalation(
    client: TestClient,
) -> None:
    _bootstrap()
    unique = str(uuid7()).replace("-", "")
    limited_email = f"dormant-limited-{unique}@example.com"
    limited_password = "dormant-limited-password-not-a-secret"
    now = datetime.now(UTC)

    with session_scope() as session:
        owner_membership = session.scalar(
            select(WorkspaceMembership).where(
                WorkspaceMembership.platform_user_id
                == select(PlatformUser.id)
                .where(PlatformUser.normalized_email == _OWNER_EMAIL)
                .scalar_subquery(),
                WorkspaceMembership.is_default.is_(True),
            )
        )
        assert owner_membership is not None
        workspace_id = owner_membership.workspace_id
        catalog = session.scalar(select(ModuleDefinition).where(ModuleDefinition.code == "catalog"))
        assert catalog is not None
        catalog_entitlement = session.scalar(
            select(ModuleEntitlement).where(
                ModuleEntitlement.workspace_id == workspace_id,
                ModuleEntitlement.module_definition_id == catalog.id,
            )
        )
        assert catalog_entitlement is not None
        catalog_entitlement.status = "disabled"

        workspace_scope = session.scalar(
            select(AccessScope).where(
                AccessScope.workspace_id == workspace_id,
                AccessScope.scope_type == "workspace",
            )
        )
        role_manage = session.scalar(select(Permission).where(Permission.code == "role.manage"))
        assert workspace_scope is not None
        assert role_manage is not None

        limited_user = PlatformUser(
            external_subject=f"password:{unique}",
            email=limited_email,
            normalized_email=limited_email,
            display_name="Dormant Limited Actor",
            password_hash=hash_password(limited_password),
            password_changed_at=now,
            status="active",
        )
        limited_role = Role(
            workspace_id=workspace_id,
            code=f"dormant-limited-{unique[:24]}",
            name="Dormant Limited Role",
            status="active",
            is_system=False,
        )
        session.add_all([limited_user, limited_role])
        session.flush()
        limited_membership = WorkspaceMembership(
            workspace_id=workspace_id,
            platform_user_id=limited_user.id,
            status="active",
            invited_at=now,
            activated_at=now,
            is_default=True,
        )
        session.add(limited_membership)
        session.flush()
        session.add_all(
            [
                RolePermission(
                    workspace_id=workspace_id,
                    role_id=limited_role.id,
                    permission_id=role_manage.id,
                ),
                RoleAssignment(
                    workspace_id=workspace_id,
                    membership_id=limited_membership.id,
                    role_id=limited_role.id,
                    access_scope_id=workspace_scope.id,
                    status="active",
                    valid_from=now,
                ),
            ]
        )
        limited_role_id = limited_role.id

    try:
        owner_headers = _headers(_login(client))
        owner_session = client.get("/api/v1/auth/me", headers=owner_headers)
        assert owner_session.status_code == 200
        assert "catalog" not in owner_session.json()["enabledModules"]
        assert "catalog.read" not in owner_session.json()["effectivePermissionCodes"]

        matrix_response = client.get("/api/v1/permissions/matrix", headers=owner_headers)
        assert matrix_response.status_code == 200
        matrix = matrix_response.json()
        catalog_module = next(module for module in matrix["modules"] if module["code"] == "catalog")
        assert catalog_module["enabled"] is False
        owner_role = next(role for role in matrix["roles"] if role["code"] == "workspace_admin")
        permission_by_code = {
            permission["code"]: permission
            for module in matrix["modules"]
            for permission in module["permissions"]
        }
        assert owner_role["id"] in permission_by_code["catalog.read"]["grantedRoleIds"]

        owner_permission_ids = [
            permission["id"]
            for module in matrix["modules"]
            for permission in module["permissions"]
            if owner_role["id"] in permission["grantedRoleIds"]
        ]
        preserved = client.put(
            f"/api/v1/roles/{owner_role['id']}/permissions",
            headers=owner_headers,
            json={"permissionIds": owner_permission_ids, "version": owner_role["version"]},
        )
        assert preserved.status_code == 200, preserved.text
        assert preserved.json()["version"] == owner_role["version"] + 1

        reloaded = client.get("/api/v1/permissions/matrix", headers=owner_headers)
        assert reloaded.status_code == 200
        reloaded_catalog = next(
            module for module in reloaded.json()["modules"] if module["code"] == "catalog"
        )
        assert reloaded_catalog["enabled"] is False
        reloaded_catalog_read = next(
            permission
            for permission in reloaded_catalog["permissions"]
            if permission["code"] == "catalog.read"
        )
        assert owner_role["id"] in reloaded_catalog_read["grantedRoleIds"]

        limited_headers = _headers(_login(client, limited_email, limited_password))
        limited_session = client.get("/api/v1/auth/me", headers=limited_headers)
        assert limited_session.status_code == 200
        assert "role.manage" in limited_session.json()["effectivePermissionCodes"]
        assert "catalog.read" not in limited_session.json()["effectivePermissionCodes"]
        limited_matrix_role = next(
            role for role in reloaded.json()["roles"] if UUID(role["id"]) == limited_role_id
        )
        denied = client.put(
            f"/api/v1/roles/{limited_role_id}/permissions",
            headers=limited_headers,
            json={
                "permissionIds": [
                    permission_by_code["role.manage"]["id"],
                    permission_by_code["catalog.read"]["id"],
                ],
                "version": limited_matrix_role["version"],
            },
        )
        assert denied.status_code == 403
        assert denied.json()["message"] == "No puedes conceder permisos que tú no posees."
    finally:
        with session_scope() as session:
            catalog = session.scalar(
                select(ModuleDefinition).where(ModuleDefinition.code == "catalog")
            )
            assert catalog is not None
            catalog_entitlement = session.scalar(
                select(ModuleEntitlement).where(
                    ModuleEntitlement.workspace_id == workspace_id,
                    ModuleEntitlement.module_definition_id == catalog.id,
                )
            )
            assert catalog_entitlement is not None
            catalog_entitlement.status = "enabled"


@pytest.mark.integration
def test_phase0_auth_session_membership_identity_constraint_is_active() -> None:
    _bootstrap()
    factory = get_session_factory()
    with factory() as session:
        owner_membership = session.scalar(
            select(WorkspaceMembership).where(WorkspaceMembership.is_default.is_(True))
        )
        assert owner_membership is not None
        other_user = PlatformUser(
            external_subject=f"constraint-test:{uuid7()}",
            email=f"constraint-{uuid7()}@example.com",
            normalized_email=f"constraint-{uuid7()}@example.com",
            display_name="Constraint Test",
            status="active",
        )
        session.add(other_user)
        session.flush()
        session.add(
            AuthSession(
                platform_user_id=other_user.id,
                workspace_id=owner_membership.workspace_id,
                membership_id=owner_membership.id,
                refresh_token_hash="a" * 64,
                expires_at=datetime.now(UTC) + timedelta(days=1),
            )
        )
        with pytest.raises(IntegrityError):
            session.flush()
        session.rollback()
