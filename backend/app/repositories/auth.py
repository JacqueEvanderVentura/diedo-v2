from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AuthSession, PlatformUser, Workspace, WorkspaceMembership


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
