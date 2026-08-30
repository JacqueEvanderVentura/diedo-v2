from types import SimpleNamespace
from uuid import uuid7

import app.main as main_module
import pytest
from app.api.routers.development import foundation_status
from app.db.models import (
    AccessScope,
    Branch,
    LegalEntity,
    Permission,
    Role,
    RolePermission,
    Workspace,
)
from app.db.session import get_engine, session_scope
from app.scripts import bootstrap_local as bootstrap_script
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session


@pytest.mark.integration
def test_local_bootstrap_is_idempotent_and_installs_minimum_access_model() -> None:
    with session_scope() as session:
        first = bootstrap_local_foundation(session)

    with session_scope() as session:
        second = bootstrap_local_foundation(session)
        permission_count = session.scalar(select(func.count()).select_from(Permission))
        assigned_permission_count = session.scalar(
            select(func.count())
            .select_from(RolePermission)
            .join(
                Role,
                (Role.workspace_id == RolePermission.workspace_id)
                & (Role.id == RolePermission.role_id),
            )
            .where(
                RolePermission.workspace_id == second.workspace_id,
                Role.code == "workspace_admin",
            )
        )

    assert second == first
    assert second.enabled_modules == ("foundation", "iam", "catalog", "crm", "hr")
    assert permission_count == 28
    assert assigned_permission_count == permission_count
    assert second.workspace_id.version == 7


@pytest.mark.integration
def test_database_rejects_cross_workspace_branch_reference() -> None:
    connection = get_engine().connect()
    transaction = connection.begin()
    try:
        with Session(bind=connection, expire_on_commit=False) as session:
            first_workspace = Workspace(
                slug=f"test-{uuid7()}",
                name="First workspace",
                status="active",
                default_currency="DOP",
                timezone="America/Santo_Domingo",
                locale="es-DO",
            )
            second_workspace = Workspace(
                slug=f"test-{uuid7()}",
                name="Second workspace",
                status="active",
                default_currency="DOP",
                timezone="America/Santo_Domingo",
                locale="es-DO",
            )
            session.add_all([first_workspace, second_workspace])
            session.flush()

            legal_entity = LegalEntity(
                workspace_id=first_workspace.id,
                code="MAIN",
                legal_name="First Company",
                status="active",
            )
            session.add(legal_entity)
            session.flush()

            with pytest.raises(IntegrityError):
                with session.begin_nested():
                    session.add(
                        Branch(
                            workspace_id=second_workspace.id,
                            legal_entity_id=legal_entity.id,
                            code="INVALID",
                            name="Cross-workspace branch",
                            status="active",
                            timezone="America/Santo_Domingo",
                        )
                    )
                    session.flush()
    finally:
        transaction.rollback()
        connection.close()


@pytest.mark.integration
def test_database_rejects_access_scope_with_invalid_target_shape() -> None:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)

    connection = get_engine().connect()
    transaction = connection.begin()
    try:
        with Session(bind=connection) as session:
            with pytest.raises(IntegrityError):
                with session.begin_nested():
                    session.add(
                        AccessScope(
                            workspace_id=summary.workspace_id,
                            scope_type="branch",
                            legal_entity_id=None,
                            branch_id=None,
                        )
                    )
                    session.flush()
    finally:
        transaction.rollback()
        connection.close()


@pytest.mark.integration
def test_development_foundation_endpoint_reports_seeded_database(client: TestClient) -> None:
    with session_scope() as session:
        bootstrap_local_foundation(session)

    response = client.get("/dev/foundation")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["database"] == "ok"
    assert body["workspaceCount"] >= 1
    assert body["legalEntityCount"] >= 1
    assert body["branchCount"] >= 1
    assert body["activeMembershipCount"] >= 1
    assert body["enabledModules"] == ["catalog", "crm", "foundation", "hr", "iam"]


def test_foundation_endpoint_returns_service_unavailable_on_query_failure() -> None:
    class FailingSession:
        def scalars(self, _statement):
            raise OperationalError("SELECT", {}, RuntimeError("offline"))

    with pytest.raises(HTTPException) as captured:
        foundation_status(FailingSession())  # type: ignore[arg-type]

    assert captured.value.status_code == 503
    assert captured.value.detail["message"] == ("La base de datos fundacional no esta disponible.")


def test_development_endpoint_is_not_registered_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(main_module.settings, "app_env", "production")

    production_app = main_module.create_app()

    paths = {route.path for route in production_app.routes if hasattr(route, "path")}
    assert "/dev/foundation" not in paths


@pytest.mark.integration
def test_bootstrap_cli_emits_machine_readable_summary(
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        bootstrap_script,
        "settings",
        SimpleNamespace(app_env="development", local_bootstrap_admin_password=None),
    )
    bootstrap_script.main()

    output = capsys.readouterr().out
    assert '"workspace_id"' in output
    assert '"enabled_modules"' in output


def test_bootstrap_cli_is_disabled_outside_local_environments(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        bootstrap_script,
        "settings",
        SimpleNamespace(app_env="production"),
    )

    with pytest.raises(RuntimeError, match="disabled outside development and test"):
        bootstrap_script.main()
