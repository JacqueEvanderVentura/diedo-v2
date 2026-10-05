"""Sale split tenders, channel origin, receivable approval pending.

Revision ID: 20261004_0057
Revises: 20261002_0056
Create Date: 2026-10-04

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261004_0057"
down_revision: str | Sequence[str] | None = "20261002_0056"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sales", sa.Column("channel_origin", sa.String(length=32), nullable=True))
    op.add_column(
        "customer_receivables",
        sa.Column(
            "approval_pending_amount",
            sa.Numeric(precision=14, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
    )
    op.create_check_constraint(
        op.f("ck_customer_receivables_approval_pending_amount_non_negative"),
        "customer_receivables",
        "approval_pending_amount >= 0",
    )
    op.create_table(
        "sale_tender_lines",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("sale_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("payment_method_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("settlement_policy", sa.String(length=24), nullable=False),
        sa.Column("payment_channel", sa.String(length=24), nullable=False),
        sa.Column("reference", sa.String(length=160), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
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
        sa.CheckConstraint("position >= 1", name=op.f("ck_sale_tender_lines_position_positive")),
        sa.CheckConstraint("amount > 0", name=op.f("ck_sale_tender_lines_amount_positive")),
        sa.CheckConstraint(
            "status IN ('settled', 'awaiting_approval')",
            name=op.f("ck_sale_tender_lines_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_sale_tender_lines_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "sale_id"],
            ["sales.workspace_id", "sales.id"],
            name="fk_sale_tender_lines_workspace_sale",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "payment_method_id"],
            ["payment_methods.workspace_id", "payment_methods.id"],
            name="fk_sale_tender_lines_workspace_payment_method",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sale_tender_lines")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_sale_tender_lines_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id",
            "sale_id",
            "position",
            name="uq_sale_tender_lines_position",
        ),
    )
    op.create_index(
        "ix_sale_tender_lines_workspace_sale",
        "sale_tender_lines",
        ["workspace_id", "sale_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_sale_tender_lines_workspace_sale", table_name="sale_tender_lines")
    op.drop_table("sale_tender_lines")
    op.drop_constraint(
        op.f("ck_customer_receivables_approval_pending_amount_non_negative"),
        "customer_receivables",
        type_="check",
    )
    op.drop_column("customer_receivables", "approval_pending_amount")
    op.drop_column("sales", "channel_origin")
