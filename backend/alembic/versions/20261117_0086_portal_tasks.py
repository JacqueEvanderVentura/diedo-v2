"""Portal task templates and customer completions (informed consent).

Revision ID: 20261117_0086
Revises: 20261030_0085
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261117_0086"
down_revision: str | Sequence[str] | None = "20261030_0085"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "portal_task_templates",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("uuidv7()"),
            nullable=False,
        ),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("checkbox_label", sa.Text(), nullable=False),
        sa.Column(
            "kind",
            sa.String(length=32),
            server_default=sa.text("'consent_document'"),
            nullable=False,
        ),
        sa.Column(
            "is_default_for_all",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=False),
        sa.Column("created_by_platform_user_id", postgresql.UUID(as_uuid=True), nullable=False),
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
        sa.CheckConstraint("kind IN ('consent_document')", name="kind_values"),
        sa.CheckConstraint(
            "size_bytes > 0 AND size_bytes <= 10485760",
            name="size_range",
        ),
        sa.CheckConstraint("char_length(checksum_sha256) = 64", name="checksum_length"),
        sa.CheckConstraint("content_type = 'application/pdf'", name="content_type_pdf"),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name="fk_portal_task_templates_workspace",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"],
            ["platform_users.id"],
            name="fk_portal_task_templates_creator",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "id", name="uq_portal_task_templates_workspace_id"),
        sa.UniqueConstraint("storage_key", name="uq_portal_task_templates_storage_key"),
    )
    op.create_index(
        "ix_portal_task_templates_workspace_default",
        "portal_task_templates",
        ["workspace_id", "is_default_for_all", "is_active"],
    )

    op.create_table(
        "portal_task_completions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("uuidv7()"),
            nullable=False,
        ),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name="fk_portal_task_completions_workspace",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "template_id"],
            ["portal_task_templates.workspace_id", "portal_task_templates.id"],
            name="fk_portal_task_completions_template",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            name="fk_portal_task_completions_customer",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "id", name="uq_portal_task_completions_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id",
            "template_id",
            "customer_id",
            name="uq_portal_task_completion_customer",
        ),
    )
    op.create_index(
        "ix_portal_task_completions_customer",
        "portal_task_completions",
        ["workspace_id", "customer_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_portal_task_completions_customer", table_name="portal_task_completions")
    op.drop_table("portal_task_completions")
    op.drop_index("ix_portal_task_templates_workspace_default", table_name="portal_task_templates")
    op.drop_table("portal_task_templates")
