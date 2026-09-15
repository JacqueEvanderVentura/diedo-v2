from unittest.mock import MagicMock
from uuid import uuid7

import pytest
from app.db.models import SubscriptionPlan
from app.db.session import session_scope
from app.services.errors import ConflictError, InvalidOperationError, ResourceNotFoundError
from app.services.subscription_plans import (
    CORE_MODULE_CODES,
    SubscriptionPlanRepository,
    WorkspaceEntitlementService,
)


def test_resolve_enabled_modules_adds_core_and_filters_unknown() -> None:
    service = WorkspaceEntitlementService(MagicMock())
    service.available_module_codes = lambda: frozenset(
        {"foundation", "iam", "crm", "pos", "finance"}
    )
    resolved = service.resolve_enabled_modules(frozenset({"crm", "missing-module"}))
    assert resolved == frozenset({"foundation", "iam", "crm"})
    assert CORE_MODULE_CODES <= resolved


def test_plan_module_codes_use_plan_payload() -> None:
    service = WorkspaceEntitlementService(MagicMock())
    service.available_module_codes = lambda: frozenset({"foundation", "iam", "crm", "pos"})
    plan = SubscriptionPlan(
        id=uuid7(),
        code="basico",
        name="Basico",
        description="",
        status="active",
        module_codes=["crm", "pos"],
        sort_order=1,
        version=1,
    )
    assert service.plan_module_codes(plan) == frozenset({"foundation", "iam", "crm", "pos"})


def test_is_plan_customized_detects_extra_module() -> None:
    service = WorkspaceEntitlementService(MagicMock())
    service.enabled_module_codes_for_workspace = lambda _workspace_id: frozenset(
        {"foundation", "iam", "crm", "finance"}
    )
    plan = SubscriptionPlan(
        id=uuid7(),
        code="basico",
        name="Basico",
        description="",
        status="active",
        module_codes=["crm"],
        sort_order=1,
        version=1,
    )
    assert service.is_plan_customized(uuid7(), plan) is True


@pytest.mark.integration
def test_plan_listing_and_updates_respect_archival_and_version():
    with session_scope() as session:
        plan = SubscriptionPlan(
            id=uuid7(),
            code=f"ci-plan-{uuid7().hex}",
            name="CI plan",
            description="Original",
            status="active",
            module_codes=["foundation", "iam"],
            sort_order=999,
            version=1,
        )
        session.add(plan)
        session.flush()
        repository = SubscriptionPlanRepository(session)
        service = WorkspaceEntitlementService(session)
        active = repository.list_plans()
        assert any(item.id == plan.id for item in active)
        assert [(item.sort_order, item.name) for item in active] == sorted(
            (item.sort_order, item.name) for item in active
        )
        updated = service.update_plan(
            plan.id,
            name="Archived CI plan",
            description="Updated",
            module_codes=None,
            status="archived",
            expected_version=1,
        )
        assert updated.name == "Archived CI plan" and updated.description == "Updated"
        assert updated.status == "archived" and updated.version == 2
        assert all(item.id != plan.id for item in repository.list_plans())
        assert any(item.id == plan.id for item in repository.list_plans(include_archived=True))
        with pytest.raises(ResourceNotFoundError):
            service.require_plan_code(plan.code)
        with pytest.raises(ResourceNotFoundError):
            service.require_plan_code(f"missing-{uuid7().hex}")
        with pytest.raises(ConflictError):
            service.update_plan(
                plan.id,
                name="Stale",
                description=None,
                module_codes=None,
                status=None,
                expected_version=1,
            )
        with pytest.raises(InvalidOperationError):
            service.update_plan(
                plan.id,
                name=None,
                description=None,
                module_codes=None,
                status="invalid",
                expected_version=2,
            )
        with pytest.raises(ResourceNotFoundError):
            service.update_plan(
                uuid7(),
                name=None,
                description=None,
                module_codes=None,
                status=None,
                expected_version=1,
            )
        assert plan.name == "Archived CI plan" and plan.status == "archived"
        assert plan.version == 2
