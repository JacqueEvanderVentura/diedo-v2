from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.config import Settings, settings
from app.services.errors import ServiceUnavailableError

RequestsClient = None
_ResendApplicationError = Exception
ValidationError = Exception
InvalidApiKeyError = Exception
MissingApiKeyError = Exception
RateLimitError = Exception
ResendError = Exception
MissingRequiredFieldsError = Exception

try:
    import resend
except Exception as exc:  # pragma: no cover
    resend = None
    _IMPORT_ERROR = exc
else:
    _IMPORT_ERROR = None
    try:
        from resend.exceptions import (
            ApplicationError as _ResendApplicationError,
        )
        from resend.exceptions import (
            InvalidApiKeyError,
            MissingApiKeyError,
            MissingRequiredFieldsError,
            RateLimitError,
            ResendError,
            ValidationError,
        )
    except Exception:  # pragma: no cover
        ValidationError = InvalidApiKeyError = MissingApiKeyError = RateLimitError = ResendError = (
            Exception
        )
        MissingRequiredFieldsError = Exception
    try:
        from resend.http_client_requests import RequestsClient
    except Exception:  # pragma: no cover
        RequestsClient = None


class EmailServiceError(ServiceUnavailableError):
    """Email transport failure with sanitized, user-visible text."""


class EmailDisabledError(EmailServiceError):
    pass


class EmailConfigurationError(EmailServiceError):
    pass


class EmailAuthenticationError(EmailServiceError):
    pass


class EmailValidationError(EmailServiceError):
    pass


class EmailRateLimitError(EmailServiceError):
    pass


class EmailTransportError(EmailServiceError):
    pass


@dataclass(frozen=True)
class EmailDeliveryResult:
    provider_id: str


def _extract_id(response: object) -> str:
    if isinstance(response, dict):
        value = response.get("id")
        if isinstance(value, str) and value:
            return value
    if hasattr(response, "id"):
        raw = getattr(response, "id")
        if isinstance(raw, str) and raw:
            return raw
    raise EmailTransportError("La respuesta del proveedor no contiene un identificador.")


def _normalize_recipient(value: str) -> str:
    stripped = value.strip()
    if not stripped or "@" not in stripped or " " in stripped:
        raise EmailValidationError("Se requiere un correo de destino válido.")
    return stripped


def _deliver(
    payload: dict[str, Any],
    idempotency_key: str | None,
) -> object:
    assert resend is not None
    if idempotency_key:
        # SDK variants accept either `options` or `idempotency_key`.
        try:
            return resend.Emails.send(payload, options={"idempotency_key": idempotency_key})
        except TypeError:
            return resend.Emails.send(payload, idempotency_key=idempotency_key)
    return resend.Emails.send(payload)


def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    text: str,
    idempotency_key: str | None,
    config: Settings = settings,
    force_send: bool = False,
) -> EmailDeliveryResult:
    """Send one transactional email and return the provider identifier."""

    if not force_send and not config.email_enabled:
        raise EmailDisabledError("El envío de correo está desactivado en esta instancia.")

    if _IMPORT_ERROR is not None or resend is None:
        raise EmailConfigurationError("El SDK de Resend no está disponible.")

    api_key = config.resend_api_key
    if api_key is None or not api_key.get_secret_value().strip():
        raise EmailConfigurationError("La API key de Resend no está configurada.")

    payload = {
        "to": _normalize_recipient(to),
        "from": config.email_from,
        "subject": subject,
        "html": html,
        "text": text,
    }

    previous_client = getattr(resend, "default_http_client", None)
    previous_api_key = getattr(resend, "api_key", None)

    if RequestsClient is not None:
        resend.default_http_client = RequestsClient(timeout=config.resend_request_timeout_seconds)
    resend.api_key = api_key.get_secret_value()

    try:
        response = _deliver(payload, idempotency_key)
        return EmailDeliveryResult(provider_id=_extract_id(response))
    except (MissingApiKeyError, InvalidApiKeyError) as exc:
        raise EmailAuthenticationError("Clave de API de Resend inválida o ausente.") from exc
    except (ValidationError, MissingRequiredFieldsError) as exc:
        raise EmailValidationError("Parámetros inválidos para el envío de correo.") from exc
    except RateLimitError as exc:
        raise EmailRateLimitError("Límite de envío de Resend alcanzado.") from exc
    except (_ResendApplicationError, ResendError, TimeoutError, RuntimeError) as exc:
        raise EmailTransportError(
            "No se pudo completar el envío con el proveedor de correo."
        ) from exc
    finally:
        resend.default_http_client = previous_client
        resend.api_key = previous_api_key
