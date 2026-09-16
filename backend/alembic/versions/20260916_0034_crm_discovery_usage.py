"""Add CRM lead discovery usage counters.

Revision ID: 20260916_0034
Revises: 20260916_0033
"""

import sqlalchemy as sa
from alembic import op

revision = "20260916_0034"
down_revision = "20260916_0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_discovery_usage",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("hour_window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hour_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("month_key", sa.String(length=7), nullable=False),
        sa.Column("month_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_provider", sa.String(length=16)),
        sa.Column("last_status", sa.String(length=32)),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("char_length(month_key) = 7", name="crm_discovery_month_key_length"),
        sa.CheckConstraint("hour_count >= 0", name="crm_discovery_hour_count_non_negative"),
        sa.CheckConstraint("month_count >= 0", name="crm_discovery_month_count_non_negative"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", name="uq_crm_discovery_usage_workspace"),
    )


def downgrade() -> None:
    op.drop_table("crm_discovery_usage")
