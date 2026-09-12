"""Add acquisition source to customers and CRM leads.

Revision ID: 20260908_0024
Revises: 20260908_0023
Create Date: 2026-09-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260908_0024"
down_revision: str | Sequence[str] | None = "20260908_0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACQUISITION_CHECK = (
    "acquisition_source IS NULL OR acquisition_source IN "
    "('whatsapp', 'instagram', 'referral', 'otros', 'pos_walk_in')"
)


def upgrade() -> None:
    op.add_column("customers", sa.Column("acquisition_source", sa.String(length=24), nullable=True))
    op.create_check_constraint(
        "ck_customers_acquisition_source_values",
        "customers",
        _ACQUISITION_CHECK,
    )
    op.add_column("crm_leads", sa.Column("acquisition_source", sa.String(length=24), nullable=True))
    op.create_check_constraint(
        "ck_crm_leads_acquisition_source_values",
        "crm_leads",
        _ACQUISITION_CHECK,
    )


def downgrade() -> None:
    op.execute(
        'ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS '
        '"ck_crm_leads_acquisition_source_values"'
    )
    op.execute(
        'ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS '
        '"ck_crm_leads_ck_crm_leads_acquisition_source_values"'
    )
    op.drop_column("crm_leads", "acquisition_source")
    op.execute(
        'ALTER TABLE customers DROP CONSTRAINT IF EXISTS '
        '"ck_customers_acquisition_source_values"'
    )
    op.execute(
        'ALTER TABLE customers DROP CONSTRAINT IF EXISTS '
        '"ck_customers_ck_customers_acquisition_source_values"'
    )
    op.drop_column("customers", "acquisition_source")
