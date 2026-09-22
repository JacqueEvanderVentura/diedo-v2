from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models.chat import ChatChannelAccount, ChatConversation, ChatMessage
from app.services.chat.meta_parsers import (
    InboundTextMessage,
    message_preview,
    parse_meta_webhook_payload,
)

logger = logging.getLogger(__name__)


class ChatInboundService:
    def ingest_webhook_payload(self, session: Session, payload: dict[str, Any]) -> int:
        events = parse_meta_webhook_payload(payload)
        ingested = 0
        for event in events:
            ingested += self._ingest_text_message(session, event)
        return ingested

    def _ingest_text_message(self, session: Session, event: InboundTextMessage) -> int:
        accounts = session.scalars(
            select(ChatChannelAccount).where(
                ChatChannelAccount.channel == event.channel,
                ChatChannelAccount.provider_account_id == event.provider_account_id,
            )
        ).all()
        if not accounts:
            logger.info(
                "meta webhook: no chat_channel_account for channel=%s provider_account_id=%s",
                event.channel,
                event.provider_account_id,
            )
            return 0

        stored = 0
        for account in accounts:
            if self._store_message_for_account(session, account, event):
                stored += 1
        return stored

    def _store_message_for_account(
        self,
        session: Session,
        account: ChatChannelAccount,
        event: InboundTextMessage,
    ) -> bool:
        existing = session.scalar(
            select(ChatMessage.id).where(
                ChatMessage.workspace_id == account.workspace_id,
                ChatMessage.provider_message_id == event.provider_message_id,
            )
        )
        if existing is not None:
            return False

        conversation = session.scalar(
            select(ChatConversation).where(
                ChatConversation.workspace_id == account.workspace_id,
                ChatConversation.channel_account_id == account.id,
                ChatConversation.provider_thread_id == event.provider_thread_id,
            )
        )
        if conversation is None:
            conversation = ChatConversation(
                workspace_id=account.workspace_id,
                channel_account_id=account.id,
                provider_thread_id=event.provider_thread_id,
                participant_provider_id=event.participant_provider_id,
                participant_display_name=event.participant_display_name or "",
            )
            session.add(conversation)
            session.flush()

        message = ChatMessage(
            workspace_id=account.workspace_id,
            conversation_id=conversation.id,
            provider_message_id=event.provider_message_id,
            direction="inbound",
            body_text=event.body_text,
            delivery_status="received",
        )
        try:
            with session.begin_nested():
                session.add(message)
                session.flush()
        except IntegrityError:
            return False

        preview = message_preview(event.body_text)
        conversation.last_message_preview = preview
        conversation.last_message_at = event.sent_at or session.scalar(select(func.now()))
        conversation.version += 1
        return True
