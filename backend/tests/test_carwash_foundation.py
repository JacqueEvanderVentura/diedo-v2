from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from app.db.models import (
    CarwashCommission,
    CarwashSettlement,
    CarwashSettlementDetail,
    CarwashWash,
    CarwashWashLine,
    ModuleDefinition,
    ModuleEntitlement,
    Permission,
    Role,
    RolePermission,
)
from app.db.session import dispose_engine, session_scope
from app.services.errors import AuthorizationError
from app.services.local_bootstrap import bootstrap_local_foundation
from app.services.modules import ModuleAccessService
from app.services.subscription_plans import SubscriptionPlanRepository, WorkspaceEntitlementService
from sqlalchemy import delete, select

pytestmark = pytest.mark.integration

EXPECTED_CODES = {
    "carwash.read",
    "carwash.wash.manage",
    "carwash.wash.complete",
    "carwash.wash.void",
    "carwash.settings.manage",
    "carwash.commissions.read",
    "carwash.commissions.settle",
    "carwash.commissions.reverse",
    "carwash.reports.read",
}


def test_carwash_is_registered_but_not_enabled_by_bootstrap_or_plans() -> None:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        module = session.scalar(select(ModuleDefinition).where(ModuleDefinition.code == "carwash"))
        assert module is not None
        assert (module.kind, module.status, module.dependency_codes) == (
            "optional",
            "available",
            ["pos", "hr"],
        )
        assert "carwash" not in summary.enabled_modules
        assert "carwash" not in ModuleAccessService(session).enabled_modules(summary.workspace_id)
        codes = set(
            session.scalars(select(Permission.code).where(Permission.module_code == "carwash"))
        )
        assert codes == EXPECTED_CODES
        for plan in SubscriptionPlanRepository(session).list_plans():
            assert "carwash" not in plan.module_codes
        assigned = set(
            session.scalars(
                select(Permission.code)
                .join(RolePermission, RolePermission.permission_id == Permission.id)
                .join(Role, Role.id == RolePermission.role_id)
                .where(
                    Role.workspace_id == summary.workspace_id,
                    Role.code == "workspace_admin",
                    Permission.module_code == "carwash",
                )
            )
        )
        assert assigned == EXPECTED_CODES


def test_carwash_activation_requires_dependencies_and_does_not_survive_revocation() -> None:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        modules = ModuleAccessService(session)
        with pytest.raises(AuthorizationError):
            modules.require_module(summary.workspace_id, "carwash")
        definition_id = session.scalar(
            select(ModuleDefinition.id).where(ModuleDefinition.code == "carwash")
        )
        entitlement = session.scalar(
            select(ModuleEntitlement).where(
                ModuleEntitlement.workspace_id == summary.workspace_id,
                ModuleEntitlement.module_definition_id == definition_id,
            )
        )
        if entitlement is None:
            entitlement = ModuleEntitlement(
                workspace_id=summary.workspace_id,
                module_definition_id=definition_id,
                status="disabled",
                effective_from=datetime.now(UTC),
            )
            session.add(entitlement)
        entitlement.status = "enabled"
        session.flush()
        try:
            modules.require_module(summary.workspace_id, "carwash")
            hr = session.scalar(
                select(ModuleEntitlement)
                .join(ModuleDefinition)
                .where(
                    ModuleEntitlement.workspace_id == summary.workspace_id,
                    ModuleDefinition.code == "hr",
                )
            )
            assert hr is not None
            previous = hr.status
            try:
                hr.status = "disabled"
                session.flush()
                with pytest.raises(AuthorizationError):
                    modules.require_module(summary.workspace_id, "carwash")
            finally:
                hr.status = previous
        finally:
            entitlement.status = "disabled"
            session.flush()
        with pytest.raises(AuthorizationError):
            modules.require_module(summary.workspace_id, "carwash")
        assert "carwash" in WorkspaceEntitlementService(session).available_module_codes()


def test_carwash_migration_round_trip_keeps_activation_opt_in() -> None:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    dispose_engine()
    # Earlier integration cases leave posted synthetic washes in erp_test.
    # The financial migration must refuse to discard that history on downgrade.
    with session_scope() as session:
        posted = session.scalar(
            select(CarwashWash.id).where(CarwashWash.sale_id.is_not(None)).limit(1)
        )
    if posted is not None:
        with pytest.raises(RuntimeError, match="Cannot downgrade Carwash"):
            command.downgrade(config, "20260928_0051")
    # Remove only these disposable fixtures before testing the empty-schema round trip.
    with session_scope() as session:
        session.execute(delete(CarwashSettlementDetail))
        session.execute(delete(CarwashSettlement))
        session.execute(delete(CarwashCommission))
        session.execute(delete(CarwashWashLine))
        session.execute(delete(CarwashWash))
    dispose_engine()
    try:
        command.downgrade(config, "20260924_0048")
    finally:
        command.upgrade(config, "head")
        dispose_engine()
    with session_scope() as session:
        assert "carwash" not in ModuleAccessService(session).enabled_modules(summary.workspace_id)
        codes = set(
            session.scalars(select(Permission.code).where(Permission.module_code == "carwash"))
        )
        assert codes == EXPECTED_CODES
        entitlement = session.scalar(
            select(ModuleEntitlement)
            .join(ModuleDefinition)
            .where(
                ModuleEntitlement.workspace_id == summary.workspace_id,
                ModuleDefinition.code == "carwash",
            )
        )
        assert entitlement is not None and entitlement.status == "disabled"
