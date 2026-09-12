from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.db.models import (
    AccessScope,
    Branch,
    PlatformUser,
    Role,
    RoleAssignment,
    SubscriptionPlan,
    Workspace,
    WorkspaceMembership,
    WorkspaceSubscription,
)
from app.services.platform_workspace import PLATFORM_WORKSPACE_SLUG
from app.services.subscription_plans import SubscriptionPlanRepository, WorkspaceEntitlementService


@dataclass(frozen=True)
class BackofficeOwnerRecord:
    user_id: UUID
    email: str
    display_name: str


@dataclass(frozen=True)
class BackofficeWorkspaceRecord:
    id: UUID
    slug: str
    name: str
    status: str
    default_currency: str
    timezone: str
    locale: str
    version: int
    created_at: datetime
    owner: BackofficeOwnerRecord | None
    branch_count: int
    plan_code: str | None
    plan_name: str | None
    subscription_status: str | None
    enabled_modules: tuple[str, ...]
    plan_customized: bool


@dataclass(frozen=True)
class BackofficeBranchRecord:
    id: UUID
    code: str
    name: str
    status: str


@dataclass(frozen=True)
class BackofficeUserRecord:
    user_id: UUID
    membership_id: UUID
    email: str
    display_name: str
    workspace_id: UUID
    workspace_name: str
    workspace_slug: str
    membership_status: str
    platform_status: str
    role_name: str | None
    version: int
    is_platform_operator: bool


@dataclass(frozen=True)
class BackofficeUserPage:
    items: tuple[BackofficeUserRecord, ...]
    total_items: int


@dataclass(frozen=True)
class BackofficeOverviewRecord:
    active_workspaces: int
    suspended_workspaces: int
    total_users: int
    active_users: int
    disabled_users: int
    workspaces_by_plan: tuple[tuple[str, str, int], ...]


class BackofficeRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_customer_workspace(self, workspace_id: UUID) -> Workspace | None:
        return self._session.scalar(
            select(Workspace).where(
                Workspace.id == workspace_id,
                Workspace.slug != PLATFORM_WORKSPACE_SLUG,
            )
        )

    def list_customer_workspaces(self) -> list[Workspace]:
        return list(
            self._session.scalars(
                select(Workspace)
                .where(Workspace.slug != PLATFORM_WORKSPACE_SLUG)
                .order_by(Workspace.name, Workspace.id)
            )
        )

    def branch_count(self, workspace_id: UUID) -> int:
        count = self._session.scalar(
            select(func.count()).select_from(Branch).where(Branch.workspace_id == workspace_id)
        )
        return int(count or 0)

    def list_branches(self, workspace_id: UUID) -> list[BackofficeBranchRecord]:
        rows = self._session.execute(
            select(Branch.id, Branch.code, Branch.name, Branch.status)
            .where(Branch.workspace_id == workspace_id)
            .order_by(Branch.name, Branch.id)
        )
        return [BackofficeBranchRecord(*row) for row in rows]

    def primary_owner(self, workspace_id: UUID) -> BackofficeOwnerRecord | None:
        row = self._session.execute(
            select(
                PlatformUser.id,
                PlatformUser.email,
                PlatformUser.display_name,
            )
            .join(
                WorkspaceMembership,
                WorkspaceMembership.platform_user_id == PlatformUser.id,
            )
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
                WorkspaceMembership.status == "active",
                RoleAssignment.status == "active",
                Role.code == "workspace_admin",
                AccessScope.scope_type == "workspace",
            )
            .order_by(WorkspaceMembership.activated_at.asc().nulls_last(), PlatformUser.id)
            .limit(1)
        ).one_or_none()
        if row is None:
            return None
        return BackofficeOwnerRecord(*row)

    def workspace_record(self, workspace: Workspace) -> BackofficeWorkspaceRecord:
        plan_repo = SubscriptionPlanRepository(self._session)
        entitlement_service = WorkspaceEntitlementService(self._session)
        subscription = plan_repo.workspace_subscription(workspace.id)
        plan = plan_repo.get_plan(subscription.plan_id) if subscription is not None else None
        enabled_modules = tuple(
            sorted(entitlement_service.enabled_module_codes_for_workspace(workspace.id))
        )
        plan_customized = (
            entitlement_service.is_plan_customized(workspace.id, plan)
            if plan is not None
            else False
        )
        return BackofficeWorkspaceRecord(
            id=workspace.id,
            slug=workspace.slug,
            name=workspace.name,
            status=workspace.status,
            default_currency=workspace.default_currency,
            timezone=workspace.timezone,
            locale=workspace.locale,
            version=workspace.version,
            created_at=workspace.created_at,
            owner=self.primary_owner(workspace.id),
            branch_count=self.branch_count(workspace.id),
            plan_code=plan.code if plan is not None else None,
            plan_name=plan.name if plan is not None else None,
            subscription_status=subscription.status if subscription is not None else None,
            enabled_modules=enabled_modules,
            plan_customized=plan_customized,
        )

    def _customer_membership_base(self) -> Select[tuple]:
        return (
            select(
                WorkspaceMembership.id.label("membership_id"),
                PlatformUser.id.label("user_id"),
                PlatformUser.email,
                PlatformUser.display_name,
                PlatformUser.status.label("platform_status"),
                PlatformUser.version,
                PlatformUser.is_platform_operator,
                WorkspaceMembership.status.label("membership_status"),
                Workspace.id.label("workspace_id"),
                Workspace.name.label("workspace_name"),
                Workspace.slug.label("workspace_slug"),
            )
            .join(PlatformUser, PlatformUser.id == WorkspaceMembership.platform_user_id)
            .join(Workspace, Workspace.id == WorkspaceMembership.workspace_id)
            .where(
                Workspace.slug != PLATFORM_WORKSPACE_SLUG,
                PlatformUser.is_platform_operator.is_(False),
            )
        )

    def list_users(
        self,
        *,
        search: str | None,
        workspace_id: UUID | None,
        status: str | None,
        page: int,
        page_size: int,
    ) -> BackofficeUserPage:
        query = self._customer_membership_base()
        if workspace_id is not None:
            query = query.where(Workspace.id == workspace_id)
        if status == "active":
            query = query.where(
                PlatformUser.status == "active",
                WorkspaceMembership.status == "active",
            )
        elif status == "disabled":
            query = query.where(
                or_(
                    PlatformUser.status == "disabled",
                    WorkspaceMembership.status != "active",
                )
            )
        if search:
            needle = f"%{search.strip().casefold()}%"
            query = query.where(
                or_(
                    func.lower(PlatformUser.email).like(needle),
                    func.lower(PlatformUser.display_name).like(needle),
                    func.lower(Workspace.name).like(needle),
                )
            )

        total_items = self._session.scalar(select(func.count()).select_from(query.subquery()))
        total_items = int(total_items or 0)
        offset = (page - 1) * page_size
        rows = self._session.execute(
            query.order_by(Workspace.name, PlatformUser.display_name, PlatformUser.id)
            .offset(offset)
            .limit(page_size)
        ).all()

        items: list[BackofficeUserRecord] = []
        for row in rows:
            role_name = self._primary_role_name(row.workspace_id, row.membership_id)
            items.append(
                BackofficeUserRecord(
                    user_id=row.user_id,
                    membership_id=row.membership_id,
                    email=row.email,
                    display_name=row.display_name,
                    workspace_id=row.workspace_id,
                    workspace_name=row.workspace_name,
                    workspace_slug=row.workspace_slug,
                    membership_status=row.membership_status,
                    platform_status=row.platform_status,
                    role_name=role_name,
                    version=row.version,
                    is_platform_operator=row.is_platform_operator,
                )
            )
        return BackofficeUserPage(items=tuple(items), total_items=total_items)

    def list_workspace_members(self, workspace_id: UUID) -> tuple[BackofficeUserRecord, ...]:
        page = self.list_users(
            search=None,
            workspace_id=workspace_id,
            status=None,
            page=1,
            page_size=500,
        )
        return page.items

    def _primary_role_name(self, workspace_id: UUID, membership_id: UUID) -> str | None:
        row = self._session.execute(
            select(Role.name)
            .join(
                RoleAssignment,
                (RoleAssignment.workspace_id == Role.workspace_id)
                & (RoleAssignment.role_id == Role.id),
            )
            .where(
                RoleAssignment.workspace_id == workspace_id,
                RoleAssignment.membership_id == membership_id,
                RoleAssignment.status == "active",
            )
            .order_by(Role.code)
            .limit(1)
        ).one_or_none()
        return row[0] if row is not None else None

    def get_membership_context(
        self,
        membership_id: UUID,
    ) -> tuple[WorkspaceMembership, PlatformUser, Workspace] | None:
        row = self._session.execute(
            select(WorkspaceMembership, PlatformUser, Workspace)
            .join(PlatformUser, PlatformUser.id == WorkspaceMembership.platform_user_id)
            .join(Workspace, Workspace.id == WorkspaceMembership.workspace_id)
            .where(
                WorkspaceMembership.id == membership_id,
                Workspace.slug != PLATFORM_WORKSPACE_SLUG,
            )
        ).one_or_none()
        if row is None:
            return None
        return row[0], row[1], row[2]

    def get_platform_user(self, user_id: UUID) -> PlatformUser | None:
        return self._session.get(PlatformUser, user_id)

    def membership_exists(self, workspace_id: UUID, platform_user_id: UUID) -> bool:
        existing = self._session.scalar(
            select(WorkspaceMembership.id).where(
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.platform_user_id == platform_user_id,
                WorkspaceMembership.status.in_(("active", "invited")),
            )
        )
        return existing is not None

    def role_by_code(self, workspace_id: UUID, role_code: str) -> Role | None:
        return self._session.scalar(
            select(Role).where(
                Role.workspace_id == workspace_id,
                Role.code == role_code,
                Role.status == "active",
            )
        )

    def primary_branch_id(self, workspace_id: UUID) -> UUID | None:
        return self._session.scalar(
            select(Branch.id)
            .where(Branch.workspace_id == workspace_id, Branch.status == "active")
            .order_by(Branch.name, Branch.id)
            .limit(1)
        )

    def overview(self) -> BackofficeOverviewRecord:
        active_workspaces = int(
            self._session.scalar(
                select(func.count())
                .select_from(Workspace)
                .where(
                    Workspace.slug != PLATFORM_WORKSPACE_SLUG,
                    Workspace.status == "active",
                )
            )
            or 0
        )
        suspended_workspaces = int(
            self._session.scalar(
                select(func.count())
                .select_from(Workspace)
                .where(
                    Workspace.slug != PLATFORM_WORKSPACE_SLUG,
                    Workspace.status == "suspended",
                )
            )
            or 0
        )
        membership_users = (
            select(PlatformUser.id, PlatformUser.status)
            .join(
                WorkspaceMembership,
                WorkspaceMembership.platform_user_id == PlatformUser.id,
            )
            .join(Workspace, Workspace.id == WorkspaceMembership.workspace_id)
            .where(
                Workspace.slug != PLATFORM_WORKSPACE_SLUG,
                PlatformUser.is_platform_operator.is_(False),
                WorkspaceMembership.status == "active",
            )
            .distinct()
        ).subquery()
        total_users = int(
            self._session.scalar(select(func.count()).select_from(membership_users)) or 0
        )
        active_users = int(
            self._session.scalar(
                select(func.count())
                .select_from(membership_users)
                .where(membership_users.c.status == "active")
            )
            or 0
        )
        disabled_users = total_users - active_users

        plan_rows = self._session.execute(
            select(SubscriptionPlan.code, SubscriptionPlan.name, func.count())
            .join(
                WorkspaceSubscription,
                WorkspaceSubscription.plan_id == SubscriptionPlan.id,
            )
            .join(Workspace, Workspace.id == WorkspaceSubscription.workspace_id)
            .where(
                Workspace.slug != PLATFORM_WORKSPACE_SLUG,
                WorkspaceSubscription.status == "active",
            )
            .group_by(SubscriptionPlan.code, SubscriptionPlan.name, SubscriptionPlan.sort_order)
            .order_by(SubscriptionPlan.sort_order, SubscriptionPlan.code)
        ).all()

        return BackofficeOverviewRecord(
            active_workspaces=active_workspaces,
            suspended_workspaces=suspended_workspaces,
            total_users=total_users,
            active_users=active_users,
            disabled_users=disabled_users,
            workspaces_by_plan=tuple((code, name, int(count)) for code, name, count in plan_rows),
        )
