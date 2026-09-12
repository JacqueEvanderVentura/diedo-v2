"""Customer identity documents and online booking specialist flag.

Revision ID: 20260911_0026
Revises: 20260908_0025
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260911_0026"
down_revision: str | Sequence[str] | None = "20260908_0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("document_type", sa.String(length=16), nullable=True))
    op.add_column("customers", sa.Column("document_id", sa.String(length=64), nullable=True))
    op.add_column(
        "customers",
        sa.Column("normalized_document_id", sa.String(length=64), nullable=True),
    )
    op.create_check_constraint(
        "document_type_values",
        "customers",
        "document_type IS NULL OR document_type IN ('cedula', 'pasaporte')",
    )
    op.create_index(
        "ix_customers_workspace_normalized_document",
        "customers",
        ["workspace_id", "normalized_document_id"],
        unique=False,
    )
    op.create_index(
        "uq_customers_workspace_document_active",
        "customers",
        ["workspace_id", "normalized_document_id"],
        unique=True,
        postgresql_where=sa.text(
            "normalized_document_id IS NOT NULL AND status <> 'archived'"
        ),
    )

    op.add_column(
        "employees",
        sa.Column(
            "online_booking_selectable",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("employees", "online_booking_selectable")
    op.drop_index("uq_customers_workspace_document_active", table_name="customers")
    op.drop_index("ix_customers_workspace_normalized_document", table_name="customers")
    op.drop_constraint("document_type_values", "customers", type_="check")
    op.drop_column("customers", "normalized_document_id")
    op.drop_column("customers", "document_id")
    op.drop_column("customers", "document_type")
