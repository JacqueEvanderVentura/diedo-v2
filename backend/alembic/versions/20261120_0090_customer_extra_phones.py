"""Optional second and third customer phone numbers.

Revision ID: 20261120_0090
Revises: 20261119_0089
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261120_0090"
down_revision: str | Sequence[str] | None = "20261119_0089"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("phone_2", sa.String(length=40), nullable=True))
    op.add_column("customers", sa.Column("normalized_phone_2", sa.String(length=24), nullable=True))
    op.add_column("customers", sa.Column("phone_3", sa.String(length=40), nullable=True))
    op.add_column("customers", sa.Column("normalized_phone_3", sa.String(length=24), nullable=True))
    op.create_index(
        "ix_customers_workspace_normalized_phone_2",
        "customers",
        ["workspace_id", "normalized_phone_2"],
    )
    op.create_index(
        "ix_customers_workspace_normalized_phone_3",
        "customers",
        ["workspace_id", "normalized_phone_3"],
    )


def downgrade() -> None:
    op.drop_index("ix_customers_workspace_normalized_phone_3", table_name="customers")
    op.drop_index("ix_customers_workspace_normalized_phone_2", table_name="customers")
    op.drop_column("customers", "normalized_phone_3")
    op.drop_column("customers", "phone_3")
    op.drop_column("customers", "normalized_phone_2")
    op.drop_column("customers", "phone_2")
