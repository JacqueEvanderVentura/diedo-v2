from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID, uuid7

from sqlalchemy import ColumnElement, and_, exists, false, func, not_, or_, select, true
from sqlalchemy.orm import Session, aliased

from app.db.models import (
    AccessScope,
    AuditEntry,
    Branch,
    Permission,
    PlatformUser,
    Role,
    RoleAssignment,
    RolePermission,
    WorkspaceMembership,
)


@dataclass(frozen=True)
class RoleRecord:
    id: UUID
    code: str
    name: str


@dataclass(frozen=True)
class BranchRecord:
    id: UUID
    code: str
    name: str
    legal_entity_id: UUID


@dataclass(frozen=True)
class UserRecord:
    membership_id: UUID
    platform_user_id: UUID
    display_name: str
    email: str
    role: RoleRecord | None
    branches: tuple[BranchRecord, ...]
    last_access_at: datetime | None
    status: Literal["active", "inactive"]


@dataclass(frozen=True)
class UserPage:
    items: tuple[UserRecord, ...]
    total_items: int


@dataclass(frozen=True)
class UserCounts:
    total_users: int
    active_users: int
    administrators: int


class UsersRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_users(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        search: str | None,
        status: str | None,
        role_id: UUID | None,
        branch_id: UUID | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> UserPage:
        predicates: list[ColumnElement[bool]] = [
            WorkspaceMembership.workspace_id == workspace_id,
            self._visibility_predicate(workspace_id, visible_branch_ids),
        ]
        active = and_(
            WorkspaceMembership.status == "active",
            PlatformUser.status == "active",
        )
        if search:
            normalized_search = search.casefold()
            predicates.append(
                or_(
                    PlatformUser.normalized_email.contains(normalized_search),
                    func.lower(PlatformUser.display_name).contains(normalized_search),
                )
            )
        if status == "active":
            predicates.append(active)
        elif status == "inactive":
            predicates.append(not_(active))
        if role_id is not None:
            predicates.append(self._role_predicate(workspace_id, role_id))
        if branch_id is not None:
            predicates.append(self._branch_predicate(workspace_id, branch_id))

        base = (
            select(
                WorkspaceMembership.id,
                PlatformUser.id,
                PlatformUser.display_name,
                PlatformUser.email,
                WorkspaceMembership.last_access_at,
                WorkspaceMembership.status,
                PlatformUser.status,
            )
            .join(PlatformUser, PlatformUser.id == WorkspaceMembership.platform_user_id)
            .where(*predicates)
        )
        count_statement = select(func.count()).select_from(
            base.with_only_columns(WorkspaceMembership.id).order_by(None).subquery()
        )
        total_items = self._session.execute(count_statement).scalar_one()

        order_fields = {
            "displayName": func.lower(PlatformUser.display_name),
            "email": PlatformUser.normalized_email,
            "lastAccessAt": WorkspaceMembership.last_access_at,
            "status": WorkspaceMembership.status,
        }
        order_field = order_fields[sort_by]
        order = order_field.asc().nulls_last()
        if sort_direction == "desc":
            order = order_field.desc().nulls_last()
        rows = self._session.execute(
            base.order_by(order, WorkspaceMembership.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        membership_ids = [row[0] for row in rows]
        roles_by_member, branches_by_member = self._assignment_details(
            workspace_id,
            membership_ids,
            visible_branch_ids,
        )
        items = tuple(
            UserRecord(
                membership_id=row[0],
                platform_user_id=row[1],
                display_name=row[2],
                email=row[3],
                role=roles_by_member.get(row[0]),
                branches=branches_by_member.get(row[0], ()),
                last_access_at=row[4],
                status="active" if row[5] == "active" and row[6] == "active" else "inactive",
            )
            for row in rows
        )
        return UserPage(items=items, total_items=total_items)

    def user_counts(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
    ) -> UserCounts:
        active = and_(
            WorkspaceMembership.status == "active",
            PlatformUser.status == "active",
        )
        administrator = self._role_code_predicate(workspace_id, "workspace_admin")
        row = self._session.execute(
            select(
                func.count(WorkspaceMembership.id),
                func.count(WorkspaceMembership.id).filter(active),
                func.count(WorkspaceMembership.id).filter(active, administrator),
            )
            .join(PlatformUser, PlatformUser.id == WorkspaceMembership.platform_user_id)
            .where(
                WorkspaceMembership.workspace_id == workspace_id,
                self._visibility_predicate(workspace_id, visible_branch_ids),
            )
        ).one()
        return UserCounts(
            total_users=row[0],
            active_users=row[1],
            administrators=row[2],
        )

    def list_roles(self, workspace_id: UUID) -> list[RoleRecord]:
        return [
            RoleRecord(*row)
            for row in self._session.execute(
                select(Role.id, Role.code, Role.name)
                .where(Role.workspace_id == workspace_id, Role.status == "active")
                .order_by(Role.name, Role.id)
            )
        ]

    def list_branches(
        self,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> list[BranchRecord]:
        statement = (
            select(Branch.id, Branch.code, Branch.name, Branch.legal_entity_id)
            .where(Branch.workspace_id == workspace_id, Branch.status == "active")
            .order_by(Branch.name, Branch.id)
        )
        if allowed_branch_ids is not None:
            statement = statement.where(Branch.id.in_(allowed_branch_ids))
        return [BranchRecord(*row) for row in self._session.execute(statement)]

    def get_role(self, workspace_id: UUID, role_id: UUID) -> RoleRecord | None:
        row = self._session.execute(
            select(Role.id, Role.code, Role.name).where(
                Role.workspace_id == workspace_id,
                Role.id == role_id,
                Role.status == "active",
            )
        ).one_or_none()
        return RoleRecord(*row) if row is not None else None

    def get_branches(self, workspace_id: UUID, branch_ids: set[UUID]) -> list[BranchRecord]:
        if not branch_ids:
            return []
        return [
            BranchRecord(*row)
            for row in self._session.execute(
                select(Branch.id, Branch.code, Branch.name, Branch.legal_entity_id).where(
                    Branch.workspace_id == workspace_id,
                    Branch.id.in_(branch_ids),
                    Branch.status == "active",
                )
            )
        ]

    def role_permission_codes(self, workspace_id: UUID, role_id: UUID) -> set[str]:
        return set(
            self._session.scalars(
                select(Permission.code)
                .join(RolePermission, RolePermission.permission_id == Permission.id)
                .where(
                    RolePermission.workspace_id == workspace_id,
                    RolePermission.role_id == role_id,
                    Permission.is_platform_only.is_(False),
                )
            )
        )

    def normalized_email_exists(self, normalized_email: str) -> bool:
        return (
            self._session.scalar(
                select(exists().where(PlatformUser.normalized_email == normalized_email))
            )
            is True
        )

    def create_user(
        self,
        *,
        actor_platform_user_id: UUID,
        workspace_id: UUID,
        display_name: str,
        email: str,
        password_hash: str,
        role: RoleRecord,
        branches: list[BranchRecord],
        now: datetime,
        request_id: str,
    ) -> UserRecord:
        platform_user_id = uuid7()
        membership_id = uuid7()
        user = PlatformUser(
            id=platform_user_id,
            external_subject=f"password:{platform_user_id}",
            email=email,
            normalized_email=email,
            display_name=display_name,
            password_hash=password_hash,
            password_changed_at=now,
            status="active",
        )
        membership = WorkspaceMembership(
            id=membership_id,
            workspace_id=workspace_id,
            platform_user_id=platform_user_id,
            status="active",
            invited_at=now,
            activated_at=now,
            is_default=True,
        )
        self._session.add_all([user, membership])
        self._session.flush()

        for branch in branches:
            scope = self._session.scalar(
                select(AccessScope).where(
                    AccessScope.workspace_id == workspace_id,
                    AccessScope.scope_type == "branch",
                    AccessScope.branch_id == branch.id,
                )
            )
            if scope is None:
                scope = AccessScope(
                    workspace_id=workspace_id,
                    scope_type="branch",
                    legal_entity_id=branch.legal_entity_id,
                    branch_id=branch.id,
                )
                self._session.add(scope)
                self._session.flush()
            self._session.add(
                RoleAssignment(
                    workspace_id=workspace_id,
                    membership_id=membership_id,
                    role_id=role.id,
                    access_scope_id=scope.id,
                    status="active",
                    valid_from=now,
                )
            )

        self._session.add(
            AuditEntry(
                workspace_id=workspace_id,
                actor_platform_user_id=actor_platform_user_id,
                action="membership.create",
                target_type="workspace_membership",
                target_id=membership_id,
                outcome="success",
                request_id=request_id or None,
                details={
                    "roleId": str(role.id),
                    "branchIds": [str(branch.id) for branch in branches],
                },
            )
        )
        self._session.flush()
        return UserRecord(
            membership_id=membership_id,
            platform_user_id=platform_user_id,
            display_name=display_name,
            email=email,
            role=role,
            branches=tuple(sorted(branches, key=lambda branch: (branch.name, branch.id))),
            last_access_at=None,
            status="active",
        )

    def _visibility_predicate(
        self,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
    ) -> ColumnElement[bool]:
        if visible_branch_ids is None:
            return true()
        if not visible_branch_ids:
            return false()
        now = datetime.now(UTC)
        assignment = aliased(RoleAssignment)
        scope = aliased(AccessScope)
        legal_entities = select(Branch.legal_entity_id).where(
            Branch.workspace_id == workspace_id,
            Branch.id.in_(visible_branch_ids),
        )
        return exists(
            select(1)
            .select_from(assignment)
            .join(
                scope,
                (scope.workspace_id == assignment.workspace_id)
                & (scope.id == assignment.access_scope_id),
            )
            .where(
                assignment.workspace_id == workspace_id,
                assignment.membership_id == WorkspaceMembership.id,
                assignment.status == "active",
                assignment.valid_from <= now,
                or_(assignment.valid_until.is_(None), assignment.valid_until >= now),
                or_(
                    scope.scope_type == "workspace",
                    and_(
                        scope.scope_type == "branch",
                        scope.branch_id.in_(visible_branch_ids),
                    ),
                    and_(
                        scope.scope_type == "legal_entity",
                        scope.legal_entity_id.in_(legal_entities),
                    ),
                ),
            )
        )

    def _role_predicate(self, workspace_id: UUID, role_id: UUID) -> ColumnElement[bool]:
        now = datetime.now(UTC)
        assignment = aliased(RoleAssignment)
        role = aliased(Role)
        return exists(
            select(1)
            .select_from(assignment)
            .join(
                role,
                (role.workspace_id == assignment.workspace_id) & (role.id == assignment.role_id),
            )
            .where(
                assignment.workspace_id == workspace_id,
                assignment.membership_id == WorkspaceMembership.id,
                assignment.status == "active",
                assignment.valid_from <= now,
                or_(assignment.valid_until.is_(None), assignment.valid_until >= now),
                role.status == "active",
                role.id == role_id,
            )
        )

    def _role_code_predicate(self, workspace_id: UUID, role_code: str) -> ColumnElement[bool]:
        now = datetime.now(UTC)
        assignment = aliased(RoleAssignment)
        role = aliased(Role)
        return exists(
            select(1)
            .select_from(assignment)
            .join(
                role,
                (role.workspace_id == assignment.workspace_id) & (role.id == assignment.role_id),
            )
            .where(
                assignment.workspace_id == workspace_id,
                assignment.membership_id == WorkspaceMembership.id,
                assignment.status == "active",
                assignment.valid_from <= now,
                or_(assignment.valid_until.is_(None), assignment.valid_until >= now),
                role.status == "active",
                role.code == role_code,
            )
        )

    def _branch_predicate(self, workspace_id: UUID, branch_id: UUID) -> ColumnElement[bool]:
        now = datetime.now(UTC)
        assignment = aliased(RoleAssignment)
        scope = aliased(AccessScope)
        legal_entity_id = (
            select(Branch.legal_entity_id)
            .where(Branch.workspace_id == workspace_id, Branch.id == branch_id)
            .scalar_subquery()
        )
        return exists(
            select(1)
            .select_from(assignment)
            .join(
                scope,
                (scope.workspace_id == assignment.workspace_id)
                & (scope.id == assignment.access_scope_id),
            )
            .where(
                assignment.workspace_id == workspace_id,
                assignment.membership_id == WorkspaceMembership.id,
                assignment.status == "active",
                assignment.valid_from <= now,
                or_(assignment.valid_until.is_(None), assignment.valid_until >= now),
                or_(
                    scope.scope_type == "workspace",
                    and_(scope.scope_type == "branch", scope.branch_id == branch_id),
                    and_(
                        scope.scope_type == "legal_entity",
                        scope.legal_entity_id == legal_entity_id,
                    ),
                ),
            )
        )

    def _assignment_details(
        self,
        workspace_id: UUID,
        membership_ids: list[UUID],
        visible_branch_ids: frozenset[UUID] | None,
    ) -> tuple[dict[UUID, RoleRecord], dict[UUID, tuple[BranchRecord, ...]]]:
        if not membership_ids:
            return {}, {}
        now = datetime.now(UTC)
        assignments = self._session.execute(
            select(
                RoleAssignment.membership_id,
                Role.id,
                Role.code,
                Role.name,
                AccessScope.scope_type,
                AccessScope.legal_entity_id,
                AccessScope.branch_id,
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
                RoleAssignment.workspace_id == workspace_id,
                RoleAssignment.membership_id.in_(membership_ids),
                RoleAssignment.status == "active",
                RoleAssignment.valid_from <= now,
                or_(RoleAssignment.valid_until.is_(None), RoleAssignment.valid_until >= now),
                Role.status == "active",
            )
        ).all()
        branch_statement = select(
            Branch.id,
            Branch.code,
            Branch.name,
            Branch.legal_entity_id,
        ).where(Branch.workspace_id == workspace_id, Branch.status != "archived")
        if visible_branch_ids is not None:
            branch_statement = branch_statement.where(Branch.id.in_(visible_branch_ids))
        branches = [BranchRecord(*row) for row in self._session.execute(branch_statement)]

        roles_by_member: dict[UUID, RoleRecord] = {}
        branch_ids_by_member: dict[UUID, set[UUID]] = {
            membership_id: set() for membership_id in membership_ids
        }
        for row in assignments:
            role = RoleRecord(id=row[1], code=row[2], name=row[3])
            current = roles_by_member.get(row[0])
            if current is None or (role.name, role.id) < (current.name, current.id):
                roles_by_member[row[0]] = role
            if row[4] == "workspace":
                branch_ids_by_member[row[0]].update(branch.id for branch in branches)
            elif row[4] == "legal_entity":
                branch_ids_by_member[row[0]].update(
                    branch.id for branch in branches if branch.legal_entity_id == row[5]
                )
            elif row[6] is not None and any(branch.id == row[6] for branch in branches):
                branch_ids_by_member[row[0]].add(row[6])

        branch_by_id = {branch.id: branch for branch in branches}
        branches_by_member = {
            membership_id: tuple(
                sorted(
                    (
                        branch_by_id[branch_id]
                        for branch_id in branch_ids
                        if branch_id in branch_by_id
                    ),
                    key=lambda branch: (branch.name, branch.id),
                )
            )
            for membership_id, branch_ids in branch_ids_by_member.items()
        }
        return roles_by_member, branches_by_member
