"""Add asset image attachments.

Revision ID: 20260908_0023
Revises: 20260908_0022
Create Date: 2026-09-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260908_0023"
down_revision: str | Sequence[str] | None = "20260908_0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "asset_attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("uploaded_by_membership_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("size_bytes > 0", name="size_positive"),
        sa.CheckConstraint("char_length(checksum_sha256) = 64", name="checksum_length"),
        sa.CheckConstraint(
            "content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')",
            name="content_type_values",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "asset_id"],
            ["assets.workspace_id", "assets.id"],
            name="fk_asset_attachments_workspace_asset",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "uploaded_by_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            name="fk_asset_attachments_workspace_uploader",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_asset_attachments_workspace_asset_created",
        "asset_attachments",
        ["workspace_id", "asset_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_asset_attachments_workspace_asset_created", table_name="asset_attachments")
    op.drop_table("asset_attachments")
