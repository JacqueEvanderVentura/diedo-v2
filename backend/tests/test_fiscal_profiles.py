import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from threading import Event
from uuid import UUID, uuid7

import pytest
from app.core.security import hash_password
from app.db.models import (
    AccessScope,
    AuditEntry,
    Branch,
    LegalEntity,
    LegalEntityIdentity,
    Permission,
    PlatformUser,
    Role,
    RoleAssignment,
    RolePermission,
    Workspace,
    WorkspaceMembership,
)
from app.db.session import get_session_factory, session_scope
from app.main import app
from app.services.administration import AdministrationService
from app.services.authorization import PermissionGrant
from app.services.errors import ConflictError
from app.services.local_bootstrap import BootstrapSummary, bootstrap_local_foundation
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "phase-one-owner-password-not-a-secret"


def test_fiscal_and_branch_assignment_openapi_contract() -> None:
    schema = app.openapi()
    paths = schema["paths"]
    assert {"get", "post"}.issubset(paths["/api/v1/legal-entities"])
    assert {"get", "patch"}.issubset(paths["/api/v1/legal-entities/{legal_entity_id}"])
    assert "put" in paths["/api/v1/legal-entities/{legal_entity_id}/fiscal-profile"]
    assert "post" in paths["/api/v1/branches"]
    assert "put" in paths["/api/v1/branches/{branch_id}/legal-entity-assignment"]

    components = schema["components"]["schemas"]
    assignment_schema = components["CreateBranchRequest"]["properties"]["legalEntityAssignment"][
        "anyOf"
    ][0]
    assert assignment_schema["discriminator"] == {
        "propertyName": "type",
        "mapping": {
            "existing": "#/components/schemas/ExistingLegalEntityAssignment",
            "new": "#/components/schemas/NewLegalEntityAssignment",
        },
    }
    assert "affectedBranchIds" in components["FiscalProfileUpdateResponse"]["required"]


def _bootstrap() -> BootstrapSummary:
    with session_scope() as session:
        return bootstrap_local_foundation(session, hash_password(_OWNER_PASSWORD))


def _headers(
    client: TestClient,
    email: str = _OWNER_EMAIL,
    password: str = _OWNER_PASSWORD,
) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


def _create_branch_scoped_manager(
    workspace_id: UUID,
    access_scope_id: UUID,
) -> tuple[str, str, UUID]:
    suffix = uuid7().hex
    email = f"fiscal-scope-{suffix}@example.com"
    password = "branch-scoped-fiscal-password"
    now = datetime.now(UTC)
    with session_scope() as session:
        permissions = list(
            session.scalars(
                select(Permission).where(
                    Permission.code.in_(
                        {"branch.manage", "legal_entity.manage", "legal_entity.read"}
                    )
                )
            )
        )
        assert {permission.code for permission in permissions} == {
            "branch.manage",
            "legal_entity.manage",
            "legal_entity.read",
        }
        user = PlatformUser(
            external_subject=f"local:fiscal-scope:{suffix}",
            email=email,
            normalized_email=email.casefold(),
            display_name="Gestor fiscal acotado",
            password_hash=hash_password(password),
            status="active",
        )
        session.add(user)
        session.flush()
        membership = WorkspaceMembership(
            workspace_id=workspace_id,
            platform_user_id=user.id,
            status="active",
            activated_at=now,
            is_default=True,
        )
        role = Role(
            workspace_id=workspace_id,
            code=f"fiscal_scope_{suffix[:20]}",
            name="Gestor fiscal acotado",
            status="active",
            is_system=False,
        )
        session.add_all([membership, role])
        session.flush()
        session.add_all(
            RolePermission(
                workspace_id=workspace_id,
                role_id=role.id,
                permission_id=permission.id,
            )
            for permission in permissions
        )
        assignment = RoleAssignment(
            workspace_id=workspace_id,
            membership_id=membership.id,
            role_id=role.id,
            access_scope_id=access_scope_id,
            status="active",
            valid_from=now,
        )
        session.add(assignment)
        session.flush()
        return email, password, assignment.id


def _rnc() -> str:
    return str(uuid7().int % 1_000_000_000).zfill(9)


def _create_legal_entity(workspace_id: UUID) -> LegalEntity:
    suffix = uuid7().hex[:16].upper()
    with session_scope() as session:
        entity = LegalEntity(
            workspace_id=workspace_id,
            code=f"FT{suffix}",
            legal_name=f"Entidad Fiscal {suffix}",
            display_name=None,
            status="active",
        )
        session.add(entity)
        session.flush()
        session.expunge(entity)
        return entity


def _create_branch(
    client: TestClient,
    headers: dict[str, str],
    legal_entity_id: UUID,
    *,
    address: str,
    phone: str,
) -> dict[str, object]:
    suffix = uuid7().hex[:14].upper()
    response = client.post(
        "/api/v1/branches",
        headers=headers,
        json={
            "legalEntityId": str(legal_entity_id),
            "code": f"FB{suffix}",
            "name": f"Sucursal Fiscal {suffix}",
            "timezone": "America/Santo_Domingo",
            "details": {
                "address": address,
                "phone": phone,
                "manager": "Gerencia Fiscal",
                "schedule": "L-V 08:00-17:00",
            },
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.integration
def test_fiscal_profile_http_history_uniqueness_and_branch_patch_merge(
    client: TestClient,
) -> None:
    foundation = _bootstrap()
    headers = _headers(client)
    entity = _create_legal_entity(foundation.workspace_id)
    first_branch = _create_branch(
        client,
        headers,
        entity.id,
        address="Av. Inicial 10",
        phone="809-555-0101",
    )

    listed = client.get("/api/v1/legal-entities", headers=headers)
    assert listed.status_code == 200, listed.text
    listed_entity = next(item for item in listed.json() if item["id"] == str(entity.id))
    assert listed_entity["taxIdentity"] is None
    assert listed_entity["sharing"] == {"branchCount": 1, "shared": False}
    assert [branch["id"] for branch in listed_entity["branches"]] == [first_branch["id"]]

    divergent_legacy_write = client.patch(
        f"/api/v1/legal-entities/{entity.id}",
        headers=headers,
        json={
            "legalName": "Esta ruta no puede cambiar la razón social",
            "version": listed_entity["version"],
        },
    )
    assert divergent_legacy_write.status_code == 400
    assert divergent_legacy_write.json()["parameter"] == "legalName"

    first_rnc = _rnc()
    effective_date = datetime.now(UTC).date().isoformat()
    created_profile = client.put(
        f"/api/v1/legal-entities/{entity.id}/fiscal-profile",
        headers=headers,
        json={
            "legalName": "Entidad Fiscal Dominicana, SRL",
            "displayName": "Entidad Fiscal",
            "taxIdentity": {
                "jurisdictionCode": "DO",
                "identifierType": "RNC",
                "identifierValue": f"{first_rnc[:3]}-{first_rnc[3:5]}-{first_rnc[5:]}",
            },
            "effectiveFrom": effective_date,
            "version": listed_entity["version"],
        },
    )
    assert created_profile.status_code == 200, created_profile.text
    first_profile = created_profile.json()
    assert first_profile["taxIdentity"]["identifierValue"] == first_rnc
    assert first_profile["taxIdentity"]["validFrom"] == effective_date
    assert first_profile["affectedBranchIds"] == [first_branch["id"]]

    second_branch = _create_branch(
        client,
        headers,
        entity.id,
        address="Calle Segunda 20",
        phone="809-555-0202",
    )
    shared_profile = client.get(
        f"/api/v1/legal-entities/{entity.id}",
        headers=headers,
    )
    assert shared_profile.status_code == 200
    assert shared_profile.json()["sharing"] == {"branchCount": 2, "shared": True}

    patched_branch = client.patch(
        f"/api/v1/branches/{second_branch['id']}",
        headers=headers,
        json={
            "details": {"address": "Calle Segunda 99"},
            "version": second_branch["version"],
        },
    )
    assert patched_branch.status_code == 200, patched_branch.text
    patched_details = patched_branch.json()["details"]
    assert patched_details["address"] == "Calle Segunda 99"
    assert patched_details["phone"] == "809-555-0202"
    assert patched_details["manager"] == "Gerencia Fiscal"
    assert patched_details["schedule"] == "L-V 08:00-17:00"

    second_rnc = _rnc()
    replaced_profile = client.put(
        f"/api/v1/legal-entities/{entity.id}/fiscal-profile",
        headers=headers,
        json={
            "legalName": "Entidad Fiscal Dominicana Renovada, SRL",
            "displayName": None,
            "taxIdentity": {
                "jurisdictionCode": "DO",
                "identifierType": "RNC",
                "identifierValue": second_rnc,
            },
            "effectiveFrom": effective_date,
            "version": shared_profile.json()["version"],
        },
    )
    assert replaced_profile.status_code == 200, replaced_profile.text
    replaced = replaced_profile.json()
    assert replaced["taxIdentity"]["identifierValue"] == second_rnc
    assert replaced["version"] == shared_profile.json()["version"] + 1
    assert set(replaced["affectedBranchIds"]) == {
        first_branch["id"],
        second_branch["id"],
    }

    stale = client.put(
        f"/api/v1/legal-entities/{entity.id}/fiscal-profile",
        headers=headers,
        json={
            "legalName": "Cambio obsoleto, SRL",
            "displayName": None,
            "taxIdentity": None,
            "version": first_profile["version"],
        },
    )
    assert stale.status_code == 409
    assert stale.json()["parameter"] == "version"

    duplicate_entity = _create_legal_entity(foundation.workspace_id)
    duplicate = client.put(
        f"/api/v1/legal-entities/{duplicate_entity.id}/fiscal-profile",
        headers=headers,
        json={
            "legalName": "Entidad con RNC repetido, SRL",
            "displayName": None,
            "taxIdentity": {
                "jurisdictionCode": "DO",
                "identifierType": "RNC",
                "identifierValue": second_rnc,
            },
            "version": duplicate_entity.version,
        },
    )
    assert duplicate.status_code == 409, duplicate.text
    assert duplicate.json()["parameter"] == "taxIdentity.identifierValue"

    invalid_rnc = client.put(
        f"/api/v1/legal-entities/{duplicate_entity.id}/fiscal-profile",
        headers=headers,
        json={
            "legalName": "Entidad con RNC inválido, SRL",
            "displayName": None,
            "taxIdentity": {
                "jurisdictionCode": "DO",
                "identifierType": "RNC",
                "identifierValue": "1234A6789",
            },
            "version": duplicate_entity.version,
        },
    )
    assert invalid_rnc.status_code == 400
    assert invalid_rnc.json()["parameter"] == "taxIdentity.identifierValue"

    with session_scope() as session:
        identities = list(
            session.scalars(
                select(LegalEntityIdentity)
                .where(LegalEntityIdentity.legal_entity_id == entity.id)
                .order_by(LegalEntityIdentity.created_at, LegalEntityIdentity.id)
            )
        )
        assert len(identities) == 2
        assert identities[0].identifier_value == first_rnc
        assert identities[0].valid_to == datetime.now(UTC).date()
        assert identities[1].identifier_value == second_rnc
        assert identities[1].valid_to is None

        audits = list(
            session.scalars(
                select(AuditEntry).where(
                    AuditEntry.target_id == entity.id,
                    AuditEntry.action == "legal_entity.fiscal_profile.update",
                )
            )
        )
        assert len(audits) == 2
        serialized_audit = json.dumps([entry.details for entry in audits], sort_keys=True)
        assert first_rnc not in serialized_audit
        assert second_rnc not in serialized_audit

        branch_scope = session.scalar(
            select(AccessScope).where(
                AccessScope.workspace_id == foundation.workspace_id,
                AccessScope.scope_type == "branch",
                AccessScope.branch_id == UUID(str(first_branch["id"])),
            )
        )
        assert branch_scope is not None
        assert branch_scope.legal_entity_id == entity.id


@pytest.mark.integration
def test_create_independent_branch_is_atomic_and_legacy_contract_stays_compatible(
    client: TestClient,
) -> None:
    foundation = _bootstrap()
    headers = _headers(client)
    standalone_rnc = _rnc()
    standalone = client.post(
        "/api/v1/legal-entities",
        headers=headers,
        json={
            "code": f"LE{uuid7().hex[:14].upper()}",
            "legalName": "Entidad Fiscal sin Sucursal, SRL",
            "displayName": "Entidad sin sucursal",
            "taxIdentity": {
                "jurisdictionCode": "DO",
                "identifierType": "RNC",
                "identifierValue": standalone_rnc,
            },
        },
    )
    assert standalone.status_code == 201, standalone.text
    assert standalone.json()["taxIdentity"]["identifierValue"] == standalone_rnc
    assert standalone.json()["sharing"] == {"branchCount": 0, "shared": False}
    assert standalone.json()["branches"] == []
    with session_scope() as session:
        standalone_audit = session.scalar(
            select(AuditEntry).where(
                AuditEntry.target_id == UUID(standalone.json()["id"]),
                AuditEntry.action == "legal_entity.create",
            )
        )
        assert standalone_audit is not None
        assert standalone_rnc not in json.dumps(standalone_audit.details, sort_keys=True)

    with session_scope() as session:
        entity_count_before = session.scalar(
            select(func.count(LegalEntity.id)).where(
                LegalEntity.workspace_id == foundation.workspace_id
            )
        )
        branch_count_before = session.scalar(
            select(func.count(Branch.id)).where(Branch.workspace_id == foundation.workspace_id)
        )

    created_rnc = _rnc()
    branch_code = f"IN{uuid7().hex[:14].upper()}"
    created = client.post(
        "/api/v1/branches",
        headers=headers,
        json={
            "legalEntityAssignment": {
                "type": "new",
                "fiscalProfile": {
                    "legalName": "Sucursal Independiente Atómica, SRL",
                    "displayName": "Sucursal Independiente",
                    "taxIdentity": {
                        "jurisdictionCode": "DO",
                        "identifierType": "RNC",
                        "identifierValue": created_rnc,
                    },
                },
            },
            "code": branch_code,
            "name": "Sucursal Independiente Atómica",
            "timezone": "America/Santo_Domingo",
            "details": {
                "address": "Independiente 100",
                "phone": "809-555-0505",
                "independentBusiness": False,
            },
        },
    )
    assert created.status_code == 201, created.text
    created_branch = created.json()
    created_branch_id = UUID(created_branch["id"])
    created_entity_id = UUID(created_branch["legalEntityId"])
    assert created_branch["details"]["independentBusiness"] is True

    fiscal_profile = client.get(
        f"/api/v1/legal-entities/{created_entity_id}",
        headers=headers,
    )
    assert fiscal_profile.status_code == 200, fiscal_profile.text
    assert fiscal_profile.json()["taxIdentity"]["identifierValue"] == created_rnc
    assert fiscal_profile.json()["sharing"] == {"branchCount": 1, "shared": False}

    with session_scope() as session:
        assert (
            session.scalar(
                select(func.count(LegalEntity.id)).where(
                    LegalEntity.workspace_id == foundation.workspace_id
                )
            )
            == entity_count_before + 1
        )
        assert (
            session.scalar(
                select(func.count(Branch.id)).where(Branch.workspace_id == foundation.workspace_id)
            )
            == branch_count_before + 1
        )
        scopes = list(
            session.scalars(
                select(AccessScope).where(
                    AccessScope.workspace_id == foundation.workspace_id,
                    AccessScope.legal_entity_id == created_entity_id,
                )
            )
        )
        assert {scope.scope_type for scope in scopes} == {"legal_entity", "branch"}
        audit = session.scalar(
            select(AuditEntry).where(
                AuditEntry.target_id == created_branch_id,
                AuditEntry.action == "branch.create",
            )
        )
        assert audit is not None
        assert created_rnc not in json.dumps(audit.details, sort_keys=True)

    rollback_code = f"RB{uuid7().hex[:14].upper()}"
    duplicate = client.post(
        "/api/v1/branches",
        headers=headers,
        json={
            "legalEntityAssignment": {
                "type": "new",
                "fiscalProfile": {
                    "legalName": "Sucursal Revertida, SRL",
                    "displayName": None,
                    "taxIdentity": {
                        "jurisdictionCode": "DO",
                        "identifierType": "RNC",
                        "identifierValue": created_rnc,
                    },
                },
            },
            "code": rollback_code,
            "name": "Sucursal que debe revertirse",
            "timezone": "America/Santo_Domingo",
        },
    )
    assert duplicate.status_code == 409, duplicate.text
    assert (
        duplicate.json()["parameter"]
        == "legalEntityAssignment.fiscalProfile.taxIdentity.identifierValue"
    )
    with session_scope() as session:
        assert (
            session.scalar(
                select(func.count(LegalEntity.id)).where(
                    LegalEntity.workspace_id == foundation.workspace_id
                )
            )
            == entity_count_before + 1
        )
        assert (
            session.scalar(
                select(func.count(Branch.id)).where(Branch.workspace_id == foundation.workspace_id)
            )
            == branch_count_before + 1
        )
        assert (
            session.scalar(
                select(Branch).where(
                    Branch.workspace_id == foundation.workspace_id,
                    Branch.code == rollback_code,
                )
            )
            is None
        )

    explicit_existing = client.post(
        "/api/v1/branches",
        headers=headers,
        json={
            "legalEntityAssignment": {
                "type": "existing",
                "legalEntityId": str(foundation.legal_entity_id),
            },
            "code": f"EX{uuid7().hex[:14].upper()}",
            "name": "Sucursal de entidad existente",
            "timezone": "America/Santo_Domingo",
            "details": {"independentBusiness": True},
        },
    )
    assert explicit_existing.status_code == 201, explicit_existing.text
    assert explicit_existing.json()["legalEntityId"] == str(foundation.legal_entity_id)
    assert explicit_existing.json()["details"]["independentBusiness"] is False

    ambiguous = client.post(
        "/api/v1/branches",
        headers=headers,
        json={
            "legalEntityId": str(foundation.legal_entity_id),
            "legalEntityAssignment": {
                "type": "existing",
                "legalEntityId": str(foundation.legal_entity_id),
            },
            "code": f"AM{uuid7().hex[:14].upper()}",
            "name": "Sucursal ambigua",
            "timezone": "America/Santo_Domingo",
        },
    )
    assert ambiguous.status_code == 400


@pytest.mark.integration
def test_branch_legal_entity_assignment_is_atomic_and_preserves_scope(
    client: TestClient,
) -> None:
    foundation = _bootstrap()
    headers = _headers(client)
    source_entity = _create_legal_entity(foundation.workspace_id)
    branch = _create_branch(
        client,
        headers,
        source_entity.id,
        address="Origen 1",
        phone="809-555-0303",
    )
    branch_id = UUID(str(branch["id"]))
    sibling_branch = _create_branch(
        client,
        headers,
        source_entity.id,
        address="Origen 2",
        phone="809-555-0304",
    )

    with session_scope() as session:
        original_scope = session.scalar(
            select(AccessScope).where(
                AccessScope.workspace_id == foundation.workspace_id,
                AccessScope.scope_type == "branch",
                AccessScope.branch_id == branch_id,
            )
        )
        assert original_scope is not None
        original_scope_id = original_scope.id
        entity_count_before = session.scalar(
            select(func.count(LegalEntity.id)).where(
                LegalEntity.workspace_id == foundation.workspace_id
            )
        )
        source_after_create = session.get(LegalEntity, source_entity.id)
        assert source_after_create is not None
        source_version_after_create = source_after_create.version
    scoped_email, scoped_password, scoped_assignment_id = _create_branch_scoped_manager(
        foundation.workspace_id,
        original_scope_id,
    )
    scoped_headers = _headers(client, scoped_email, scoped_password)
    scoped_entities = client.get("/api/v1/legal-entities", headers=scoped_headers)
    assert scoped_entities.status_code == 200, scoped_entities.text
    assert [item["id"] for item in scoped_entities.json()] == [str(source_entity.id)]
    assert [item["id"] for item in scoped_entities.json()[0]["branches"]] == [str(branch_id)]
    assert scoped_entities.json()[0]["sharing"] == {
        "branchCount": 1,
        "shared": False,
    }
    assert sibling_branch["id"] != str(branch_id)

    assigned_rnc = _rnc()
    assigned_new = client.put(
        f"/api/v1/branches/{branch_id}/legal-entity-assignment",
        headers=headers,
        json={
            "assignment": {
                "type": "new",
                "fiscalProfile": {
                    "legalName": "Negocio Independiente Fiscal, SRL",
                    "displayName": "Negocio Independiente",
                    "taxIdentity": {
                        "jurisdictionCode": "DO",
                        "identifierType": "RNC",
                        "identifierValue": assigned_rnc,
                    },
                },
            },
            "version": branch["version"],
        },
    )
    assert assigned_new.status_code == 200, assigned_new.text
    new_assignment = assigned_new.json()
    new_entity_id = UUID(new_assignment["legalEntity"]["id"])
    assert new_assignment["previousLegalEntityId"] == str(source_entity.id)
    assert new_assignment["branch"]["legalEntityId"] == str(new_entity_id)
    assert new_assignment["branch"]["details"]["independentBusiness"] is True
    assert new_assignment["legalEntity"]["code"].startswith("LE")
    assert len(new_assignment["legalEntity"]["code"]) == 32
    assert new_assignment["legalEntity"]["taxIdentity"]["identifierValue"] == assigned_rnc
    assert new_assignment["legalEntity"]["sharing"] == {"branchCount": 1, "shared": False}

    with session_scope() as session:
        moved_scope = session.scalar(select(AccessScope).where(AccessScope.id == original_scope_id))
        assert moved_scope is not None
        assert moved_scope.legal_entity_id == new_entity_id
        assert moved_scope.branch_id == branch_id
        moved_assignment = session.get(RoleAssignment, scoped_assignment_id)
        assert moved_assignment is not None
        assert moved_assignment.access_scope_id == original_scope_id
        updated_source = session.get(LegalEntity, source_entity.id)
        assert updated_source is not None
        assert updated_source.version == source_version_after_create + 1
        entity_count_after = session.scalar(
            select(func.count(LegalEntity.id)).where(
                LegalEntity.workspace_id == foundation.workspace_id
            )
        )
        assert entity_count_after == entity_count_before + 1
        first_audit = session.scalar(
            select(AuditEntry).where(
                AuditEntry.target_id == branch_id,
                AuditEntry.action == "branch.legal_entity_assignment.update",
            )
        )
        assert first_audit is not None
        assert assigned_rnc not in json.dumps(first_audit.details, sort_keys=True)

    scoped_me = client.get("/api/v1/auth/me", headers=scoped_headers)
    assert scoped_me.status_code == 200, scoped_me.text
    assert scoped_me.json()["effectiveScope"]["legalEntityIds"] == []
    assert scoped_me.json()["effectiveScope"]["branchIds"] == [str(branch_id)]
    assert [item["id"] for item in scoped_me.json()["visibleBranches"]] == [str(branch_id)]
    assert scoped_me.json()["visibleBranches"][0]["legalEntityId"] == str(new_entity_id)
    denied_scoped_assignment = client.put(
        f"/api/v1/branches/{branch_id}/legal-entity-assignment",
        headers=scoped_headers,
        json={
            "assignment": {
                "type": "existing",
                "legalEntityId": str(source_entity.id),
            },
            "version": new_assignment["branch"]["version"],
        },
    )
    assert denied_scoped_assignment.status_code == 403

    stale = client.put(
        f"/api/v1/branches/{branch_id}/legal-entity-assignment",
        headers=headers,
        json={
            "assignment": {
                "type": "existing",
                "legalEntityId": str(source_entity.id),
            },
            "version": branch["version"],
        },
    )
    assert stale.status_code == 409
    assert stale.json()["parameter"] == "version"

    rollback_source = _create_legal_entity(foundation.workspace_id)
    rollback_branch = _create_branch(
        client,
        headers,
        rollback_source.id,
        address="Rollback 1",
        phone="809-555-0404",
    )
    with session_scope() as session:
        rollback_count_before = session.scalar(
            select(func.count(LegalEntity.id)).where(
                LegalEntity.workspace_id == foundation.workspace_id
            )
        )
    duplicate_assignment = client.put(
        f"/api/v1/branches/{rollback_branch['id']}/legal-entity-assignment",
        headers=headers,
        json={
            "assignment": {
                "type": "new",
                "fiscalProfile": {
                    "legalName": "Entidad que debe revertirse, SRL",
                    "displayName": None,
                    "taxIdentity": {
                        "jurisdictionCode": "DO",
                        "identifierType": "RNC",
                        "identifierValue": assigned_rnc,
                    },
                },
            },
            "version": rollback_branch["version"],
        },
    )
    assert duplicate_assignment.status_code == 409, duplicate_assignment.text
    assert (
        duplicate_assignment.json()["parameter"]
        == "assignment.fiscalProfile.taxIdentity.identifierValue"
    )
    branches_after_rollback = client.get("/api/v1/branches", headers=headers)
    assert branches_after_rollback.status_code == 200
    unchanged_branch = next(
        item for item in branches_after_rollback.json() if item["id"] == rollback_branch["id"]
    )
    assert unchanged_branch["legalEntityId"] == str(rollback_source.id)
    assert unchanged_branch["version"] == rollback_branch["version"]
    with session_scope() as session:
        rollback_count_after = session.scalar(
            select(func.count(LegalEntity.id)).where(
                LegalEntity.workspace_id == foundation.workspace_id
            )
        )
        assert rollback_count_after == rollback_count_before
        rolled_back_audit = session.scalar(
            select(AuditEntry).where(
                AuditEntry.target_id == UUID(str(rollback_branch["id"])),
                AuditEntry.action == "branch.legal_entity_assignment.update",
            )
        )
        assert rolled_back_audit is None

    assigned_existing = client.put(
        f"/api/v1/branches/{branch_id}/legal-entity-assignment",
        headers=headers,
        json={
            "assignment": {
                "type": "existing",
                "legalEntityId": str(source_entity.id),
            },
            "version": new_assignment["branch"]["version"],
        },
    )
    assert assigned_existing.status_code == 200, assigned_existing.text
    existing_assignment = assigned_existing.json()
    assert existing_assignment["previousLegalEntityId"] == str(new_entity_id)
    assert existing_assignment["branch"]["legalEntityId"] == str(source_entity.id)
    assert existing_assignment["branch"]["details"]["independentBusiness"] is False
    with session_scope() as session:
        returned_scope = session.scalar(
            select(AccessScope).where(AccessScope.id == original_scope_id)
        )
        assert returned_scope is not None
        assert returned_scope.legal_entity_id == source_entity.id
        assignment_audits = list(
            session.scalars(
                select(AuditEntry).where(
                    AuditEntry.target_id == branch_id,
                    AuditEntry.action == "branch.legal_entity_assignment.update",
                )
            )
        )
        assert len(assignment_audits) == 2


def _create_branch_invariant_workspace(
    statuses: tuple[str, ...],
) -> tuple[UUID, list[tuple[UUID, int]]]:
    suffix = uuid7().hex
    with session_scope() as session:
        workspace = Workspace(
            slug=f"archive-race-{suffix}",
            name="Workspace archive race",
            status="active",
            default_currency="DOP",
            timezone="America/Santo_Domingo",
            locale="es-DO",
        )
        session.add(workspace)
        session.flush()
        entity = LegalEntity(
            workspace_id=workspace.id,
            code="ARCHIVE-RACE",
            legal_name="Archive Race, SRL",
            status="active",
        )
        session.add(entity)
        session.flush()
        branches = [
            Branch(
                workspace_id=workspace.id,
                legal_entity_id=entity.id,
                code=f"AR{index}",
                name=f"Archive race {index}",
                status=branch_status,
                timezone="America/Santo_Domingo",
            )
            for index, branch_status in enumerate(statuses, start=1)
        ]
        session.add_all(branches)
        session.flush()
        return workspace.id, [(branch.id, branch.version) for branch in branches]


@pytest.mark.integration
@pytest.mark.parametrize(
    ("first_operation", "second_operation", "expected_changed_status"),
    (
        pytest.param("archive", "archive", "archived", id="archive-vs-archive"),
        pytest.param("archive", "inactive", "archived", id="archive-vs-inactive"),
        pytest.param("inactive", "archive", "inactive", id="inactive-vs-archive"),
        pytest.param("inactive", "inactive", "inactive", id="inactive-vs-inactive"),
    ),
)
def test_concurrent_branch_removals_preserve_one_active_branch_per_workspace(
    first_operation: str,
    second_operation: str,
    expected_changed_status: str,
) -> None:
    workspace_id, branch_versions = _create_branch_invariant_workspace(("active", "active"))

    grant = PermissionGrant(
        permission_code="branch.manage",
        workspace_id=workspace_id,
        membership_id=uuid7(),
        allowed_legal_entity_ids=None,
        allowed_branch_ids=None,
    )
    first_counted = Event()
    release_first = Event()
    second_workspace_mutex_attempted = Event()
    second_counted = Event()

    def run_change(
        operation: str,
        branch_id: UUID,
        version: int,
        *,
        hold_after_count: bool,
    ) -> str:
        factory = get_session_factory()
        with factory() as session:
            service = AdministrationService(session)
            repository = service._repository
            original_count = repository.active_branch_count
            original_workspace_mutex = repository.get_workspace_no_key_update

            if hold_after_count:

                def controlled_count(target_workspace_id: UUID) -> int:
                    count = original_count(target_workspace_id)
                    assert count == 2
                    first_counted.set()
                    assert release_first.wait(timeout=5)
                    return count

                repository.active_branch_count = controlled_count  # type: ignore[method-assign]
            else:

                def tracked_workspace_mutex(
                    target_workspace_id: UUID,
                ) -> Workspace | None:
                    second_workspace_mutex_attempted.set()
                    return original_workspace_mutex(target_workspace_id)

                def tracked_count(target_workspace_id: UUID) -> int:
                    count = original_count(target_workspace_id)
                    second_counted.set()
                    return count

                repository.get_workspace_no_key_update = (  # type: ignore[method-assign]
                    tracked_workspace_mutex
                )
                repository.active_branch_count = tracked_count  # type: ignore[method-assign]

            try:
                if operation == "archive":
                    service.archive_branch(grant, branch_id, version)
                else:
                    service.update_branch(
                        grant,
                        branch_id,
                        version=version,
                        changes={"status": "inactive"},
                    )
            except ConflictError:
                session.rollback()
                return "conflict"
            return "changed"

    with ThreadPoolExecutor(max_workers=2) as executor:
        first_future = executor.submit(
            run_change,
            first_operation,
            *branch_versions[0],
            hold_after_count=True,
        )
        try:
            assert first_counted.wait(timeout=5)
            second_future = executor.submit(
                run_change,
                second_operation,
                *branch_versions[1],
                hold_after_count=False,
            )
            assert second_workspace_mutex_attempted.wait(timeout=5)
            assert not second_counted.is_set()
        finally:
            release_first.set()

        outcomes = {first_future.result(timeout=5), second_future.result(timeout=5)}

    assert outcomes == {"changed", "conflict"}
    assert second_counted.is_set()
    with session_scope() as session:
        statuses = list(
            session.scalars(
                select(Branch.status).where(Branch.workspace_id == workspace_id).order_by(Branch.id)
            )
        )
    assert sorted(statuses) == sorted(["active", expected_changed_status])


@pytest.mark.integration
def test_branch_patch_mutex_is_selective_and_reactivation_still_works() -> None:
    workspace_id, branch_versions = _create_branch_invariant_workspace(("active", "inactive"))
    grant = PermissionGrant(
        permission_code="branch.manage",
        workspace_id=workspace_id,
        membership_id=uuid7(),
        allowed_legal_entity_ids=None,
        allowed_branch_ids=None,
    )

    factory = get_session_factory()
    with factory() as session:
        service = AdministrationService(session)

        def unexpected_workspace_mutex(_workspace_id: UUID) -> Workspace | None:
            raise AssertionError("This PATCH must not take the branch-removal mutex.")

        service._repository.get_workspace_no_key_update = (  # type: ignore[method-assign]
            unexpected_workspace_mutex
        )
        renamed = service.update_branch(
            grant,
            branch_versions[0][0],
            version=branch_versions[0][1],
            changes={"name": "Sucursal renombrada"},
        )
        reactivated = service.update_branch(
            grant,
            branch_versions[1][0],
            version=branch_versions[1][1],
            changes={"status": "active"},
        )

    assert renamed.name == "Sucursal renombrada"
    assert reactivated.status == "active"


@pytest.mark.integration
def test_postgres_enforces_fiscal_identity_and_scope_constraints() -> None:
    foundation = _bootstrap()
    entity = _create_legal_entity(foundation.workspace_id)
    factory = get_session_factory()
    with factory() as session:
        session.add(
            LegalEntityIdentity(
                workspace_id=foundation.workspace_id,
                legal_entity_id=entity.id,
                registered_name=entity.legal_name,
                jurisdiction_code="DO",
                identifier_type="RNC",
                identifier_value="123",
                valid_from=datetime.now(UTC).date(),
                valid_to=None,
                is_primary=True,
            )
        )
        with pytest.raises(IntegrityError):
            session.flush()
        session.rollback()

    with session_scope() as session:
        update_action = session.execute(
            text(
                """
                SELECT confupdtype
                FROM pg_constraint
                WHERE conname = 'fk_access_scopes_workspace_entity_branch'
                """
            )
        ).scalar_one()
        assert update_action == "c"

        duplicate_current_indexes = session.execute(
            text(
                """
                SELECT count(*)
                FROM pg_indexes
                WHERE schemaname = current_schema()
                  AND indexname IN (
                    'uq_entity_identities_current_primary',
                    'uq_entity_identities_workspace_identifier'
                  )
                """
            )
        ).scalar_one()
        assert duplicate_current_indexes == 2
