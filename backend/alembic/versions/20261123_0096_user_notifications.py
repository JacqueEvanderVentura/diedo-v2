"""In-app user notification inbox."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261123_0096"
down_revision: str | Sequence[str] | None = "20261122_0095"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_notifications",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("uuidv7()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("membership_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("event_key", sa.String(length=200), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "priority",
            sa.String(length=16),
            server_default=sa.text("'normal'"),
            nullable=False,
        ),
        sa.Column(
            "link",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "priority IN ('normal', 'alta')",
            name=op.f("ck_user_notifications_priority_values"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_user_notifications_workspace_id_workspaces"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            name=op.f("fk_user_notifications_membership"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_notifications")),
        sa.UniqueConstraint(
            "workspace_id",
            "membership_id",
            "event_key",
            name="uq_user_notifications_event",
        ),
    )
    op.create_index(
        "ix_user_notifications_membership_created",
        "user_notifications",
        ["workspace_id", "membership_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_user_notifications_membership_unread",
        "user_notifications",
        ["workspace_id", "membership_id", "read_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_user_notifications_membership_unread", table_name="user_notifications")
    op.drop_index("ix_user_notifications_membership_created", table_name="user_notifications")
    op.drop_table("user_notifications")
