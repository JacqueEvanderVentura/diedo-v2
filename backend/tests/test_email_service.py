from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

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


def test_legacy_email_settings_and_explicit_precedence(monkeypatch):
    for name in (
        "EMAIL_ENABLED",
        "MAIL_ENABLED",
        "EMAIL_FROM",
        "MAIL_FROM",
        "EMAIL_REPLY_TO",
        "MAIL_REPLY_TO",
    ):
        monkeypatch.delenv(name, raising=False)
    legacy = Settings(
        mail_enabled=True,
        mail_from="old@example.com",
        mail_reply_to="reply@example.com",
        _env_file=None,
    )
    assert legacy.email_enabled is True
    assert legacy.email_from == "old@example.com"
    assert legacy.email_reply_to == "reply@example.com"
    current = Settings(
        email_enabled=False,
        mail_enabled=True,
        email_from="new@example.com",
        mail_from="old@example.com",
        _env_file=None,
    )
    assert current.email_enabled is False
    assert current.email_from == "new@example.com"


def test_send_email_passes_reply_to(monkeypatch):
    captured = _configure_resend_stub(monkeypatch, send_result={"id": "reply-test"})
    config = _settings_for_test()
    config.email_reply_to = "reply@example.com"
    send_email(
        to="client@example.com",
        subject="Cita",
        html="<p>Cita</p>",
        text="Cita",
        idempotency_key="reply-test",
        config=config,
    )
    assert captured["payload"]["reply_to"] == "reply@example.com"


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


@pytest.mark.parametrize("idempotency_key", [None, "sdk-contract-01"])
def test_send_email_uses_installed_sdk_contract(idempotency_key: str | None) -> None:
    import resend

    previous_client = resend.default_http_client
    previous_api_key = resend.api_key
    with patch("resend.http_client_requests.requests.request") as request:
        request.return_value = SimpleNamespace(
            content=b'{"id":"sdk-message-123"}',
            status_code=200,
            headers={"Content-Type": "application/json"},
        )
        result = send_email(
            to="owner@erp.dev",
            subject="SDK contract",
            html="<p>Test</p>",
            text="Test",
            idempotency_key=idempotency_key,
            config=_settings_for_test(),
        )

    assert result.provider_id == "sdk-message-123"
    request.assert_called_once()
    assert request.call_args.kwargs["headers"].get("Idempotency-Key") == idempotency_key
    assert request.call_args.kwargs["json"]["to"] == "owner@erp.dev"
    assert request.call_args.kwargs["timeout"] == 10
    assert resend.default_http_client is previous_client
    assert resend.api_key == previous_api_key


def test_send_email_reports_unavailable_sdk(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(email_service, "resend", None)
    with pytest.raises(EmailConfigurationError, match="SDK de Resend"):
        send_email(
            to="owner@erp.dev",
            subject="Unavailable SDK",
            html="<p>Test</p>",
            text="Test",
            idempotency_key=None,
            config=_settings_for_test(),
        )


@pytest.mark.parametrize("response", [{}, {"id": ""}, SimpleNamespace(id=123)])
def test_send_email_rejects_provider_response_without_valid_id(monkeypatch, response):
    _configure_resend_stub(monkeypatch, send_result=response)
    with pytest.raises(EmailTransportError, match="identificador"):
        send_email(
            to="owner@erp.dev",
            subject="Test",
            html="<p>Test</p>",
            text="Test",
            idempotency_key=None,
            config=_settings_for_test(),
        )
    assert email_service.resend.default_http_client == "default-http-client"
    assert email_service.resend.api_key is None


def test_send_email_accepts_provider_object_response(monkeypatch):
    _configure_resend_stub(monkeypatch, send_result=SimpleNamespace(id="object-message"))
    result = send_email(
        to="owner@erp.dev",
        subject="Test",
        html="<p>Test</p>",
        text="Test",
        idempotency_key=None,
        config=_settings_for_test(),
    )
    assert result.provider_id == "object-message"


def test_test_email_command_returns_failure_without_provider_details(monkeypatch, capsys):
    def failing_send(**_kwargs):
        raise EmailTransportError("Proveedor no disponible") from RuntimeError("private-details")

    monkeypatch.setattr(send_resend_test, "send_email", failing_send)
    monkeypatch.setattr("sys.argv", ["send_resend_test", "--to", "owner@erp.dev"])
    with pytest.raises(SystemExit) as exc:
        send_resend_test.main()
    assert exc.value.code == 1
    output = capsys.readouterr().out
    assert '"status": "failed"' in output
    assert "Proveedor no disponible" in output
    assert "private-details" not in output


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
