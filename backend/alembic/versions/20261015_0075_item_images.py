"""Primary catalog item images for POS and inventory.

Revision ID: 20261015_0075
Revises: 20261015_0074
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261015_0075"
down_revision: str | Sequence[str] | None = "20261015_0074"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "item_images",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("uuidv7()"),
            nullable=False,
        ),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("item_id", postgresql.UUID(as_uuid=True), nullable=False),
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
        sa.CheckConstraint("size_bytes > 0", name=op.f("ck_item_images_size_positive")),
        sa.CheckConstraint(
            "char_length(checksum_sha256) = 64",
            name=op.f("ck_item_images_checksum_length"),
        ),
        sa.CheckConstraint(
            "content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')",
            name=op.f("ck_item_images_content_type_values"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "item_id"],
            ["items.workspace_id", "items.id"],
            name=op.f("fk_item_images_workspace_item"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "uploaded_by_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            name=op.f("fk_item_images_workspace_uploader"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "item_id", name=op.f("uq_item_images_workspace_item")),
    )


def downgrade() -> None:
    op.drop_table("item_images")
