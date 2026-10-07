"""Add catalog item fields to manual finance incomes.

Revision ID: 20261007_0064
Revises: 20261005_0063
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261007_0064"
down_revision: str | Sequence[str] | None = "20261005_0063"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "finance_manual_incomes",
        sa.Column("item_kind", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "finance_manual_incomes",
        sa.Column("catalog_item_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "finance_manual_incomes",
        sa.Column(
            "concept",
            sa.String(length=200),
            server_default="",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("finance_manual_incomes", "concept")
    op.drop_column("finance_manual_incomes", "catalog_item_id")
    op.drop_column("finance_manual_incomes", "item_kind")
