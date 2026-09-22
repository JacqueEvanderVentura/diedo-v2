from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin, VersionMixin


class ChatChannelAccount(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    """Connected Instagram or WhatsApp identity for a workspace (token stored server-side only)."""

    __tablename__ = "chat_channel_accounts"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_chat_channel_accounts_workspace_id"),
        UniqueConstraint(
            "workspace_id",
            "channel",
            "provider_account_id",
            name="uq_chat_channel_accounts_workspace_channel_provider",
        ),
        CheckConstraint(
            "channel IN ('instagram', 'whatsapp')",
            name="ck_chat_channel_accounts_channel",
        ),
        CheckConstraint(
            "connection_status IN ('disconnected', 'connected', 'error')",
            name="ck_chat_channel_accounts_connection_status",
        ),
        ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name="fk_chat_channel_accounts_workspace_id_workspaces",
            ondelete="RESTRICT",
        ),
        Index(
            "ix_chat_channel_accounts_workspace_channel",
            "workspace_id",
            "channel",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    provider_account_id: Mapped[str] = mapped_column(String(128), nullable=False)
    display_name: Mapped[str] = mapped_column(String(160), server_default="", nullable=False)
    access_token_ciphertext: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    connection_status: Mapped[str] = mapped_column(
        String(16), server_default=text("'disconnected'"), nullable=False
    )


class ChatOauthState(UuidPrimaryKeyMixin, Base):
    """Short-lived OAuth handshake state; tokens never leave the server."""

    __tablename__ = "chat_oauth_states"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_chat_oauth_states_workspace_id"),
        CheckConstraint(
            "channel IN ('instagram', 'whatsapp')",
            name="ck_chat_oauth_states_channel",
        ),
        ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name="fk_chat_oauth_states_workspace_id_workspaces",
            ondelete="CASCADE",
        ),
        Index("ix_chat_oauth_states_workspace_expires", "workspace_id", "expires_at"),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    candidates_json: Mapped[list] = mapped_column(JSONB, server_default=text("'[]'"), nullable=False)
    tokens_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class ChatChannelAccountBranch(Base):
    """Assigns a channel account to one or more branches (N branches may share one account)."""

    __tablename__ = "chat_channel_account_branches"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "channel_account_id"],
            ["chat_channel_accounts.workspace_id", "chat_channel_accounts.id"],
            name="fk_chat_channel_account_branches_workspace_account",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_chat_channel_account_branches_workspace_branch",
            ondelete="RESTRICT",
        ),
        UniqueConstraint(
            "channel_account_id",
            "branch_id",
            name="uq_chat_channel_account_branches_account_branch",
        ),
        Index(
            "ix_chat_channel_account_branches_workspace_branch",
            "workspace_id",
            "branch_id",
        ),
    )

    channel_account_id: Mapped[UUID] = mapped_column(primary_key=True)
    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    branch_id: Mapped[UUID] = mapped_column(primary_key=True)


class ChatConversation(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "chat_conversations"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_chat_conversations_workspace_id"),
        UniqueConstraint(
            "workspace_id",
            "channel_account_id",
            "provider_thread_id",
            name="uq_chat_conversations_workspace_account_thread",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "channel_account_id"],
            ["chat_channel_accounts.workspace_id", "chat_channel_accounts.id"],
            name="fk_chat_conversations_workspace_account",
            ondelete="RESTRICT",
        ),
        Index(
            "ix_chat_conversations_workspace_account_last_message",
            "workspace_id",
            "channel_account_id",
            "last_message_at",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    channel_account_id: Mapped[UUID] = mapped_column(nullable=False)
    provider_thread_id: Mapped[str] = mapped_column(String(128), nullable=False)
    participant_provider_id: Mapped[str] = mapped_column(String(128), nullable=False)
    participant_display_name: Mapped[str] = mapped_column(
        String(160), server_default="", nullable=False
    )
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_message_preview: Mapped[str] = mapped_column(
        String(280), server_default="", nullable=False
    )


class ChatMessage(UuidPrimaryKeyMixin, Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_chat_messages_workspace_id"),
        UniqueConstraint(
            "workspace_id",
            "provider_message_id",
            name="uq_chat_messages_workspace_provider_message",
        ),
        CheckConstraint(
            "direction IN ('inbound', 'outbound')",
            name="ck_chat_messages_direction",
        ),
        CheckConstraint(
            "delivery_status IN ('received', 'sent', 'failed', 'pending')",
            name="ck_chat_messages_delivery_status",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "conversation_id"],
            ["chat_conversations.workspace_id", "chat_conversations.id"],
            name="fk_chat_messages_workspace_conversation",
            ondelete="CASCADE",
        ),
        Index(
            "ix_chat_messages_workspace_conversation_created",
            "workspace_id",
            "conversation_id",
            "created_at",
        ),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    conversation_id: Mapped[UUID] = mapped_column(nullable=False)
    provider_message_id: Mapped[str] = mapped_column(String(128), nullable=False)
    direction: Mapped[str] = mapped_column(String(16), nullable=False)
    body_text: Mapped[str] = mapped_column(Text, server_default="", nullable=False)
    delivery_status: Mapped[str] = mapped_column(
        String(16), server_default=text("'received'"), nullable=False
    )
