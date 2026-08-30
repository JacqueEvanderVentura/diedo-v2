from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.db.models import (
    AccessScope,
    AuthSession,
    Branch,
    PlatformUser,
    Role,
    RoleAssignment,
    Workspace,
    WorkspaceMembership,
)


@dataclass(frozen=True)
class LoginUserRecord:
    id: UUID
    email: str
    display_name: str
    password_hash: str | None
    status: str


@dataclass(frozen=True)
class LoginWorkspaceRecord:
    workspace_id: UUID
    workspace_slug: str
    workspace_name: str
    workspace_status: str
    membership_id: UUID
    membership_status: str
    is_default: bool


@dataclass(frozen=True)
class PrincipalRecord:
    platform_user_id: UUID
    email: str
    display_name: str
    user_status: str
    workspace_id: UUID
    workspace_status: str
    membership_id: UUID
    membership_status: str
    session_id: UUID
    session_expires_at: datetime
    session_revoked_at: datetime | None


@dataclass(frozen=True)
class RefreshSessionRecord(PrincipalRecord):
    refresh_token_hash: str


@dataclass(frozen=True)
class WorkspaceContextRecord:
    id: UUID
    slug: str
    name: str
    default_currency: str
    timezone: str
    locale: str
    version: int


@dataclass(frozen=True)
class AssignmentContextRecord:
    id: UUID
    role_id: UUID
    role_code: str
    role_name: str
    scope_type: str
    legal_entity_id: UUID | None
    branch_id: UUID | None


@dataclass(frozen=True)
class BranchContextRecord:
    id: UUID
    legal_entity_id: UUID
    code: str
    name: str


@dataclass(frozen=True)
class AuthSessionRecord:
    id: UUID
    workspace_id: UUID
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime
    revoked_at: datetime | None


class AuthRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_login_user(self, normalized_email: str) -> LoginUserRecord | None:
        row = self._session.execute(
            select(
                PlatformUser.id,
                PlatformUser.email,
                PlatformUser.display_name,
                PlatformUser.password_hash,
                PlatformUser.status,
            ).where(PlatformUser.normalized_email == normalized_email)
        ).one_or_none()
        if row is None:
            return None
        return LoginUserRecord(*row)

    def list_login_workspaces(
        self,
        platform_user_id: UUID,
    ) -> list[LoginWorkspaceRecord]:
        statement = (
            select(
                Workspace.id,
                Workspace.slug,
                Workspace.name,
                Workspace.status,
                WorkspaceMembership.id,
                WorkspaceMembership.status,
                WorkspaceMembership.is_default,
            )
            .join(
                WorkspaceMembership,
                WorkspaceMembership.workspace_id == Workspace.id,
            )
            .where(WorkspaceMembership.platform_user_id == platform_user_id)
            .order_by(WorkspaceMembership.is_default.desc(), Workspace.name, Workspace.id)
        )
        return [LoginWorkspaceRecord(*row) for row in self._session.execute(statement)]

    def get_active_workspace_membership(
        self,
        platform_user_id: UUID,
        workspace_id: UUID,
    ) -> LoginWorkspaceRecord | None:
        return next(
            (
                record
                for record in self.list_login_workspaces(platform_user_id)
                if record.workspace_id == workspace_id
                and record.workspace_status in {"active", "onboarding"}
                and record.membership_status == "active"
            ),
            None,
        )

    def create_session(
        self,
        *,
        session_id: UUID,
        platform_user_id: UUID,
        workspace_id: UUID,
        membership_id: UUID,
        refresh_token_hash: str,
        expires_at: datetime,
        now: datetime,
    ) -> None:
        self._session.add(
            AuthSession(
                id=session_id,
                platform_user_id=platform_user_id,
                workspace_id=workspace_id,
                membership_id=membership_id,
                refresh_token_hash=refresh_token_hash,
                expires_at=expires_at,
                last_used_at=now,
            )
        )
        membership = self._session.get(WorkspaceMembership, membership_id)
        if membership is not None:
            membership.last_access_at = now
        self._session.flush()

    def get_refresh_session(self, session_id: UUID) -> RefreshSessionRecord | None:
        row = self._session.execute(
            select(
                PlatformUser.id,
                PlatformUser.email,
                PlatformUser.display_name,
                PlatformUser.status,
                Workspace.id,
                Workspace.status,
                WorkspaceMembership.id,
                WorkspaceMembership.status,
                AuthSession.id,
                AuthSession.expires_at,
                AuthSession.revoked_at,
                AuthSession.refresh_token_hash,
            )
            .join(PlatformUser, PlatformUser.id == AuthSession.platform_user_id)
            .join(
                WorkspaceMembership,
                (WorkspaceMembership.workspace_id == AuthSession.workspace_id)
                & (WorkspaceMembership.id == AuthSession.membership_id),
            )
            .join(Workspace, Workspace.id == AuthSession.workspace_id)
            .where(AuthSession.id == session_id)
            .with_for_update()
        ).one_or_none()
        if row is None:
            return None
        return RefreshSessionRecord(*row)

    def rotate_refresh_token(
        self,
        session_id: UUID,
        refresh_token_hash: str,
        now: datetime,
    ) -> None:
        auth_session = self._session.get(AuthSession, session_id)
        if auth_session is None:
            return
        auth_session.refresh_token_hash = refresh_token_hash
        auth_session.last_used_at = now
        self._session.flush()

    def revoke_session(self, session_id: UUID, now: datetime) -> None:
        auth_session = self._session.get(AuthSession, session_id)
        if auth_session is not None and auth_session.revoked_at is None:
            auth_session.revoked_at = now
            self._session.flush()

    def revoke_other_sessions(
        self,
        platform_user_id: UUID,
        current_session_id: UUID,
        now: datetime,
    ) -> None:
        self._session.execute(
            update(AuthSession)
            .where(
                AuthSession.platform_user_id == platform_user_id,
                AuthSession.id != current_session_id,
                AuthSession.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )

    def revoke_membership_sessions(self, membership_id: UUID, now: datetime) -> None:
        self._session.execute(
            update(AuthSession)
            .where(AuthSession.membership_id == membership_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )

    def list_sessions(self, platform_user_id: UUID) -> list[AuthSessionRecord]:
        rows = self._session.execute(
            select(
                AuthSession.id,
                AuthSession.workspace_id,
                AuthSession.created_at,
                AuthSession.last_used_at,
                AuthSession.expires_at,
                AuthSession.revoked_at,
            )
            .where(AuthSession.platform_user_id == platform_user_id)
            .order_by(AuthSession.created_at.desc(), AuthSession.id.desc())
        )
        return [AuthSessionRecord(*row) for row in rows]

    def session_belongs_to_user(self, session_id: UUID, platform_user_id: UUID) -> bool:
        return (
            self._session.scalar(
                select(AuthSession.id).where(
                    AuthSession.id == session_id,
                    AuthSession.platform_user_id == platform_user_id,
                )
            )
            is not None
        )

    def password_hash(self, platform_user_id: UUID) -> str | None:
        return self._session.scalar(
            select(PlatformUser.password_hash).where(PlatformUser.id == platform_user_id)
        )

    def update_password(self, platform_user_id: UUID, password_hash: str, now: datetime) -> None:
        user = self._session.get(PlatformUser, platform_user_id)
        if user is not None:
            user.password_hash = password_hash
            user.password_changed_at = now
            user.version += 1
            self._session.flush()

    def update_display_name(self, platform_user_id: UUID, display_name: str) -> None:
        user = self._session.get(PlatformUser, platform_user_id)
        if user is not None:
            user.display_name = display_name
            user.version += 1
            self._session.flush()

    def workspace_context(self, workspace_id: UUID) -> WorkspaceContextRecord | None:
        row = self._session.execute(
            select(
                Workspace.id,
                Workspace.slug,
                Workspace.name,
                Workspace.default_currency,
                Workspace.timezone,
                Workspace.locale,
                Workspace.version,
            ).where(Workspace.id == workspace_id)
        ).one_or_none()
        return WorkspaceContextRecord(*row) if row is not None else None

    def assignment_context(
        self,
        workspace_id: UUID,
        membership_id: UUID,
        now: datetime,
    ) -> list[AssignmentContextRecord]:
        rows = self._session.execute(
            select(
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
                RoleAssignment.membership_id == membership_id,
                RoleAssignment.status == "active",
                RoleAssignment.valid_from <= now,
                or_(RoleAssignment.valid_until.is_(None), RoleAssignment.valid_until >= now),
                Role.status == "active",
            )
            .order_by(
                (AccessScope.scope_type == "workspace").desc(),
                Role.name,
                Role.id,
            )
        )
        return [AssignmentContextRecord(*row) for row in rows]

    def visible_branches(
        self,
        workspace_id: UUID,
        *,
        workspace_wide: bool,
        legal_entity_ids: frozenset[UUID],
        branch_ids: frozenset[UUID],
    ) -> list[BranchContextRecord]:
        statement = select(Branch.id, Branch.legal_entity_id, Branch.code, Branch.name).where(
            Branch.workspace_id == workspace_id,
            Branch.status != "archived",
        )
        if not workspace_wide:
            statement = statement.where(
                or_(
                    Branch.id.in_(branch_ids),
                    Branch.legal_entity_id.in_(legal_entity_ids),
                )
            )
        rows = self._session.execute(statement.order_by(Branch.name, Branch.id))
        return [BranchContextRecord(*row) for row in rows]

    def resolve_principal(self, session_id: UUID) -> PrincipalRecord | None:
        row = self._session.execute(
            select(
                PlatformUser.id,
                PlatformUser.email,
                PlatformUser.display_name,
                PlatformUser.status,
                Workspace.id,
                Workspace.status,
                WorkspaceMembership.id,
                WorkspaceMembership.status,
                AuthSession.id,
                AuthSession.expires_at,
                AuthSession.revoked_at,
            )
            .join(PlatformUser, PlatformUser.id == AuthSession.platform_user_id)
            .join(
                WorkspaceMembership,
                (WorkspaceMembership.workspace_id == AuthSession.workspace_id)
                & (WorkspaceMembership.id == AuthSession.membership_id),
            )
            .join(Workspace, Workspace.id == AuthSession.workspace_id)
            .where(AuthSession.id == session_id)
        ).one_or_none()
        if row is None:
            return None
        return PrincipalRecord(*row)
