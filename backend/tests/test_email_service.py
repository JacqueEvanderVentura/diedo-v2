from __future__ import annotations

from types import SimpleNamespace

import pytest
from app.config import Settings
from app.scripts import send_resend_test
from app.services import email as email_service
from app.services.email import (
    EmailAuthenticationError,
    EmailConfigurationError,
    EmailDeliveryResult,
    EmailDisabledError,
    EmailRateLimitError,
    EmailTransportError,
    EmailValidationError,
    send_email,
)


def _settings_for_test(*, enabled: bool = True) -> Settings:
    return Settings(
        email_enabled=enabled,
        resend_api_key="re_test_key",
        resend_request_timeout_seconds=10,
        email_from="Helios 360 ERP <notificaciones@mail.helios360erp.com>",
        _env_file=None,
    )


def _configure_resend_stub(
    monkeypatch: pytest.MonkeyPatch, *, send_result: object
) -> dict[str, object]:
    captured: dict[str, object] = {}

    class _SdkError(Exception):
        pass

    class _AuthError(_SdkError):
        pass

    def fake_send(payload: dict[str, object], options: dict[str, object] | None = None):
        captured["payload"] = payload
        captured["options"] = options
        if isinstance(send_result, BaseException):
            raise send_result
        return send_result

    fake_resend = SimpleNamespace(
        Emails=SimpleNamespace(send=fake_send),
        default_http_client="default-http-client",
        api_key=None,
    )
    monkeypatch.setattr(email_service, "_IMPORT_ERROR", None)
    monkeypatch.setattr(email_service, "resend", fake_resend)
    monkeypatch.setattr(email_service, "RequestsClient", lambda timeout: f"http-client:{timeout}")
    monkeypatch.setattr(email_service, "MissingApiKeyError", _AuthError)
    monkeypatch.setattr(email_service, "InvalidApiKeyError", _AuthError)

    class _ValidationError(_SdkError):
        pass

    monkeypatch.setattr(email_service, "_ResendApplicationError", _SdkError)
    monkeypatch.setattr(email_service, "ResendError", _SdkError)
    monkeypatch.setattr(email_service, "RateLimitError", _SdkError)
    monkeypatch.setattr(email_service, "ValidationError", _ValidationError)
    monkeypatch.setattr(email_service, "MissingRequiredFieldsError", _ValidationError)
    return captured


def test_send_email_rejects_when_disabled_without_force() -> None:
    with pytest.raises(EmailDisabledError, match="desactivado"):
        send_email(
            to="owner@erp.dev",
            subject="No debe enviarse",
            html="<p>no</p>",
            text="no",
            idempotency_key=None,
            config=_settings_for_test(enabled=False),
        )


def test_send_email_raises_if_api_key_missing_even_with_force(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure_resend_stub(monkeypatch, send_result={"id": "ignored"})

    with pytest.raises(EmailConfigurationError, match="no está configurada"):
        send_email(
            to="owner@erp.dev",
            subject="Sin clave",
            html="<p>no</p>",
            text="no",
            idempotency_key=None,
            config=Settings(email_enabled=True, _env_file=None),
            force_send=True,
        )


def test_send_email_rejects_invalid_recipient(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_resend_stub(monkeypatch, send_result={"id": "ignored"})

    with pytest.raises(EmailValidationError, match="correo de destino"):
        send_email(
            to="destinatario-invalido",
            subject="Inválido",
            html="<p>no</p>",
            text="no",
            idempotency_key=None,
            config=_settings_for_test(),
            force_send=True,
        )


def test_send_email_success_returns_provider_id_and_honors_idempotency(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured = _configure_resend_stub(monkeypatch, send_result={"id": "msg_123"})

    result = send_email(
        to="owner@erp.dev",
        subject="Bienvenida",
        html="<p>Hola</p>",
        text="Hola",
        idempotency_key="idem-01",
        config=_settings_for_test(),
        force_send=True,
    )

    payload = captured["payload"]
    assert isinstance(result, EmailDeliveryResult)
    assert result.provider_id == "msg_123"
    assert payload["to"] == "owner@erp.dev"  # type: ignore[index]
    assert payload["from"] == "Helios 360 ERP <notificaciones@mail.helios360erp.com>"  # type: ignore[index]
    assert captured["options"] == {"idempotency_key": "idem-01"}  # type: ignore[comparison-overlap]


def test_send_email_maps_authentication_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class AuthError(Exception):
        pass

    _configure_resend_stub(monkeypatch, send_result=AuthError())
    monkeypatch.setattr(email_service, "MissingApiKeyError", AuthError)
    monkeypatch.setattr(email_service, "InvalidApiKeyError", AuthError)

    with pytest.raises(EmailAuthenticationError, match="inválida o ausente"):
        send_email(
            to="owner@erp.dev",
            subject="Auth",
            html="<p>no</p>",
            text="no",
            idempotency_key=None,
            config=_settings_for_test(),
            force_send=True,
        )


def test_send_email_maps_validation_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class ValidationError(Exception):
        pass

    _configure_resend_stub(monkeypatch, send_result=ValidationError())
    monkeypatch.setattr(email_service, "ValidationError", ValidationError)

    with pytest.raises(EmailValidationError, match="Parámetros"):
        send_email(
            to="owner@erp.dev",
            subject="Validation",
            html="<p>no</p>",
            text="no",
            idempotency_key=None,
            config=_settings_for_test(),
            force_send=True,
        )


def test_send_email_maps_rate_limit_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class RateLimitError(Exception):
        pass

    _configure_resend_stub(monkeypatch, send_result=RateLimitError())
    monkeypatch.setattr(email_service, "RateLimitError", RateLimitError)

    with pytest.raises(EmailRateLimitError, match="Límite"):
        send_email(
            to="owner@erp.dev",
            subject="Quota",
            html="<p>no</p>",
            text="no",
            idempotency_key=None,
            config=_settings_for_test(),
            force_send=True,
        )


def test_send_email_maps_timeout_error(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_resend_stub(monkeypatch, send_result=TimeoutError("resend timeout"))

    with pytest.raises(EmailTransportError, match="proveedor de correo"):
        send_email(
            to="owner@erp.dev",
            subject="Timeout",
            html="<p>no</p>",
            text="no",
            idempotency_key=None,
            config=_settings_for_test(),
            force_send=True,
        )


def test_send_resend_test_command_outputs_only_status_and_provider_id(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(
        send_resend_test,
        "send_email",
        lambda **_kwargs: EmailDeliveryResult(provider_id="provider-123"),
    )
    monkeypatch.setattr(
        "sys.argv",
        [
            "send_resend_test.py",
            "--to",
            "owner@erp.dev",
            "--subject",
            "Mensaje de prueba",
            "--text",
            "Contenido secreto",
            "--html",
            "<p>Contenido secreto</p>",
        ],
    )

    send_resend_test.main()

    output = capsys.readouterr().out
    payload = output.strip()
    assert '"status":"sent"' in payload.replace(" ", "")
    assert "provider-123" in payload
    assert "Contenido secreto" not in payload
    assert "owner@erp.dev" not in payload
