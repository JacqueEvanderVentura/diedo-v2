"""Customer RNC document type and CRM lead identity fields.

Revision ID: 20261008_0067
Revises: 20261008_0066
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261008_0067"
down_revision: str | Sequence[str] | None = "20261008_0066"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("document_type_values", "customers", type_="check")
    op.create_check_constraint(
        "document_type_values",
        "customers",
        "document_type IS NULL OR document_type IN ('cedula', 'pasaporte', 'rnc')",
    )

    op.add_column("crm_leads", sa.Column("document_type", sa.String(length=16), nullable=True))
    op.add_column("crm_leads", sa.Column("document_id", sa.String(length=64), nullable=True))
    op.add_column(
        "crm_leads",
        sa.Column("normalized_document_id", sa.String(length=64), nullable=True),
    )
    op.create_check_constraint(
        "crm_leads_document_type_values",
        "crm_leads",
        "document_type IS NULL OR document_type IN ('cedula', 'pasaporte', 'rnc')",
    )
    op.create_index(
        "ix_crm_leads_workspace_normalized_document",
        "crm_leads",
        ["workspace_id", "normalized_document_id"],
    )
    op.create_index(
        "uq_crm_leads_workspace_document_open",
        "crm_leads",
        ["workspace_id", "normalized_document_id"],
        unique=True,
        postgresql_where=sa.text(
            "normalized_document_id IS NOT NULL AND converted_customer_id IS NULL"
        ),
    )


def downgrade() -> None:
    op.drop_index("uq_crm_leads_workspace_document_open", table_name="crm_leads")
    op.drop_index("ix_crm_leads_workspace_normalized_document", table_name="crm_leads")
    op.drop_constraint("crm_leads_document_type_values", "crm_leads", type_="check")
    op.drop_column("crm_leads", "normalized_document_id")
    op.drop_column("crm_leads", "document_id")
    op.drop_column("crm_leads", "document_type")

    op.drop_constraint("document_type_values", "customers", type_="check")
    op.create_check_constraint(
        "document_type_values",
        "customers",
        "document_type IS NULL OR document_type IN ('cedula', 'pasaporte')",
    )
