from datetime import UTC, datetime, timedelta
from uuid import uuid7

import pytest
from app.core.security import hash_password
from app.db.models import (
    Branch,
    ChatChannelAccount,
    ChatChannelAccountBranch,
    ChatConversation,
    ChatMessage,
)
from app.db.session import session_scope
from app.services.chat.graph_clients import WhatsAppCloudClient
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from tests.chat_test_helpers import seed_whatsapp_conversation

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "chat-api-owner-password-not-a-secret"


def _login(client: TestClient) -> dict[str, str]:
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OWNER_PASSWORD))
    login = client.post(
        "/api/v1/auth/login",
        json={"email": _OWNER_EMAIL, "password": _OWNER_PASSWORD},
    )
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['accessToken']}"}


@pytest.mark.integration
def test_chat_api_requires_auth(client: TestClient) -> None:
    assert client.get("/api/v1/chat/conversations").status_code == 401


@pytest.mark.integration
def test_chat_api_list_and_messages(client: TestClient) -> None:
    headers = _login(client)
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        conversation, branch_id, tag = seed_whatsapp_conversation(
            session,
            workspace_id=summary.workspace_id,
            branch_id=summary.branch_id,
        )

    listed = client.get(
        "/api/v1/chat/conversations",
        headers=headers,
        params={"branchId": str(branch_id), "search": tag},
    )
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert body["totalItems"] == 1
    assert body["items"][0]["messagingWindowOpen"] is True
    assert body["items"][0]["channel"] == "whatsapp"

    messages = client.get(
        f"/api/v1/chat/conversations/{conversation.id}/messages",
        headers=headers,
    )
    assert messages.status_code == 200
    assert messages.json()["totalItems"] == 1
    assert messages.json()["items"][0]["bodyText"] == "Hola"


@pytest.mark.integration
def test_chat_api_send_message(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    headers = _login(client)
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        conversation, _, _ = seed_whatsapp_conversation(
            session,
            workspace_id=summary.workspace_id,
            branch_id=summary.branch_id,
        )

    def fake_send(self, **kwargs):
        assert kwargs["access_token"] == "test-token"
        return f"wamid.outbound.{uuid7()}"

    monkeypatch.setattr(WhatsAppCloudClient, "send_text", fake_send)

    sent = client.post(
        f"/api/v1/chat/conversations/{conversation.id}/messages",
        headers=headers,
        json={"body": "Desde HTTP"},
    )
    assert sent.status_code == 201, sent.text
    assert sent.json()["bodyText"] == "Desde HTTP"
    assert sent.json()["direction"] == "outbound"


@pytest.mark.integration
def test_chat_api_send_rejects_expired_window(client: TestClient) -> None:
    headers = _login(client)
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        conversation, _, _ = seed_whatsapp_conversation(
            session,
            workspace_id=summary.workspace_id,
            branch_id=summary.branch_id,
        )
        message_id = session.scalar(
            select(ChatMessage.id).where(ChatMessage.conversation_id == conversation.id)
        )
        assert message_id is not None
        session.execute(
            update(ChatMessage)
            .where(ChatMessage.id == message_id)
            .values(created_at=datetime.now(UTC) - timedelta(hours=25))
        )

    response = client.post(
        f"/api/v1/chat/conversations/{conversation.id}/messages",
        headers=headers,
        json={"body": "Tarde"},
    )
    assert response.status_code == 400
    body = response.json()
    parameter = body.get("parameter") or body.get("detail", {}).get("parameter")
    assert parameter == "messagingWindow"


@pytest.mark.integration
def test_chat_api_branch_filter_hides_other_branch_account(client: TestClient) -> None:
    headers = _login(client)
    main_branch_id = None
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        main_branch_id = summary.branch_id
        other = Branch(
            workspace_id=summary.workspace_id,
            legal_entity_id=summary.legal_entity_id,
            code=str(uuid7()).replace("-", "")[:32],
            name="Otra",
            timezone="America/Santo_Domingo",
        )
        session.add(other)
        session.flush()
        account = ChatChannelAccount(
            workspace_id=summary.workspace_id,
            channel="whatsapp",
            provider_account_id=f"only-other-branch-{uuid7()}",
            display_name="WA B",
            connection_status="connected",
        )
        session.add(account)
        session.flush()
        session.add(
            ChatChannelAccountBranch(
                workspace_id=summary.workspace_id,
                channel_account_id=account.id,
                branch_id=other.id,
            )
        )
        session.add(
            ChatConversation(
                workspace_id=summary.workspace_id,
                channel_account_id=account.id,
                provider_thread_id="1999",
                participant_provider_id="1999",
            )
        )

    only_main = client.get(
        "/api/v1/chat/conversations",
        headers=headers,
        params={"branchId": str(main_branch_id)},
    )
    assert only_main.status_code == 200
    items = only_main.json()["items"]
    assert not any(item["participantProviderId"] == "1999" for item in items)
