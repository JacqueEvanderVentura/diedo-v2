"""Store issued credit-fiscal NCF on sales.

Revision ID: 20261119_0089
Revises: 20261118_0088
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261119_0089"
down_revision: str | Sequence[str] | None = "20261118_0088"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sales", sa.Column("fiscal_ncf", sa.String(length=23), nullable=True))
    op.create_check_constraint(
        "fiscal_ncf_format",
        "sales",
        "fiscal_ncf IS NULL OR fiscal_ncf ~ '^B01[0-9]{8,20}$'",
    )
    op.create_index(
        "uq_sales_workspace_fiscal_ncf",
        "sales",
        ["workspace_id", "fiscal_ncf"],
        unique=True,
        postgresql_where=sa.text("fiscal_ncf IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_sales_workspace_fiscal_ncf",
        table_name="sales",
        postgresql_where=sa.text("fiscal_ncf IS NOT NULL"),
    )
    op.drop_constraint("fiscal_ncf_format", "sales", type_="check")
    op.drop_column("sales", "fiscal_ncf")
