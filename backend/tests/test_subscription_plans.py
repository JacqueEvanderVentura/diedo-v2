from unittest.mock import MagicMock
from uuid import uuid7

from app.db.models import SubscriptionPlan
from app.services.subscription_plans import (
    CORE_MODULE_CODES,
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
