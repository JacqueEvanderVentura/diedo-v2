"""Add agenda reminder scheduling metadata.

Revision ID: 20260916_0033
Revises: 20260915_0032
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260916_0033"
down_revision = "20260915_0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "appointments",
        sa.Column("schedule_revision", sa.Integer(), server_default="1", nullable=False),
    )
    op.add_column(
        "appointments",
        sa.Column(
            "schedule_changed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.add_column("email_notifications", sa.Column("event_type", sa.String(80)))
    op.add_column("email_notifications", sa.Column("sender", sa.String(320)))
    op.add_column("email_notifications", sa.Column("reply_to", sa.String(320)))
    op.add_column("email_notifications", sa.Column("scheduled_for", sa.DateTime(timezone=True)))
    op.add_column("email_notifications", sa.Column("next_attempt_at", sa.DateTime(timezone=True)))
    op.add_column(
        "email_notifications",
        sa.Column(
            "extra",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_email_notifications_due",
        "email_notifications",
        ["status", "next_attempt_at"],
    )
    op.create_index(
        "ix_email_notifications_appointment_event",
        "email_notifications",
        ["appointment_id", "event_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_email_notifications_appointment_event", table_name="email_notifications")
    op.drop_index("ix_email_notifications_due", table_name="email_notifications")
    op.drop_column("email_notifications", "extra")
    op.drop_column("email_notifications", "next_attempt_at")
    op.drop_column("email_notifications", "scheduled_for")
    op.drop_column("email_notifications", "reply_to")
    op.drop_column("email_notifications", "sender")
    op.drop_column("email_notifications", "event_type")
    op.drop_column("appointments", "schedule_changed_at")
    op.drop_column("appointments", "schedule_revision")
