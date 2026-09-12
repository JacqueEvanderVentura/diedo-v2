from __future__ import annotations

import hmac
from hashlib import sha256
from uuid import UUID

from app.config import settings


def issue_appointment_management_token(appointment_id: UUID) -> str:
    secret = settings.jwt_secret_key.get_secret_value().encode("utf-8")
    digest = hmac.new(secret, str(appointment_id).encode("utf-8"), sha256).hexdigest()[:32]
    return digest


def verify_appointment_management_token(appointment_id: UUID, token: str | None) -> bool:
    if not token:
        return False
    expected = issue_appointment_management_token(appointment_id)
    return hmac.compare_digest(token.strip(), expected)
