"""Allow finance-only corrections over immutable POS income projections.

Revision ID: 20260907_0020
Revises: 20260903_0019
Create Date: 2026-09-07

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260907_0020"
down_revision: str | Sequence[str] | None = "20260903_0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "finance_pos_income_corrections",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("sale_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("category", sa.String(length=48), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("income_date", sa.Date(), nullable=False),
        sa.Column("customer", sa.String(length=200), server_default="", nullable=False),
        sa.Column("payment_status", sa.String(length=16), nullable=False),
        sa.Column("record_status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_by_platform_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
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
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.CheckConstraint(
            "char_length(category) > 0",
            name=op.f("ck_finance_pos_income_corrections_category_not_empty"),
        ),
        sa.CheckConstraint(
            "amount > 0",
            name=op.f("ck_finance_pos_income_corrections_amount_positive"),
        ),
        sa.CheckConstraint(
            "payment_status IN ('pagado', 'pendiente')",
            name=op.f("ck_finance_pos_income_corrections_payment_status_values"),
        ),
        sa.CheckConstraint(
            "record_status IN ('active', 'voided')",
            name=op.f("ck_finance_pos_income_corrections_record_status_values"),
        ),
        sa.CheckConstraint(
            "(record_status = 'active' AND voided_at IS NULL AND "
            "voided_by_platform_user_id IS NULL) OR "
            "(record_status = 'voided' AND voided_at IS NOT NULL AND "
            "voided_by_platform_user_id IS NOT NULL)",
            name=op.f("ck_finance_pos_income_corrections_void_state_consistent"),
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["workspace_id", "sale_id"],
            ["sales.workspace_id", "sales.id"],
            name="fk_finance_pos_income_corrections_workspace_sale",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_finance_pos_income_corrections_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["voided_by_platform_user_id"], ["platform_users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"], ["platform_users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"], ["platform_users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_finance_pos_income_corrections")),
        sa.UniqueConstraint(
            "workspace_id", "id", name="uq_finance_pos_income_corrections_workspace_id"
        ),
        sa.UniqueConstraint(
            "workspace_id",
            "sale_id",
            name="uq_finance_pos_income_corrections_workspace_sale",
        ),
    )
    op.create_index(
        "ix_finance_pos_income_corrections_workspace_branch_date",
        "finance_pos_income_corrections",
        ["workspace_id", "branch_id", "income_date"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_finance_pos_income_corrections_workspace_branch_date",
        table_name="finance_pos_income_corrections",
    )
    op.drop_table("finance_pos_income_corrections")
