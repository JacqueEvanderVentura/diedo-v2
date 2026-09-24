"""Store Instagram usernames separately from conversation display names.

Revision ID: 20260924_0048
Revises: 20260924_0047
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260924_0048"
down_revision: str | Sequence[str] | None = "20260924_0047"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "chat_conversations",
        sa.Column(
            "participant_username",
            sa.String(length=160),
            server_default="",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("chat_conversations", "participant_username")
