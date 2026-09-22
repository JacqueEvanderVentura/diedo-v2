"""Temporary Meta OAuth sessions for channel account connection (phase 5).

Revision ID: 20260922_0046
Revises: 20260922_0045
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260922_0046"
down_revision: str | Sequence[str] | None = "20260922_0045"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chat_oauth_states",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("candidates_json", sa.JSON(), server_default=sa.text("'[]'::json"), nullable=False),
        sa.Column("tokens_json", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "channel IN ('instagram', 'whatsapp')",
            name=op.f("ck_chat_oauth_states_channel"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_chat_oauth_states_workspace_id_workspaces"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chat_oauth_states")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_chat_oauth_states_workspace_id"),
    )
    op.create_index(
        "ix_chat_oauth_states_workspace_expires",
        "chat_oauth_states",
        ["workspace_id", "expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_chat_oauth_states_workspace_expires", table_name="chat_oauth_states")
    op.drop_table("chat_oauth_states")
