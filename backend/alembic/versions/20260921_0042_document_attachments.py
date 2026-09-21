"""Document attachments for finance, POS, and purchasing.

Revision ID: 20260921_0042
Revises: 20260921_0041
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260921_0042"
down_revision: str | Sequence[str] | None = "20260921_0041"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "document_attachments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("uuidv7()"),
            nullable=False,
        ),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("finance_expense_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("finance_fixed_expense_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("finance_manual_income_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("cash_movement_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("purchase_request_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=False),
        sa.Column("uploaded_by_platform_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "num_nonnulls(finance_expense_id, finance_fixed_expense_id, "
            "finance_manual_income_id, cash_movement_id, purchase_request_id) = 1",
            name="single_owner",
        ),
        sa.CheckConstraint(
            "size_bytes > 0 AND size_bytes <= 10485760",
            name="size_range",
        ),
        sa.CheckConstraint("char_length(checksum_sha256) = 64", name="checksum_length"),
        sa.CheckConstraint(
            "content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif', "
            "'application/pdf')",
            name="content_type_values",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name="fk_document_attachments_workspace",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "finance_expense_id"],
            ["finance_expenses.workspace_id", "finance_expenses.id"],
            name="fk_document_attachments_workspace_finance_expense",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "finance_fixed_expense_id"],
            ["finance_fixed_expenses.workspace_id", "finance_fixed_expenses.id"],
            name="fk_document_attachments_workspace_finance_fixed",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "finance_manual_income_id"],
            ["finance_manual_incomes.workspace_id", "finance_manual_incomes.id"],
            name="fk_document_attachments_workspace_finance_income",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "cash_movement_id"],
            ["cash_movements.workspace_id", "cash_movements.id"],
            name="fk_document_attachments_workspace_cash_movement",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "purchase_request_id"],
            ["purchase_requests.workspace_id", "purchase_requests.id"],
            name="fk_document_attachments_workspace_purchase_request",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_platform_user_id"],
            ["platform_users.id"],
            name="fk_document_attachments_uploader",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "id", name="uq_document_attachments_workspace_id"),
        sa.UniqueConstraint("workspace_id", "storage_key", name="uq_document_attachments_storage_key"),
    )
    op.create_index(
        "ix_document_attachments_finance_expense",
        "document_attachments",
        ["workspace_id", "finance_expense_id"],
    )
    op.create_index(
        "ix_document_attachments_finance_fixed",
        "document_attachments",
        ["workspace_id", "finance_fixed_expense_id"],
    )
    op.create_index(
        "ix_document_attachments_finance_income",
        "document_attachments",
        ["workspace_id", "finance_manual_income_id"],
    )
    op.create_index(
        "ix_document_attachments_cash_movement",
        "document_attachments",
        ["workspace_id", "cash_movement_id"],
    )
    op.create_index(
        "ix_document_attachments_purchase_request",
        "document_attachments",
        ["workspace_id", "purchase_request_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_document_attachments_purchase_request", table_name="document_attachments")
    op.drop_index("ix_document_attachments_cash_movement", table_name="document_attachments")
    op.drop_index("ix_document_attachments_finance_income", table_name="document_attachments")
    op.drop_index("ix_document_attachments_finance_fixed", table_name="document_attachments")
    op.drop_index("ix_document_attachments_finance_expense", table_name="document_attachments")
    op.drop_table("document_attachments")
