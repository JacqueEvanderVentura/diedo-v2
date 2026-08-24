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
    hash_refresh_token,
    normalize_email,
    refresh_token_matches,
    refresh_token_session_id,
    verify_password,
)
from app.repositories.auth import AuthRepository, PrincipalRecord
from app.services.errors import AuthenticationError, AuthorizationError, ConflictError


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

        now = datetime.now(UTC)
        session_id = uuid7()
        refresh_token = create_refresh_token(session_id)
        refresh_lifetime = timedelta(days=settings.refresh_token_days)
        self._repository.create_session(
            session_id=session_id,
            platform_user_id=user.id,
            workspace_id=selected.workspace_id,
            membership_id=selected.membership_id,
            refresh_token_hash=hash_refresh_token(refresh_token),
            expires_at=now + refresh_lifetime,
            now=now,
        )
        self._session.commit()
        access_token, expires_in = create_access_token(
            platform_user_id=user.id,
            workspace_id=selected.workspace_id,
            membership_id=selected.membership_id,
            session_id=session_id,
            now=now,
        )
        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
            refresh_expires_in=int(refresh_lifetime.total_seconds()),
        )

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

    @staticmethod
    def _ensure_active(record: PrincipalRecord) -> None:
        if record.user_status != "active":
            raise AuthenticationError("Token de acceso inválido o expirado.")
        if record.membership_status != "active" or record.workspace_status not in {
            "active",
            "onboarding",
        }:
            raise AuthorizationError("Tu acceso a este workspace no está activo.")
