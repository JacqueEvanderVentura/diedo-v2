from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid7

from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import (
    AccessTokenError,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    hash_password,
    hash_refresh_token,
    normalize_email,
    refresh_token_matches,
    refresh_token_session_id,
    verify_password,
)
from app.repositories.auth import (
    AssignmentContextRecord,
    AuthRepository,
    AuthSessionRecord,
    BranchContextRecord,
    LoginWorkspaceRecord,
    PrincipalRecord,
    WorkspaceContextRecord,
)
from app.services.authorization import AuthorizationService, EffectiveScope
from app.services.errors import (
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)
from app.services.modules import ModuleAccessService


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in: int
    refresh_expires_in: int


@dataclass(frozen=True)
class AuthPrincipal:
    platform_user_id: UUID
    membership_id: UUID
    workspace_id: UUID
    session_id: UUID
    email: str
    display_name: str


@dataclass(frozen=True)
class CurrentSessionContext:
    workspace: WorkspaceContextRecord
    assignments: tuple[AssignmentContextRecord, ...]
    visible_branches: tuple[BranchContextRecord, ...]
    effective_scope: EffectiveScope
    permission_codes: tuple[str, ...]
    workspace_permission_codes: tuple[str, ...]
    enabled_modules: tuple[str, ...]


class AuthService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = AuthRepository(session)

    def login(
        self,
        *,
        email: str,
        password: str,
    ) -> TokenPair:
        user = self._repository.get_login_user(normalize_email(email))
        if user is None:
            verify_password(password, None)
            raise AuthenticationError("Email o contraseña incorrectos.")
        if not verify_password(password, user.password_hash) or user.status != "active":
            raise AuthenticationError("Email o contraseña incorrectos.")

        workspaces = self._repository.list_login_workspaces(user.id)
        usable = [
            workspace
            for workspace in workspaces
            if workspace.membership_status == "active"
            and workspace.workspace_status in {"active", "onboarding"}
        ]
        if not usable:
            raise AuthenticationError("Email o contraseña incorrectos.")
        if len(usable) == 1:
            selected = usable[0]
        else:
            primary_workspaces = [workspace for workspace in usable if workspace.is_default]
            if len(primary_workspaces) != 1:
                raise ConflictError("La cuenta no tiene un workspace principal configurado.")
            selected = primary_workspaces[0]

        pair = self._issue_session(
            platform_user_id=user.id,
            workspace_id=selected.workspace_id,
            membership_id=selected.membership_id,
        )
        self._session.commit()
        return pair

    def refresh(self, refresh_token: str) -> TokenPair:
        try:
            session_id = refresh_token_session_id(refresh_token)
        except AccessTokenError as exc:
            raise AuthenticationError("Refresh token inválido o expirado.") from exc

        record = self._repository.get_refresh_session(session_id)
        now = datetime.now(UTC)
        if (
            record is None
            or not refresh_token_matches(refresh_token, record.refresh_token_hash)
            or record.session_revoked_at is not None
            or record.session_expires_at <= now
        ):
            raise AuthenticationError("Refresh token inválido o expirado.")
        self._ensure_active(record)

        rotated_refresh_token = create_refresh_token(session_id)
        self._repository.rotate_refresh_token(
            session_id,
            hash_refresh_token(rotated_refresh_token),
            now,
        )
        self._session.commit()
        access_token, expires_in = create_access_token(
            platform_user_id=record.platform_user_id,
            workspace_id=record.workspace_id,
            membership_id=record.membership_id,
            session_id=session_id,
            now=now,
        )
        remaining_refresh_seconds = max(0, int((record.session_expires_at - now).total_seconds()))
        return TokenPair(
            access_token=access_token,
            refresh_token=rotated_refresh_token,
            expires_in=expires_in,
            refresh_expires_in=remaining_refresh_seconds,
        )

    def authenticate_access_token(self, token: str) -> AuthPrincipal:
        try:
            claims = decode_access_token(token)
        except AccessTokenError as exc:
            raise AuthenticationError("Token de acceso inválido o expirado.") from exc
        record = self._repository.resolve_principal(claims.sid)
        now = datetime.now(UTC)
        if (
            record is None
            or record.platform_user_id != claims.sub
            or record.workspace_id != claims.wid
            or record.membership_id != claims.mid
            or record.session_revoked_at is not None
            or record.session_expires_at <= now
        ):
            raise AuthenticationError("Token de acceso inválido o expirado.")
        self._ensure_active(record)
        return AuthPrincipal(
            platform_user_id=record.platform_user_id,
            membership_id=record.membership_id,
            workspace_id=record.workspace_id,
            session_id=record.session_id,
            email=record.email,
            display_name=record.display_name,
        )

    def logout(self, principal: AuthPrincipal) -> None:
        self._repository.revoke_session(principal.session_id, datetime.now(UTC))
        self._session.commit()

    def list_workspaces(self, principal: AuthPrincipal) -> tuple[LoginWorkspaceRecord, ...]:
        return tuple(
            record
            for record in self._repository.list_login_workspaces(principal.platform_user_id)
            if record.membership_status == "active"
            and record.workspace_status in {"active", "onboarding"}
        )

    def switch_workspace(self, principal: AuthPrincipal, workspace_id: UUID) -> TokenPair:
        target = self._repository.get_active_workspace_membership(
            principal.platform_user_id,
            workspace_id,
        )
        if target is None:
            raise ResourceNotFoundError(
                "El workspace no existe o no está disponible.",
                "workspaceId",
            )
        now = datetime.now(UTC)
        self._repository.revoke_session(principal.session_id, now)
        pair = self._issue_session(
            platform_user_id=principal.platform_user_id,
            workspace_id=target.workspace_id,
            membership_id=target.membership_id,
            now=now,
        )
        self._session.commit()
        return pair

    def change_password(
        self,
        principal: AuthPrincipal,
        *,
        current_password: str,
        new_password: str,
    ) -> None:
        password_hash = self._repository.password_hash(principal.platform_user_id)
        if not verify_password(current_password, password_hash):
            raise AuthenticationError("La contraseña actual no es correcta.", "currentPassword")
        if current_password == new_password:
            raise InvalidOperationError(
                "La nueva contraseña debe ser diferente a la actual.",
                "newPassword",
            )
        now = datetime.now(UTC)
        self._repository.update_password(
            principal.platform_user_id,
            hash_password(new_password),
            now,
        )
        self._repository.revoke_other_sessions(
            principal.platform_user_id,
            principal.session_id,
            now,
        )
        self._session.commit()

    def list_sessions(self, principal: AuthPrincipal) -> tuple[AuthSessionRecord, ...]:
        now = datetime.now(UTC)
        return tuple(
            session
            for session in self._repository.list_sessions(principal.platform_user_id)
            if session.revoked_at is None and session.expires_at > now
        )

    def update_profile(self, principal: AuthPrincipal, display_name: str) -> None:
        normalized = " ".join(display_name.split())
        if len(normalized) < 2:
            raise InvalidOperationError("El nombre es demasiado corto.", "displayName")
        self._repository.update_display_name(principal.platform_user_id, normalized)
        self._session.commit()

    def revoke_owned_session(self, principal: AuthPrincipal, session_id: UUID) -> None:
        if not self._repository.session_belongs_to_user(
            session_id,
            principal.platform_user_id,
        ):
            raise ResourceNotFoundError("La sesión no existe.", "sessionId")
        self._repository.revoke_session(session_id, datetime.now(UTC))
        self._session.commit()

    def current_session_context(self, principal: AuthPrincipal) -> CurrentSessionContext:
        workspace = self._repository.workspace_context(principal.workspace_id)
        if workspace is None:
            raise ConflictError("El contexto del workspace no está disponible.")
        now = datetime.now(UTC)
        assignments = tuple(
            self._repository.assignment_context(
                principal.workspace_id,
                principal.membership_id,
                now,
            )
        )
        authorization = AuthorizationService(self._session)
        effective_scope = authorization.effective_scope(principal)
        branches = tuple(
            self._repository.visible_branches(
                principal.workspace_id,
                workspace_wide=effective_scope.workspace_wide,
                legal_entity_ids=effective_scope.legal_entity_ids,
                branch_ids=effective_scope.branch_ids,
            )
        )
        return CurrentSessionContext(
            workspace=workspace,
            assignments=assignments,
            visible_branches=branches,
            effective_scope=effective_scope,
            permission_codes=tuple(sorted(authorization.all_permission_codes(principal))),
            workspace_permission_codes=tuple(
                sorted(authorization.workspace_permission_codes(principal))
            ),
            enabled_modules=tuple(
                sorted(ModuleAccessService(self._session).enabled_modules(principal.workspace_id))
            ),
        )

    def _issue_session(
        self,
        *,
        platform_user_id: UUID,
        workspace_id: UUID,
        membership_id: UUID,
        now: datetime | None = None,
    ) -> TokenPair:
        issued_at = now or datetime.now(UTC)
        session_id = uuid7()
        refresh_token = create_refresh_token(session_id)
        refresh_lifetime = timedelta(days=settings.refresh_token_days)
        self._repository.create_session(
            session_id=session_id,
            platform_user_id=platform_user_id,
            workspace_id=workspace_id,
            membership_id=membership_id,
            refresh_token_hash=hash_refresh_token(refresh_token),
            expires_at=issued_at + refresh_lifetime,
            now=issued_at,
        )
        access_token, expires_in = create_access_token(
            platform_user_id=platform_user_id,
            workspace_id=workspace_id,
            membership_id=membership_id,
            session_id=session_id,
            now=issued_at,
        )
        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
            refresh_expires_in=int(refresh_lifetime.total_seconds()),
        )

    @staticmethod
    def _ensure_active(record: PrincipalRecord) -> None:
        if record.user_status != "active":
            raise AuthenticationError("Token de acceso inválido o expirado.")
        if record.membership_status != "active" or record.workspace_status not in {
            "active",
            "onboarding",
        }:
            raise AuthorizationError("Tu acceso a este workspace no está activo.")
