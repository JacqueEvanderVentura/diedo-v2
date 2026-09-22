from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.models.chat import (
    ChatChannelAccount,
    ChatChannelAccountBranch,
    ChatConversation,
    ChatMessage,
)


@dataclass(frozen=True)
class ConversationListRecord:
    conversation: ChatConversation
    channel: str


@dataclass(frozen=True)
class ConversationPage:
    items: list[ConversationListRecord]
    total_items: int


@dataclass(frozen=True)
class MessagePage:
    items: list[ChatMessage]
    total_items: int


class ChatRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_visible_account_ids(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> set[UUID]:
        statement = select(ChatChannelAccountBranch.channel_account_id).where(
            ChatChannelAccountBranch.workspace_id == workspace_id,
        )
        if branch_id is not None:
            statement = statement.where(ChatChannelAccountBranch.branch_id == branch_id)
        elif visible_branch_ids is not None:
            statement = statement.where(
                ChatChannelAccountBranch.branch_id.in_(visible_branch_ids)
            )
        return set(self._session.scalars(statement.distinct()).all())

    def list_conversations(
        self,
        *,
        workspace_id: UUID,
        account_ids: set[UUID],
        channel: str | None,
        search: str | None,
        page: int,
        page_size: int,
    ) -> ConversationPage:
        if not account_ids:
            return ConversationPage(items=[], total_items=0)

        filters = [
            ChatConversation.workspace_id == workspace_id,
            ChatConversation.channel_account_id.in_(account_ids),
        ]
        statement = (
            select(ChatConversation, ChatChannelAccount.channel)
            .join(
                ChatChannelAccount,
                (ChatChannelAccount.workspace_id == ChatConversation.workspace_id)
                & (ChatChannelAccount.id == ChatConversation.channel_account_id),
            )
            .where(*filters)
        )
        if channel is not None:
            statement = statement.where(ChatChannelAccount.channel == channel)
        if search:
            pattern = f"%{search}%"
            statement = statement.where(
                or_(
                    ChatConversation.participant_display_name.ilike(pattern),
                    ChatConversation.last_message_preview.ilike(pattern),
                    ChatConversation.participant_provider_id.ilike(pattern),
                )
            )

        count_statement = select(func.count()).select_from(statement.subquery())
        total_items = int(self._session.scalar(count_statement) or 0)

        rows = self._session.execute(
            statement.order_by(
                ChatConversation.last_message_at.desc().nullslast(),
                ChatConversation.updated_at.desc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        items = [
            ConversationListRecord(conversation=row[0], channel=str(row[1])) for row in rows
        ]
        return ConversationPage(items=items, total_items=total_items)

    def get_conversation_with_channel(
        self,
        *,
        workspace_id: UUID,
        conversation_id: UUID,
    ) -> ConversationListRecord | None:
        row = self._session.execute(
            select(ChatConversation, ChatChannelAccount.channel)
            .join(
                ChatChannelAccount,
                (ChatChannelAccount.workspace_id == ChatConversation.workspace_id)
                & (ChatChannelAccount.id == ChatConversation.channel_account_id),
            )
            .where(
                ChatConversation.workspace_id == workspace_id,
                ChatConversation.id == conversation_id,
            )
        ).one_or_none()
        if row is None:
            return None
        return ConversationListRecord(conversation=row[0], channel=str(row[1]))

    def assigned_branch_ids(self, *, workspace_id: UUID, channel_account_id: UUID) -> list[UUID]:
        return list(
            self._session.scalars(
                select(ChatChannelAccountBranch.branch_id)
                .where(
                    ChatChannelAccountBranch.workspace_id == workspace_id,
                    ChatChannelAccountBranch.channel_account_id == channel_account_id,
                )
                .order_by(ChatChannelAccountBranch.branch_id)
            ).all()
        )

    def get_channel_account(
        self, *, workspace_id: UUID, account_id: UUID
    ) -> ChatChannelAccount | None:
        return self._session.scalar(
            select(ChatChannelAccount).where(
                ChatChannelAccount.workspace_id == workspace_id,
                ChatChannelAccount.id == account_id,
            )
        )

    def list_messages(
        self,
        *,
        workspace_id: UUID,
        conversation_id: UUID,
        page: int,
        page_size: int,
    ) -> MessagePage:
        filters = [
            ChatMessage.workspace_id == workspace_id,
            ChatMessage.conversation_id == conversation_id,
        ]
        total_items = int(
            self._session.scalar(
                select(func.count()).select_from(ChatMessage).where(*filters)
            )
            or 0
        )
        items = list(
            self._session.scalars(
                select(ChatMessage)
                .where(*filters)
                .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            ).all()
        )
        return MessagePage(items=items, total_items=total_items)

    def last_inbound_at(
        self, *, workspace_id: UUID, conversation_id: UUID
    ) -> datetime | None:
        return self._session.scalar(
            select(func.max(ChatMessage.created_at)).where(
                ChatMessage.workspace_id == workspace_id,
                ChatMessage.conversation_id == conversation_id,
                ChatMessage.direction == "inbound",
            )
        )
