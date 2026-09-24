"""Widen Instagram/WhatsApp provider ids stored from Meta webhooks.

Revision ID: 20260924_0047
Revises: 20260922_0046
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260924_0047"
down_revision: str | Sequence[str] | None = "20260922_0046"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "chat_messages",
        "provider_message_id",
        existing_type=sa.String(length=128),
        type_=sa.String(length=512),
        existing_nullable=False,
    )
    op.alter_column(
        "chat_conversations",
        "provider_thread_id",
        existing_type=sa.String(length=128),
        type_=sa.String(length=512),
        existing_nullable=False,
    )
    op.alter_column(
        "chat_conversations",
        "participant_provider_id",
        existing_type=sa.String(length=128),
        type_=sa.String(length=512),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "chat_messages",
        "provider_message_id",
        existing_type=sa.String(length=512),
        type_=sa.String(length=128),
        existing_nullable=False,
        postgresql_using="left(provider_message_id, 128)",
    )
    op.alter_column(
        "chat_conversations",
        "provider_thread_id",
        existing_type=sa.String(length=512),
        type_=sa.String(length=128),
        existing_nullable=False,
        postgresql_using="left(provider_thread_id, 128)",
    )
    op.alter_column(
        "chat_conversations",
        "participant_provider_id",
        existing_type=sa.String(length=512),
        type_=sa.String(length=128),
        existing_nullable=False,
        postgresql_using="left(participant_provider_id, 128)",
    )
