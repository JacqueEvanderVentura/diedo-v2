from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID, uuid7

from sqlalchemy import ColumnElement, and_, exists, false, func, not_, or_, select, true, update
from sqlalchemy.orm import Session, aliased

from app.db.models import (
    AccessScope,
    AuditEntry,
    AuthSession,
    Branch,
    LegalEntity,
    Permission,
    PlatformUser,
    Role,
    RoleAssignment,
    RolePermission,
    UserInvitation,
    Workspace,
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
class LegalEntityRecord:
    id: UUID
    code: str
    name: str


AssignmentScopeType = Literal["workspace", "legal_entity", "branch"]


@dataclass(frozen=True)
class RoleAssignmentSpec:
    role_id: UUID
    scope_type: AssignmentScopeType
    legal_entity_id: UUID | None = None
    branch_id: UUID | None = None

    @property
    def key(self) -> tuple[UUID, AssignmentScopeType, UUID | None]:
        target_id = self.branch_id if self.scope_type == "branch" else self.legal_entity_id
        return self.role_id, self.scope_type, target_id


@dataclass(frozen=True)
class RoleAssignmentRecord:
    id: UUID
    role_id: UUID
    scope_type: AssignmentScopeType
    legal_entity_id: UUID | None
    branch_id: UUID | None
    role: RoleRecord

    @property
    def key(self) -> tuple[UUID, AssignmentScopeType, UUID | None]:
        target_id = self.branch_id if self.scope_type == "branch" else self.legal_entity_id
        return self.role_id, self.scope_type, target_id


@dataclass(frozen=True)
class UserRecord:
    membership_id: UUID
    platform_user_id: UUID
    display_name: str
    email: str
    role: RoleRecord | None
    branches: tuple[BranchRecord, ...]
    role_assignments: tuple[RoleAssignmentRecord, ...]
    last_access_at: datetime | None
    status: Literal["active", "inactive"]
    version: int


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

    def lock_workspace(self, workspace_id: UUID) -> bool:
        """Serialize membership-security transitions for one workspace.

        Callers acquire this row before locking an individual membership. Keeping
        the order workspace -> membership prevents concurrent last-admin removals
        without introducing opposite lock ordering inside the users service.
        """
        return (
            self._session.scalar(
                select(Workspace.id).where(Workspace.id == workspace_id).with_for_update()
            )
            is not None
        )

    def list_users(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        visible_legal_entity_ids: frozenset[UUID] | None,
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
            predicates.append(
                self._role_predicate(
                    workspace_id,
                    role_id,
                    visible_branch_ids,
                    visible_legal_entity_ids,
                )
            )
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
                WorkspaceMembership.version,
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
        roles_by_member, branches_by_member, assignments_by_member = self._assignment_details(
            workspace_id,
            membership_ids,
            visible_branch_ids,
            visible_legal_entity_ids,
        )
        items = tuple(
            UserRecord(
                membership_id=row[0],
                platform_user_id=row[1],
                display_name=row[2],
                email=row[3],
                role=roles_by_member.get(row[0]),
                branches=branches_by_member.get(row[0], ()),
                role_assignments=assignments_by_member.get(row[0], ()),
                last_access_at=row[4],
                status="active" if row[5] == "active" and row[6] == "active" else "inactive",
                version=row[7],
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
        administrator = self._workspace_role_code_predicate(workspace_id, "workspace_admin")
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

    def list_legal_entities(
        self,
        workspace_id: UUID,
        allowed_legal_entity_ids: frozenset[UUID] | None,
    ) -> list[LegalEntityRecord]:
        statement = (
            select(
                LegalEntity.id,
                LegalEntity.code,
                func.coalesce(LegalEntity.display_name, LegalEntity.legal_name),
            )
            .where(LegalEntity.workspace_id == workspace_id, LegalEntity.status == "active")
            .order_by(
                func.coalesce(LegalEntity.display_name, LegalEntity.legal_name),
                LegalEntity.id,
            )
        )
        if allowed_legal_entity_ids is not None:
            if not allowed_legal_entity_ids:
                return []
            statement = statement.where(LegalEntity.id.in_(allowed_legal_entity_ids))
        return [LegalEntityRecord(*row) for row in self._session.execute(statement)]

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

    def get_legal_entities(
        self,
        workspace_id: UUID,
        legal_entity_ids: set[UUID],
    ) -> list[LegalEntityRecord]:
        if not legal_entity_ids:
            return []
        return [
            LegalEntityRecord(*row)
            for row in self._session.execute(
                select(
                    LegalEntity.id,
                    LegalEntity.code,
                    func.coalesce(LegalEntity.display_name, LegalEntity.legal_name),
                ).where(
                    LegalEntity.workspace_id == workspace_id,
                    LegalEntity.id.in_(legal_entity_ids),
                    LegalEntity.status == "active",
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

    def get_user(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        visible_legal_entity_ids: frozenset[UUID] | None,
    ) -> UserRecord | None:
        return self._get_user_record(
            workspace_id=workspace_id,
            membership_id=membership_id,
            visible_branch_ids=visible_branch_ids,
            visible_legal_entity_ids=visible_legal_entity_ids,
            enforce_visibility=True,
        )

    def get_user_for_authorization(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
    ) -> UserRecord | None:
        """Load the complete assignment set for a previously authorized mutation target."""
        return self._get_user_record(
            workspace_id=workspace_id,
            membership_id=membership_id,
            visible_branch_ids=None,
            visible_legal_entity_ids=None,
            enforce_visibility=False,
        )

    def _get_user_record(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        visible_legal_entity_ids: frozenset[UUID] | None,
        enforce_visibility: bool,
    ) -> UserRecord | None:
        predicates: list[ColumnElement[bool]] = [
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.id == membership_id,
        ]
        if enforce_visibility:
            predicates.append(self._visibility_predicate(workspace_id, visible_branch_ids))
        row = self._session.execute(
            select(
                WorkspaceMembership.id,
                PlatformUser.id,
                PlatformUser.display_name,
                PlatformUser.email,
                WorkspaceMembership.last_access_at,
                WorkspaceMembership.status,
                PlatformUser.status,
                WorkspaceMembership.version,
            )
            .join(PlatformUser, PlatformUser.id == WorkspaceMembership.platform_user_id)
            .where(*predicates)
        ).one_or_none()
        if row is None:
            return None
        roles, branches, assignments = self._assignment_details(
            workspace_id,
            [membership_id],
            visible_branch_ids,
            visible_legal_entity_ids,
        )
        return UserRecord(
            membership_id=row[0],
            platform_user_id=row[1],
            display_name=row[2],
            email=row[3],
            role=roles.get(row[0]),
            branches=branches.get(row[0], ()),
            role_assignments=assignments.get(row[0], ()),
            last_access_at=row[4],
            status="active" if row[5] == "active" and row[6] == "active" else "inactive",
            version=row[7],
        )

    def membership_for_update(
        self,
        workspace_id: UUID,
        membership_id: UUID,
    ) -> WorkspaceMembership | None:
        return self._session.scalar(
            select(WorkspaceMembership)
            .where(
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.id == membership_id,
            )
            .with_for_update()
        )

    def platform_user(
        self,
        platform_user_id: UUID,
        *,
        lock: bool = False,
    ) -> PlatformUser | None:
        statement = select(PlatformUser).where(PlatformUser.id == platform_user_id)
        if lock:
            statement = statement.with_for_update()
        return self._session.scalar(statement)

    def platform_user_by_email(
        self,
        normalized_email: str,
        *,
        lock: bool = False,
    ) -> PlatformUser | None:
        statement = select(PlatformUser).where(PlatformUser.normalized_email == normalized_email)
        if lock:
            statement = statement.with_for_update()
        return self._session.scalar(statement)

    def platform_user_membership_count(
        self,
        platform_user_id: UUID,
        *,
        statuses: tuple[str, ...] | None = None,
    ) -> int:
        statement = select(func.count(WorkspaceMembership.id)).where(
            WorkspaceMembership.platform_user_id == platform_user_id
        )
        if statuses is not None:
            statement = statement.where(WorkspaceMembership.status.in_(statuses))
        return self._session.scalar(statement) or 0

    def membership_exists(self, workspace_id: UUID, platform_user_id: UUID) -> bool:
        return (
            self._session.scalar(
                select(WorkspaceMembership.id).where(
                    WorkspaceMembership.workspace_id == workspace_id,
                    WorkspaceMembership.platform_user_id == platform_user_id,
                )
            )
            is not None
        )

    def has_default_membership(self, platform_user_id: UUID) -> bool:
        return (
            self._session.scalar(
                select(WorkspaceMembership.id).where(
                    WorkspaceMembership.platform_user_id == platform_user_id,
                    WorkspaceMembership.is_default.is_(True),
                )
            )
            is not None
        )

    def active_workspace_admin_count(self, workspace_id: UUID) -> int:
        now = datetime.now(UTC)
        return (
            self._session.scalar(
                select(func.count(func.distinct(WorkspaceMembership.id)))
                .join(PlatformUser, PlatformUser.id == WorkspaceMembership.platform_user_id)
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
                    PlatformUser.status == "active",
                    RoleAssignment.status == "active",
                    RoleAssignment.valid_from <= now,
                    or_(RoleAssignment.valid_until.is_(None), RoleAssignment.valid_until >= now),
                    Role.code == "workspace_admin",
                    AccessScope.scope_type == "workspace",
                )
            )
            or 0
        )

    def is_workspace_admin(self, workspace_id: UUID, membership_id: UUID) -> bool:
        now = datetime.now(UTC)
        return (
            self._session.scalar(
                select(RoleAssignment.id)
                .join(
                    WorkspaceMembership,
                    (WorkspaceMembership.workspace_id == RoleAssignment.workspace_id)
                    & (WorkspaceMembership.id == RoleAssignment.membership_id),
                )
                .join(
                    PlatformUser,
                    PlatformUser.id == WorkspaceMembership.platform_user_id,
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
                    RoleAssignment.membership_id == membership_id,
                    WorkspaceMembership.status == "active",
                    PlatformUser.status == "active",
                    RoleAssignment.status == "active",
                    RoleAssignment.valid_from <= now,
                    or_(RoleAssignment.valid_until.is_(None), RoleAssignment.valid_until >= now),
                    Role.code == "workspace_admin",
                    AccessScope.scope_type == "workspace",
                )
            )
            is not None
        )

    def replace_assignments(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        assignments: list[RoleAssignmentSpec],
        now: datetime,
    ) -> None:
        self._session.execute(
            update(RoleAssignment)
            .where(
                RoleAssignment.workspace_id == workspace_id,
                RoleAssignment.membership_id == membership_id,
                RoleAssignment.status == "active",
            )
            .values(status="revoked", valid_until=now)
        )
        for assignment in assignments:
            scope = self._access_scope(workspace_id, assignment)
            self._session.add(
                RoleAssignment(
                    workspace_id=workspace_id,
                    membership_id=membership_id,
                    role_id=assignment.role_id,
                    access_scope_id=scope.id,
                    status="active",
                    valid_from=now,
                )
            )
        self._session.flush()

    def revoke_membership_sessions(self, membership_id: UUID, now: datetime) -> None:
        self._session.execute(
            update(AuthSession)
            .where(AuthSession.membership_id == membership_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )

    def revoke_platform_user_sessions(self, platform_user_id: UUID, now: datetime) -> None:
        self._session.execute(
            update(AuthSession)
            .where(
                AuthSession.platform_user_id == platform_user_id,
                AuthSession.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )

    def add_security_audit(
        self,
        *,
        workspace_id: UUID,
        actor_platform_user_id: UUID,
        action: str,
        target_type: str,
        target_id: UUID,
        details: dict[str, object],
        request_id: str,
    ) -> None:
        self._session.add(
            AuditEntry(
                workspace_id=workspace_id,
                actor_platform_user_id=actor_platform_user_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                outcome="success",
                request_id=request_id or None,
                details=details,
            )
        )
        self._session.flush()

    def add_membership_update_audit(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        actor_platform_user_id: UUID,
        status: str | None,
        assignments: list[RoleAssignmentSpec] | None,
        request_id: str,
    ) -> None:
        details: dict[str, object] = {}
        if status is not None:
            details["status"] = status
        if assignments is not None:
            details["roleAssignments"] = [
                {
                    "roleId": str(assignment.role_id),
                    "scopeType": (
                        "legalEntity"
                        if assignment.scope_type == "legal_entity"
                        else assignment.scope_type
                    ),
                    "legalEntityId": (
                        str(assignment.legal_entity_id)
                        if assignment.legal_entity_id is not None
                        else None
                    ),
                    "branchId": (
                        str(assignment.branch_id) if assignment.branch_id is not None else None
                    ),
                }
                for assignment in assignments
            ]
        self._session.add(
            AuditEntry(
                workspace_id=workspace_id,
                actor_platform_user_id=actor_platform_user_id,
                action="membership.update",
                target_type="workspace_membership",
                target_id=membership_id,
                outcome="success",
                request_id=request_id or None,
                details=details,
            )
        )
        self._session.flush()

    def add_invitation(self, invitation: UserInvitation) -> None:
        self._session.add(invitation)
        self._session.flush()

    def invitation_by_token_hash(
        self,
        token_hash: str,
        *,
        lock: bool = False,
    ) -> UserInvitation | None:
        statement = select(UserInvitation).where(UserInvitation.token_hash == token_hash)
        if lock:
            statement = statement.with_for_update()
        return self._session.scalar(statement)

    def invitation_for_update(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ) -> UserInvitation | None:
        return self._session.scalar(
            select(UserInvitation)
            .where(
                UserInvitation.workspace_id == workspace_id,
                UserInvitation.id == invitation_id,
            )
            .with_for_update()
        )

    def create_user(
        self,
        *,
        actor_platform_user_id: UUID,
        workspace_id: UUID,
        display_name: str,
        email: str,
        password_hash: str,
        assignments: list[RoleAssignmentSpec],
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
            version=1,
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
        self.replace_assignments(
            workspace_id=workspace_id,
            membership_id=membership_id,
            assignments=assignments,
            now=now,
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
                    "roleAssignments": [
                        {
                            "roleId": str(assignment.role_id),
                            "scopeType": (
                                "legalEntity"
                                if assignment.scope_type == "legal_entity"
                                else assignment.scope_type
                            ),
                            "legalEntityId": (
                                str(assignment.legal_entity_id)
                                if assignment.legal_entity_id is not None
                                else None
                            ),
                            "branchId": (
                                str(assignment.branch_id)
                                if assignment.branch_id is not None
                                else None
                            ),
                        }
                        for assignment in assignments
                    ],
                },
            )
        )
        self._session.flush()
        created = self.get_user(
            workspace_id=workspace_id,
            membership_id=membership_id,
            visible_branch_ids=None,
            visible_legal_entity_ids=None,
        )
        if created is None:
            raise RuntimeError("Created membership could not be loaded.")
        return created

    def _access_scope(
        self,
        workspace_id: UUID,
        assignment: RoleAssignmentSpec,
    ) -> AccessScope:
        predicates: list[ColumnElement[bool]] = [
            AccessScope.workspace_id == workspace_id,
            AccessScope.scope_type == assignment.scope_type,
        ]
        if assignment.scope_type == "legal_entity":
            predicates.append(AccessScope.legal_entity_id == assignment.legal_entity_id)
        elif assignment.scope_type == "branch":
            predicates.append(AccessScope.branch_id == assignment.branch_id)
        scope = self._session.scalar(select(AccessScope).where(*predicates))
        if scope is None:
            scope = AccessScope(
                workspace_id=workspace_id,
                scope_type=assignment.scope_type,
                legal_entity_id=assignment.legal_entity_id,
                branch_id=assignment.branch_id,
            )
            self._session.add(scope)
            self._session.flush()
        return scope

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

    def _role_predicate(
        self,
        workspace_id: UUID,
        role_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        visible_legal_entity_ids: frozenset[UUID] | None,
    ) -> ColumnElement[bool]:
        now = datetime.now(UTC)
        assignment = aliased(RoleAssignment)
        role = aliased(Role)
        scope = aliased(AccessScope)
        scope_visibility: ColumnElement[bool] = true()
        if visible_branch_ids is not None:
            scope_visibility = or_(
                and_(
                    scope.scope_type == "branch",
                    scope.branch_id.in_(visible_branch_ids),
                ),
                and_(
                    scope.scope_type == "legal_entity",
                    scope.legal_entity_id.in_(visible_legal_entity_ids or frozenset()),
                ),
            )
        return exists(
            select(1)
            .select_from(assignment)
            .join(
                role,
                (role.workspace_id == assignment.workspace_id) & (role.id == assignment.role_id),
            )
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
                role.status == "active",
                role.id == role_id,
                scope_visibility,
            )
        )

    def _workspace_role_code_predicate(
        self,
        workspace_id: UUID,
        role_code: str,
    ) -> ColumnElement[bool]:
        now = datetime.now(UTC)
        assignment = aliased(RoleAssignment)
        role = aliased(Role)
        scope = aliased(AccessScope)
        return exists(
            select(1)
            .select_from(assignment)
            .join(
                role,
                (role.workspace_id == assignment.workspace_id) & (role.id == assignment.role_id),
            )
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
                role.status == "active",
                role.code == role_code,
                scope.scope_type == "workspace",
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
        visible_legal_entity_ids: frozenset[UUID] | None,
    ) -> tuple[
        dict[UUID, RoleRecord],
        dict[UUID, tuple[BranchRecord, ...]],
        dict[UUID, tuple[RoleAssignmentRecord, ...]],
    ]:
        if not membership_ids:
            return {}, {}, {}
        now = datetime.now(UTC)
        assignments = self._session.execute(
            select(
                RoleAssignment.membership_id,
                RoleAssignment.id,
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
            )
            .order_by(
                RoleAssignment.membership_id,
                (AccessScope.scope_type == "workspace").desc(),
                (AccessScope.scope_type == "legal_entity").desc(),
                Role.name,
                Role.id,
                AccessScope.legal_entity_id,
                AccessScope.branch_id,
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
        role_rank_by_member: dict[UUID, tuple[int, str, UUID]] = {}
        assignments_by_member: dict[UUID, list[RoleAssignmentRecord]] = {
            membership_id: [] for membership_id in membership_ids
        }
        branch_ids_by_member: dict[UUID, set[UUID]] = {
            membership_id: set() for membership_id in membership_ids
        }
        for row in assignments:
            role = RoleRecord(id=row[2], code=row[3], name=row[4])
            scope_type: AssignmentScopeType
            if row[5] == "workspace":
                scope_type = "workspace"
            elif row[5] == "legal_entity":
                scope_type = "legal_entity"
            else:
                scope_type = "branch"
            assignment = RoleAssignmentRecord(
                id=row[1],
                role_id=role.id,
                scope_type=scope_type,
                legal_entity_id=row[6],
                branch_id=row[7],
                role=role,
            )
            assignment_is_visible = (
                visible_branch_ids is None
                or (
                    scope_type == "legal_entity"
                    and visible_legal_entity_ids is not None
                    and row[6] in visible_legal_entity_ids
                )
                or (scope_type == "branch" and row[7] is not None and row[7] in visible_branch_ids)
            )
            if assignment_is_visible:
                assignments_by_member[row[0]].append(assignment)
                role_rank = (
                    {"workspace": 0, "legal_entity": 1, "branch": 2}[scope_type],
                    role.name,
                    role.id,
                )
                if row[0] not in role_rank_by_member or role_rank < role_rank_by_member[row[0]]:
                    roles_by_member[row[0]] = role
                    role_rank_by_member[row[0]] = role_rank
            if scope_type == "workspace":
                branch_ids_by_member[row[0]].update(branch.id for branch in branches)
            elif scope_type == "legal_entity":
                branch_ids_by_member[row[0]].update(
                    branch.id for branch in branches if branch.legal_entity_id == row[6]
                )
            elif row[7] is not None and any(branch.id == row[7] for branch in branches):
                branch_ids_by_member[row[0]].add(row[7])

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
        return (
            roles_by_member,
            branches_by_member,
            {
                membership_id: tuple(member_assignments)
                for membership_id, member_assignments in assignments_by_member.items()
            },
        )
