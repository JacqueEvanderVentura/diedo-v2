from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID, uuid7

import jwt
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from pydantic import BaseModel, ConfigDict, ValidationError

from app.config import settings

_password_hash = PasswordHash.recommended()
_dummy_password_hash = _password_hash.hash("constant-time-dummy-password")


class AccessTokenClaims(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sub: UUID
    wid: UUID
    mid: UUID
    sid: UUID
    jti: UUID
    typ: Literal["access"]
    iss: str
    aud: str
    iat: int
    nbf: int
    exp: int


class AccessTokenError(ValueError):
    pass


def normalize_email(value: str) -> str:
    return value.strip().casefold()


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if password_hash is None:
        _password_hash.verify(password, _dummy_password_hash)
        return False
    return _password_hash.verify(password, password_hash)


def create_access_token(
    *,
    platform_user_id: UUID,
    workspace_id: UUID,
    membership_id: UUID,
    session_id: UUID,
    now: datetime | None = None,
) -> tuple[str, int]:
    issued_at = now or datetime.now(UTC)
    lifetime = timedelta(minutes=settings.access_token_minutes)
    expires_at = issued_at + lifetime
    payload = {
        "sub": str(platform_user_id),
        "wid": str(workspace_id),
        "mid": str(membership_id),
        "sid": str(session_id),
        "jti": str(uuid7()),
        "typ": "access",
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": issued_at,
        "nbf": issued_at,
        "exp": expires_at,
    }
    token = jwt.encode(
        payload,
        settings.jwt_secret_key.get_secret_value(),
        algorithm="HS256",
    )
    return token, int(lifetime.total_seconds())


def decode_access_token(token: str) -> AccessTokenClaims:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key.get_secret_value(),
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            options={
                "require": [
                    "sub",
                    "wid",
                    "mid",
                    "sid",
                    "jti",
                    "typ",
                    "iss",
                    "aud",
                    "iat",
                    "nbf",
                    "exp",
                ]
            },
        )
        return AccessTokenClaims.model_validate(payload)
    except (InvalidTokenError, ValidationError, ValueError, TypeError) as exc:
        raise AccessTokenError("Invalid access token.") from exc


def create_refresh_token(session_id: UUID) -> str:
    return f"{session_id}.{secrets.token_urlsafe(48)}"


def refresh_token_session_id(token: str) -> UUID:
    try:
        raw_session_id, secret = token.split(".", maxsplit=1)
        if len(secret) < 32:
            raise ValueError
        return UUID(raw_session_id)
    except (ValueError, AttributeError) as exc:
        raise AccessTokenError("Invalid refresh token.") from exc


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def refresh_token_matches(token: str, expected_hash: str) -> bool:
    return hmac.compare_digest(hash_refresh_token(token), expected_hash)
