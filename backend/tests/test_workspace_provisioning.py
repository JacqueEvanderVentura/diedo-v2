from decimal import Decimal
from uuid import UUID, uuid7

import pytest
from app.api.routers import backoffice
from app.config import Settings, settings
from app.db.models import (
    AccessScope,
    AuditEntry,
    Branch,
    LegalEntity,
    ModuleEntitlement,
    Permission,
    PlatformUser,
    Role,
    RoleAssignment,
    RolePermission,
    Workspace,
    WorkspaceMembership,
)
from app.db.session import session_scope
from app.schemas.backoffice import CreateWorkspaceRequest
from app.services.local_bootstrap import bootstrap_local_foundation
from app.services.workspace_provisioning import ProvisionedOwner, ProvisionedWorkspace
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError
from sqlalchemy import func, select

_BACKOFFICE_KEY = "test-backoffice-key-with-at-least-32-characters"
_OWNER_PASSWORD = "owner-password-not-a-production-secret"


def _payload(*, slug: str = "grupo-persona-b", email: str = "persona-b@example.com") -> dict:
    return {
        "slug": slug,
        "name": "  Empresas   de Persona B ",
        "defaultCurrency": "bob",
        "timezone": "America/La_Paz",
        "locale": "es-bo",
        "taxDefaultRate": "13.00",
        "owner": {
            "email": email,
            "displayName": "  Persona   B ",
            "password": _OWNER_PASSWORD,
        },
    }


def test_provisioning_schema_normalizes_workspace_fields() -> None:
    payload = CreateWorkspaceRequest.model_validate(_payload(slug="Grupo-Persona-B"))

    assert payload.slug == "grupo-persona-b"
    assert payload.name == "Empresas de Persona B"
    assert payload.default_currency == "BOB"
    assert payload.locale == "es-BO"
    assert payload.tax_default_rate == Decimal("13.00")
    assert payload.owner.display_name == "Persona B"


def test_provisioning_schema_rejects_invalid_slug_timezone_and_extra_fields() -> None:
    invalid_slug = _payload(slug="persona b")
    with pytest.raises(ValidationError):
        CreateWorkspaceRequest.model_validate(invalid_slug)

    invalid_timezone = _payload()
    invalid_timezone["timezone"] = "Not/A-Timezone"
    with pytest.raises(ValidationError):
        CreateWorkspaceRequest.model_validate(invalid_timezone)

    blank_name = _payload()
    blank_name["name"] = "   "
    with pytest.raises(ValidationError):
        CreateWorkspaceRequest.model_validate(blank_name)

    extra_field = _payload()
    extra_field["owner"]["role"] = "admin"
    with pytest.raises(ValidationError):
        CreateWorkspaceRequest.model_validate(extra_field)


def test_settings_reject_short_or_placeholder_backoffice_keys() -> None:
    with pytest.raises(ValidationError):
        Settings(backoffice_api_key="too-short", _env_file=None)
    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            jwt_secret_key="a-production-secret-with-at-least-32-characters",
            backoffice_api_key="replace-with-a-long-placeholder-backoffice-key",
            _env_file=None,
        )


def test_backoffice_route_is_disabled_without_a_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(backoffice.settings, "backoffice_api_key", None)

    response = client.post("/api/v1/backoffice/workspaces", json=_payload())

    assert response.status_code == 503
    assert response.json() == {
        "message": "El aprovisionamiento de workspaces no está habilitado.",
        "parameter": None,
    }


def test_backoffice_route_rejects_an_invalid_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(backoffice.settings, "backoffice_api_key", SecretStr(_BACKOFFICE_KEY))

    response = client.post(
        "/api/v1/backoffice/workspaces",
        headers={"X-Backoffice-Key": "wrong-key"},
        json=_payload(),
    )

    assert response.status_code == 401
    assert response.json()["parameter"] == "X-Backoffice-Key"


def test_backoffice_route_does_not_echo_secrets(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid7()
    user_id = uuid7()
    membership_id = uuid7()
    role_id = uuid7()
    monkeypatch.setattr(backoffice.settings, "backoffice_api_key", SecretStr(_BACKOFFICE_KEY))

    def fake_provision(self: object, **values: object) -> ProvisionedWorkspace:
        del self
        assert values["owner_password"] == _OWNER_PASSWORD
        return ProvisionedWorkspace(
            workspace_id=workspace_id,
            slug="grupo-persona-b",
            name="Empresas de Persona B",
            owner=ProvisionedOwner(
                user_id=user_id,
                membership_id=membership_id,
                email="persona-b@example.com",
                display_name="Persona B",
                existing_identity=False,
                is_default_workspace=True,
            ),
            administrator_role_id=role_id,
            enabled_modules=("foundation", "iam"),
        )

    monkeypatch.setattr(backoffice.WorkspaceProvisioningService, "provision", fake_provision)
    response = client.post(
        "/api/v1/backoffice/workspaces",
        headers={"X-Backoffice-Key": _BACKOFFICE_KEY},
        json=_payload(),
    )

    assert response.status_code == 201
    assert response.json()["workspaceId"] == str(workspace_id)
    assert response.json()["owner"]["existingIdentity"] is False
    assert _OWNER_PASSWORD not in response.text
    assert _BACKOFFICE_KEY not in response.text


def test_openapi_marks_provisioning_route_with_its_own_api_key(client: TestClient) -> None:
    schema = client.get("/swagger.json").json()

    operation = schema["paths"]["/api/v1/backoffice/workspaces"]["post"]
    assert operation["security"] == [{"BackofficeKey": []}]
    scheme = schema["components"]["securitySchemes"]["BackofficeKey"]
    assert scheme["type"] == "apiKey"
    assert scheme["in"] == "header"
    assert scheme["name"] == "X-Backoffice-Key"


@pytest.mark.integration
def test_provisioning_creates_an_isolated_ready_workspace(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with session_scope() as database:
        bootstrap_local_foundation(database)

    suffix = str(uuid7()).replace("-", "")[:16]
    slug = f"grupo-{suffix}"
    owner_email = f"owner-{suffix}@example.com"
    monkeypatch.setattr(settings, "backoffice_api_key", SecretStr(_BACKOFFICE_KEY))
    response = client.post(
        "/api/v1/backoffice/workspaces",
        headers={"X-Backoffice-Key": _BACKOFFICE_KEY},
        json=_payload(slug=slug, email=owner_email),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    workspace_id = UUID(body["workspaceId"])
    membership_id = UUID(body["owner"]["membershipId"])

    with session_scope() as database:
        workspace = database.get(Workspace, workspace_id)
        owner = database.scalar(
            select(PlatformUser).where(PlatformUser.normalized_email == owner_email)
        )
        membership = database.get(WorkspaceMembership, membership_id)
        admin_role = database.scalar(
            select(Role).where(
                Role.workspace_id == workspace_id,
                Role.code == "workspace_admin",
            )
        )
        assert workspace is not None
        assert workspace.slug == slug
        assert workspace.default_currency == "BOB"
        assert owner is not None
        assert membership is not None
        assert membership.platform_user_id == owner.id
        assert membership.status == "active"
        assert membership.is_default is True
        assert admin_role is not None
        assert (
            database.scalar(
                select(func.count()).select_from(Role).where(Role.workspace_id == workspace_id)
            )
            == 5
        )
        assert (
            database.scalar(
                select(func.count())
                .select_from(AccessScope)
                .where(
                    AccessScope.workspace_id == workspace_id,
                    AccessScope.scope_type == "workspace",
                )
            )
            == 1
        )
        assert (
            database.scalar(
                select(func.count())
                .select_from(RoleAssignment)
                .where(
                    RoleAssignment.workspace_id == workspace_id,
                    RoleAssignment.membership_id == membership_id,
                    RoleAssignment.role_id == admin_role.id,
                )
            )
            == 1
        )
        admin_permission_count = database.scalar(
            select(func.count())
            .select_from(RolePermission)
            .where(
                RolePermission.workspace_id == workspace_id,
                RolePermission.role_id == admin_role.id,
            )
        )
        global_permission_count = database.scalar(
            select(func.count())
            .select_from(Permission)
            .where(Permission.is_platform_only.is_(False))
        )
        assert admin_permission_count == global_permission_count
        assert database.scalar(
            select(func.count())
            .select_from(ModuleEntitlement)
            .where(
                ModuleEntitlement.workspace_id == workspace_id,
                ModuleEntitlement.status == "enabled",
            )
        ) == len(body["enabledModules"])
        assert (
            database.scalar(
                select(func.count())
                .select_from(LegalEntity)
                .where(LegalEntity.workspace_id == workspace_id)
            )
            == 0
        )
        assert (
            database.scalar(
                select(func.count()).select_from(Branch).where(Branch.workspace_id == workspace_id)
            )
            == 0
        )
        audit = database.scalar(
            select(AuditEntry).where(
                AuditEntry.workspace_id == workspace_id,
                AuditEntry.action == "workspace.provision",
            )
        )
        assert audit is not None
        assert audit.actor_platform_user_id is None

    login = client.post(
        "/api/v1/auth/login",
        json={"email": owner_email, "password": _OWNER_PASSWORD},
    )
    assert login.status_code == 200, login.text
    access_token = login.json()["accessToken"]
    context = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert context.status_code == 200, context.text
    assert UUID(context.json()["workspaceId"]) == workspace_id
    assert context.json()["effectiveScope"]["workspaceWide"] is True
    assert "branch.manage" in context.json()["effectivePermissionCodes"]
    assert context.json()["visibleBranches"] == []

    branch = client.post(
        "/api/v1/branches",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "legalEntityAssignment": {
                "type": "new",
                "fiscalProfile": {
                    "legalName": "CHARM, SRL",
                    "displayName": "CHARM",
                    "taxIdentity": {
                        "jurisdictionCode": "DO",
                        "identifierType": "RNC",
                        "identifierValue": str(uuid7().int)[-9:],
                    },
                },
            },
            "code": "CHARM-HQ",
            "name": "CHARM Principal",
            "timezone": "America/Santo_Domingo",
            "details": {"independentBusiness": True},
        },
    )
    assert branch.status_code == 201, branch.text
    assert branch.json()["details"]["independentBusiness"] is True

    duplicate = client.post(
        "/api/v1/backoffice/workspaces",
        headers={"X-Backoffice-Key": _BACKOFFICE_KEY},
        json=_payload(slug=slug, email=f"another-{suffix}@example.com"),
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["parameter"] == "slug"


@pytest.mark.integration
def test_existing_owner_can_receive_another_workspace_without_password(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with session_scope() as database:
        bootstrap_local_foundation(database)

    suffix = str(uuid7()).replace("-", "")[:16]
    first_slug = f"first-{suffix}"
    second_slug = f"second-{suffix}"
    owner_email = f"multi-{suffix}@example.com"
    monkeypatch.setattr(settings, "backoffice_api_key", SecretStr(_BACKOFFICE_KEY))
    first = client.post(
        "/api/v1/backoffice/workspaces",
        headers={"X-Backoffice-Key": _BACKOFFICE_KEY},
        json=_payload(slug=first_slug, email=owner_email),
    )
    assert first.status_code == 201, first.text

    second_payload = _payload(slug=second_slug, email=owner_email)
    del second_payload["owner"]["password"]
    second = client.post(
        "/api/v1/backoffice/workspaces",
        headers={"X-Backoffice-Key": _BACKOFFICE_KEY},
        json=second_payload,
    )
    assert second.status_code == 201, second.text
    assert second.json()["owner"]["existingIdentity"] is True
    assert second.json()["owner"]["isDefaultWorkspace"] is False

    login = client.post(
        "/api/v1/auth/login",
        json={"email": owner_email, "password": _OWNER_PASSWORD},
    )
    assert login.status_code == 200
    workspaces = client.get(
        "/api/v1/auth/workspaces",
        headers={"Authorization": f"Bearer {login.json()['accessToken']}"},
    )
    assert workspaces.status_code == 200
    assert {item["slug"] for item in workspaces.json()} >= {first_slug, second_slug}
