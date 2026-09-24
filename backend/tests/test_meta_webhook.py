import hashlib
import hmac
import json
from pathlib import Path
from uuid import uuid7

import pytest
from app.config import settings
from app.db.models import (
    Branch,
    ChatChannelAccount,
    ChatChannelAccountBranch,
    ChatConversation,
    ChatMessage,
)
from app.db.session import session_scope
from app.services.chat.graph_clients import InstagramMessagingClient, WhatsAppCloudClient
from app.services.chat.meta_parsers import parse_meta_webhook_payload
from app.services.chat.meta_signature import verify_meta_signature
from app.services.local_bootstrap import bootstrap_local_foundation
from pydantic import SecretStr
from sqlalchemy import select

_FIXTURES = Path(__file__).resolve().parent / "fixtures"
_WEBHOOK_SECRET = "meta-test-app-secret-not-for-production"
_VERIFY_TOKEN = "meta-verify-token-test"


def _sign(body: bytes, secret: str = _WEBHOOK_SECRET) -> str:
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _load_fixture(name: str) -> dict:
    return json.loads((_FIXTURES / name).read_text(encoding="utf-8"))


def test_verify_meta_signature_roundtrip() -> None:
    payload = b'{"object":"whatsapp_business_account"}'
    signature = _sign(payload)
    assert verify_meta_signature(payload, signature, _WEBHOOK_SECRET)
    assert not verify_meta_signature(payload, "sha256=deadbeef", _WEBHOOK_SECRET)
    assert not verify_meta_signature(payload, None, _WEBHOOK_SECRET)


def test_parse_whatsapp_and_instagram_fixtures() -> None:
    wa_events = parse_meta_webhook_payload(_load_fixture("meta_whatsapp_text.json"))
    assert len(wa_events) == 1
    assert wa_events[0].channel == "whatsapp"
    assert wa_events[0].provider_account_id == "demo-phone-number-id"
    assert wa_events[0].body_text == "Hola desde WhatsApp"

    ig_events = parse_meta_webhook_payload(_load_fixture("meta_instagram_text.json"))
    assert len(ig_events) == 1
    assert ig_events[0].channel == "instagram"
    assert ig_events[0].provider_account_id == "demo-ig-page-id"
    assert ig_events[0].provider_message_id == "mid.DEMO_IG_INBOUND_001"

    sample = parse_meta_webhook_payload(
        {
            "object": "instagram",
            "entry": [
                {
                    "id": "17841400000000000",
                    "changes": [
                        {
                            "field": "messages",
                            "value": {
                                "sender": {"id": "12334"},
                                "recipient": {"id": "23245"},
                                "timestamp": "1527459824",
                                "message": {"mid": "random_mid", "text": "random_text"},
                            },
                        }
                    ],
                }
            ],
        }
    )
    assert len(sample) == 1
    assert sample[0].provider_account_id == "23245"
    assert sample[0].body_text == "random_text"


def test_graph_clients_use_injected_http() -> None:
    class FakeHttp:
        def __init__(self) -> None:
            self.calls: list[tuple[str, str, dict]] = []

        def request(self, method: str, url: str, **kwargs):
            self.calls.append((method, url, kwargs))
            if "messages" in url and kwargs.get("json", {}).get("messaging_product") == "whatsapp":
                return {"messages": [{"id": "wamid.sent.1"}]}
            return {"message_id": "mid.sent.1"}

    http = FakeHttp()
    wa_id = WhatsAppCloudClient(graph_api_version="v21.0", http_client=http).send_text(
        phone_number_id="pn-1",
        access_token="token",
        to="18095551234",
        body="Respuesta",
    )
    assert wa_id == "wamid.sent.1"
    ig_id = InstagramMessagingClient(graph_api_version="v21.0", http_client=http).send_text(
        ig_user_id="ig-1",
        access_token="token",
        recipient_id="user-1",
        body="Respuesta",
    )
    assert ig_id == "mid.sent.1"
    assert "graph.instagram.com" in http.calls[1][1]
    assert len(http.calls) == 2


@pytest.fixture
def meta_webhook_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "meta_app_secret", SecretStr(_WEBHOOK_SECRET))
    monkeypatch.setattr(settings, "meta_webhook_verify_token", SecretStr(_VERIFY_TOKEN))


@pytest.mark.integration
def test_meta_webhook_verify_challenge(client, meta_webhook_settings) -> None:
    response = client.get(
        "/api/v1/webhooks/meta",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": _VERIFY_TOKEN,
            "hub.challenge": "1234567890",
        },
    )
    assert response.status_code == 200
    assert response.text == "1234567890"


@pytest.mark.integration
def test_meta_webhook_verify_rejects_missing_or_wrong_token(client, meta_webhook_settings) -> None:
    missing = client.get("/api/v1/webhooks/meta")
    assert missing.status_code == 403

    wrong = client.get(
        "/api/v1/webhooks/meta",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "not-the-token",
            "hub.challenge": "123",
        },
    )
    assert wrong.status_code == 403


@pytest.mark.integration
def test_meta_webhook_rejects_invalid_signature(client, meta_webhook_settings) -> None:
    body = json.dumps(_load_fixture("meta_whatsapp_text.json")).encode("utf-8")
    response = client.post(
        "/api/v1/webhooks/meta",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": "sha256=invalid",
        },
    )
    assert response.status_code == 403


@pytest.mark.integration
def test_meta_webhook_accepts_instagram_app_secret(
    client, meta_webhook_settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    instagram_secret = "ig-webhook-secret-not-the-facebook-one"
    monkeypatch.setattr(settings, "meta_instagram_app_secret", SecretStr(instagram_secret))
    body = json.dumps(_load_fixture("meta_instagram_text.json")).encode("utf-8")
    response = client.post(
        "/api/v1/webhooks/meta",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": _sign(body, instagram_secret),
        },
    )
    assert response.status_code == 200
    assert response.json()["success"] is True


@pytest.mark.integration
def test_meta_webhook_rejects_oversized_payload(client, meta_webhook_settings) -> None:
    from app.api.routers.meta_webhooks import MAX_META_WEBHOOK_BYTES

    body = b"{" + (b"a" * (MAX_META_WEBHOOK_BYTES + 1)) + b"}"
    response = client.post(
        "/api/v1/webhooks/meta",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": _sign(body),
        },
    )
    assert response.status_code == 413


@pytest.mark.integration
def test_meta_webhook_ingests_whatsapp_idempotently(client, meta_webhook_settings) -> None:
    from tests.chat_test_helpers import seed_whatsapp_account, whatsapp_payload

    phone_id = f"demo-wa-{uuid7()}"
    message_id = f"wamid.{uuid7()}"
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        seed_whatsapp_account(
            session,
            workspace_id=summary.workspace_id,
            branch_id=summary.branch_id,
            provider_account_id=phone_id,
        )
        workspace_id = summary.workspace_id

    payload = whatsapp_payload(phone_id, message_id)
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": _sign(body),
    }

    first = client.post("/api/v1/webhooks/meta", content=body, headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["success"] is True

    second = client.post("/api/v1/webhooks/meta", content=body, headers=headers)
    assert second.status_code == 200

    with session_scope() as session:
        messages = session.scalars(
            select(ChatMessage).where(
                ChatMessage.workspace_id == workspace_id,
                ChatMessage.provider_message_id == message_id,
            )
        ).all()
        assert len(messages) == 1
        assert messages[0].body_text == "Hola desde WhatsApp"


@pytest.mark.integration
def test_meta_webhook_ingests_instagram(client, meta_webhook_settings) -> None:
    from tests.chat_test_helpers import instagram_payload

    page_id = f"ig-page-{uuid7()}"
    message_id = f"mid.{uuid7()}"
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        session.add(
            ChatChannelAccount(
                workspace_id=summary.workspace_id,
                channel="instagram",
                provider_account_id=page_id,
                display_name="IG demo",
                connection_status="connected",
            )
        )
        workspace_id = summary.workspace_id

    payload = instagram_payload(page_id, message_id)
    body = json.dumps(payload).encode("utf-8")
    response = client.post(
        "/api/v1/webhooks/meta",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": _sign(body),
        },
    )
    assert response.status_code == 200, response.text
    with session_scope() as session:
        message = session.scalar(
            select(ChatMessage).where(
                ChatMessage.workspace_id == workspace_id,
                ChatMessage.provider_message_id == message_id,
            )
        )
        assert message is not None
        assert message.body_text == "Hola desde Instagram"


@pytest.mark.integration
def test_meta_webhook_unknown_account_returns_200(client, meta_webhook_settings) -> None:
    from tests.chat_test_helpers import whatsapp_payload

    phone_id = f"unregistered-{uuid7()}"
    message_id = f"wamid.{uuid7()}"
    body = json.dumps(whatsapp_payload(phone_id, message_id)).encode("utf-8")
    response = client.post(
        "/api/v1/webhooks/meta",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": _sign(body),
        },
    )
    assert response.status_code == 200, response.text
    with session_scope() as session:
        stored = session.scalar(
            select(ChatMessage).where(ChatMessage.provider_message_id == message_id)
        )
        assert stored is None


@pytest.mark.integration
def test_meta_webhook_unknown_object_returns_200(client, meta_webhook_settings) -> None:
    payload = {"object": "user", "entry": []}
    body = json.dumps(payload).encode("utf-8")
    response = client.post(
        "/api/v1/webhooks/meta",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": _sign(body),
        },
    )
    assert response.status_code == 200
    assert response.json()["success"] is True


@pytest.mark.integration
def test_shared_account_keeps_single_conversation(client, meta_webhook_settings) -> None:
    from tests.chat_test_helpers import seed_whatsapp_account, whatsapp_payload

    phone_id = f"shared-wa-{uuid7()}"
    message_id = f"wamid.{uuid7()}"
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        second = Branch(
            workspace_id=summary.workspace_id,
            legal_entity_id=summary.legal_entity_id,
            code=str(uuid7()).replace("-", "")[:32],
            name="Sucursal B",
            timezone="America/Santo_Domingo",
        )
        session.add(second)
        session.flush()
        account = seed_whatsapp_account(
            session,
            workspace_id=summary.workspace_id,
            branch_id=summary.branch_id,
            provider_account_id=phone_id,
        )
        session.add(
            ChatChannelAccountBranch(
                workspace_id=summary.workspace_id,
                channel_account_id=account.id,
                branch_id=second.id,
            )
        )
        workspace_id = summary.workspace_id
        account_id = account.id

    body = json.dumps(whatsapp_payload(phone_id, message_id)).encode("utf-8")
    response = client.post(
        "/api/v1/webhooks/meta",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": _sign(body),
        },
    )
    assert response.status_code == 200, response.text
    with session_scope() as session:
        conversations = session.scalars(
            select(ChatConversation).where(
                ChatConversation.workspace_id == workspace_id,
                ChatConversation.channel_account_id == account_id,
            )
        ).all()
        messages = session.scalars(
            select(ChatMessage).where(
                ChatMessage.workspace_id == workspace_id,
                ChatMessage.provider_message_id == message_id,
            )
        ).all()
        assert len(conversations) == 1
        assert len(messages) == 1
