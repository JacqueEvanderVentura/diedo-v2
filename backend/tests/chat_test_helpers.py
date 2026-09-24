"""Shared helpers for chat integration tests (isolated provider/message ids)."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from uuid import UUID, uuid7

from app.db.models import (
    ChatChannelAccount,
    ChatChannelAccountBranch,
    ChatConversation,
    ChatMessage,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

_FIXTURES = Path(__file__).resolve().parent / "fixtures"


def load_fixture(name: str) -> dict:
    return json.loads((_FIXTURES / name).read_text(encoding="utf-8"))


def whatsapp_payload(phone_number_id: str, message_id: str) -> dict:
    payload = copy.deepcopy(load_fixture("meta_whatsapp_text.json"))
    value = payload["entry"][0]["changes"][0]["value"]
    value["metadata"]["phone_number_id"] = phone_number_id
    value["messages"][0]["id"] = message_id
    return payload


def whatsapp_echo_payload(phone_number_id: str, message_id: str) -> dict:
    payload = copy.deepcopy(load_fixture("meta_whatsapp_echo.json"))
    value = payload["entry"][0]["changes"][0]["value"]
    value["metadata"]["phone_number_id"] = phone_number_id
    value["message_echoes"][0]["id"] = message_id
    return payload


def instagram_payload(page_id: str, message_id: str) -> dict:
    payload = copy.deepcopy(load_fixture("meta_instagram_text.json"))
    messaging = payload["entry"][0]["messaging"][0]
    messaging["recipient"]["id"] = page_id
    messaging["message"]["mid"] = message_id
    return payload


def seed_whatsapp_account(
    session: Session,
    *,
    workspace_id: UUID,
    branch_id: UUID,
    provider_account_id: str,
    access_token: str | None = None,
) -> ChatChannelAccount:
    existing = session.scalar(
        select(ChatChannelAccount).where(
            ChatChannelAccount.workspace_id == workspace_id,
            ChatChannelAccount.provider_account_id == provider_account_id,
        )
    )
    if existing is not None:
        return existing

    account = ChatChannelAccount(
        workspace_id=workspace_id,
        channel="whatsapp",
        provider_account_id=provider_account_id,
        display_name="WA demo",
        connection_status="connected",
        access_token_ciphertext=access_token,
    )
    session.add(account)
    session.flush()
    session.add(
        ChatChannelAccountBranch(
            workspace_id=workspace_id,
            channel_account_id=account.id,
            branch_id=branch_id,
        )
    )
    return account


def seed_whatsapp_conversation(
    session: Session,
    *,
    workspace_id: UUID,
    branch_id: UUID,
    tag: str | None = None,
) -> tuple[ChatConversation, UUID, str]:
    run_tag = tag or str(uuid7())
    provider_id = f"wa-phone-{run_tag}"
    account = seed_whatsapp_account(
        session,
        workspace_id=workspace_id,
        branch_id=branch_id,
        provider_account_id=provider_id,
        access_token="test-token",
    )
    thread_id = f"user-{run_tag}"
    conversation = ChatConversation(
        workspace_id=workspace_id,
        channel_account_id=account.id,
        provider_thread_id=thread_id,
        participant_provider_id=thread_id,
        participant_display_name=f"Cliente {run_tag}",
    )
    session.add(conversation)
    session.flush()
    session.add(
        ChatMessage(
            workspace_id=workspace_id,
            conversation_id=conversation.id,
            provider_message_id=f"wamid.inbound.{run_tag}",
            direction="inbound",
            body_text="Hola",
            delivery_status="received",
        )
    )
    session.flush()
    return conversation, branch_id, run_tag


def seed_instagram_conversation(
    session: Session,
    *,
    workspace_id: UUID,
    branch_id: UUID,
    tag: str | None = None,
) -> tuple[ChatConversation, UUID, str]:
    run_tag = tag or str(uuid7())
    provider_id = f"ig-page-{run_tag}"
    account = ChatChannelAccount(
        workspace_id=workspace_id,
        channel="instagram",
        provider_account_id=provider_id,
        display_name="@demo",
        connection_status="connected",
        access_token_ciphertext="ig-page-token",
    )
    session.add(account)
    session.flush()
    session.add(
        ChatChannelAccountBranch(
            workspace_id=workspace_id,
            channel_account_id=account.id,
            branch_id=branch_id,
        )
    )
    thread_id = f"ig-user-{run_tag}"
    conversation = ChatConversation(
        workspace_id=workspace_id,
        channel_account_id=account.id,
        provider_thread_id=thread_id,
        participant_provider_id=thread_id,
        participant_display_name=f"IG {run_tag}",
    )
    session.add(conversation)
    session.flush()
    session.add(
        ChatMessage(
            workspace_id=workspace_id,
            conversation_id=conversation.id,
            provider_message_id=f"mid.inbound.{run_tag}",
            direction="inbound",
            body_text="Hola IG",
            delivery_status="received",
        )
    )
    session.flush()
    return conversation, branch_id, run_tag
