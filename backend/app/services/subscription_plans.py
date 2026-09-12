from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    ModuleDefinition,
    ModuleEntitlement,
    SubscriptionPlan,
    WorkspaceSubscription,
)
from app.services.errors import ConflictError, InvalidOperationError, ResourceNotFoundError

CORE_MODULE_CODES = frozenset({"foundation", "iam"})
DEFAULT_PLAN_CODE = "completo"


@dataclass(frozen=True)
class PlanRecord:
    id: UUID
    code: str
    name: str
    description: str
    status: str
    module_codes: tuple[str, ...]
    sort_order: int
    version: int


class SubscriptionPlanRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_plans(self, *, include_archived: bool = False) -> list[PlanRecord]:
        statement = select(SubscriptionPlan).order_by(
            SubscriptionPlan.sort_order,
            SubscriptionPlan.name,
        )
        if not include_archived:
            statement = statement.where(SubscriptionPlan.status == "active")
        return [self._plan_record(plan) for plan in self._session.scalars(statement)]

    def get_plan_by_code(self, code: str) -> SubscriptionPlan | None:
        return self._session.scalar(select(SubscriptionPlan).where(SubscriptionPlan.code == code))

    def get_plan(self, plan_id: UUID) -> SubscriptionPlan | None:
        return self._session.get(SubscriptionPlan, plan_id)

    def workspace_subscription(self, workspace_id: UUID) -> WorkspaceSubscription | None:
        return self._session.scalar(
            select(WorkspaceSubscription).where(WorkspaceSubscription.workspace_id == workspace_id)
        )

    @staticmethod
    def _plan_record(plan: SubscriptionPlan) -> PlanRecord:
        return PlanRecord(
            id=plan.id,
            code=plan.code,
            name=plan.name,
            description=plan.description,
            status=plan.status,
            module_codes=tuple(plan.module_codes or ()),
            sort_order=plan.sort_order,
            version=plan.version,
        )


class WorkspaceEntitlementService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._plans = SubscriptionPlanRepository(session)

    def available_module_codes(self) -> frozenset[str]:
        return frozenset(
            self._session.scalars(
                select(ModuleDefinition.code).where(ModuleDefinition.status == "available")
            )
        )

    def resolve_enabled_modules(
        self,
        module_codes: frozenset[str] | set[str],
    ) -> frozenset[str]:
        available = self.available_module_codes()
        enabled = (set(module_codes) | CORE_MODULE_CODES) & available
        return frozenset(enabled)

    def plan_module_codes(self, plan: SubscriptionPlan) -> frozenset[str]:
        return self.resolve_enabled_modules(frozenset(plan.module_codes or ()))

    def enabled_module_codes_for_workspace(self, workspace_id: UUID) -> frozenset[str]:
        rows = self._session.execute(
            select(ModuleDefinition.code, ModuleEntitlement.status)
            .join(
                ModuleEntitlement,
                ModuleEntitlement.module_definition_id == ModuleDefinition.id,
            )
            .where(
                ModuleEntitlement.workspace_id == workspace_id,
                ModuleEntitlement.status == "enabled",
                ModuleDefinition.status == "available",
            )
        )
        return frozenset(code for code, status in rows if status == "enabled")

    def sync_entitlements(
        self,
        workspace_id: UUID,
        enabled_codes: frozenset[str],
        *,
        now: datetime | None = None,
    ) -> frozenset[str]:
        instant = now or datetime.now(UTC)
        resolved = self.resolve_enabled_modules(enabled_codes)
        modules = self._session.scalars(
            select(ModuleDefinition).where(ModuleDefinition.status == "available")
        ).all()
        existing = {
            entitlement.module_definition_id: entitlement
            for entitlement in self._session.scalars(
                select(ModuleEntitlement).where(ModuleEntitlement.workspace_id == workspace_id)
            )
        }
        for module in modules:
            should_enable = module.code in resolved
            entitlement = existing.get(module.id)
            if entitlement is None:
                self._session.add(
                    ModuleEntitlement(
                        workspace_id=workspace_id,
                        module_definition_id=module.id,
                        status="enabled" if should_enable else "disabled",
                        effective_from=instant,
                    )
                )
                continue
            entitlement.status = "enabled" if should_enable else "disabled"
        self._session.flush()
        return resolved

    def assign_plan(
        self,
        workspace_id: UUID,
        plan: SubscriptionPlan,
        *,
        now: datetime | None = None,
    ) -> WorkspaceSubscription:
        instant = now or datetime.now(UTC)
        subscription = self._plans.workspace_subscription(workspace_id)
        if subscription is None:
            subscription = WorkspaceSubscription(
                workspace_id=workspace_id,
                plan_id=plan.id,
                status="active",
                started_at=instant,
            )
            self._session.add(subscription)
        else:
            subscription.plan_id = plan.id
            subscription.status = "active"
            subscription.version += 1
        self._session.flush()
        return subscription

    def is_plan_customized(self, workspace_id: UUID, plan: SubscriptionPlan) -> bool:
        plan_codes = self.plan_module_codes(plan)
        enabled = self.enabled_module_codes_for_workspace(workspace_id)
        return enabled != plan_codes

    def require_plan_code(self, plan_code: str) -> SubscriptionPlan:
        plan = self._plans.get_plan_by_code(plan_code)
        if plan is None or plan.status != "active":
            raise ResourceNotFoundError("El plan no existe.", "planCode")
        return plan

    def update_plan(
        self,
        plan_id: UUID,
        *,
        name: str | None,
        description: str | None,
        module_codes: list[str] | None,
        status: str | None,
        expected_version: int,
    ) -> PlanRecord:
        plan = self._plans.get_plan(plan_id)
        if plan is None:
            raise ResourceNotFoundError("El plan no existe.", "planId")
        if plan.version != expected_version:
            raise ConflictError(
                "El plan cambió mientras lo editabas. Recarga e intenta de nuevo.",
                "version",
            )
        if name is not None:
            plan.name = name
        if description is not None:
            plan.description = description
        if module_codes is not None:
            self.resolve_enabled_modules(frozenset(module_codes))
            plan.module_codes = sorted(set(module_codes) | CORE_MODULE_CODES)
        if status is not None:
            if status not in {"active", "archived"}:
                raise InvalidOperationError("Estado de plan inválido.", "status")
            plan.status = status
        plan.version += 1
        self._session.flush()
        return SubscriptionPlanRepository._plan_record(plan)
