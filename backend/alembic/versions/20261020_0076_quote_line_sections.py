"""Optional section headers on quote and sale lines.

Revision ID: 20261020_0076
Revises: 20261015_0075
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261020_0076"
down_revision: str | Sequence[str] | None = "20261015_0075"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _add_line_kind(table: str) -> None:
    op.add_column(
        table,
        sa.Column(
            "line_kind",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'item'"),
        ),
    )
    op.create_check_constraint(
        "line_kind_values",
        table,
        "line_kind IN ('item', 'section')",
    )


def _relax_quantity(table: str) -> None:
    op.drop_constraint("quantity_positive", table, type_="check")
    op.create_check_constraint(
        "quantity_positive",
        table,
        "(line_kind = 'section' AND quantity = 0) OR (line_kind = 'item' AND quantity > 0)",
    )


def upgrade() -> None:
    for table in ("sales_quote_lines", "sale_lines"):
        _add_line_kind(table)
        _relax_quantity(table)


def downgrade() -> None:
    for table in ("sales_quote_lines", "sale_lines"):
        op.drop_constraint("quantity_positive", table, type_="check")
        op.create_check_constraint("quantity_positive", table, "quantity > 0")
        op.drop_constraint("line_kind_values", table, type_="check")
        op.drop_column(table, "line_kind")
