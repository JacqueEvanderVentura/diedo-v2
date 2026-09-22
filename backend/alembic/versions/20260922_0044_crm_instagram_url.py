"""Store Instagram links independently from lead websites and retain converted links.

Revision ID: 20260922_0044
Revises: 20260921_0043
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260922_0044"
down_revision: str | Sequence[str] | None = "20260921_0043"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("crm_leads", sa.Column("instagram_url", sa.String(length=500), nullable=True))
    op.add_column("customers", sa.Column("instagram_url", sa.String(length=500), nullable=True))

    # Keep website untouched. Only recognize Instagram as the URL host.
    op.execute(
        """
        UPDATE crm_leads
        SET instagram_url = CASE
            WHEN website ~* '^https?://' THEN website
            ELSE 'https://' || website
        END
        WHERE instagram_url IS NULL
          AND website ~* '^(https?://)?(www\\.)?instagram\\.com([/:?#]|$)'
        """
    )
    op.execute(
        """
        UPDATE customers AS customer
        SET instagram_url = lead.instagram_url
        FROM crm_leads AS lead
        WHERE lead.workspace_id = customer.workspace_id
          AND lead.converted_customer_id = customer.id
          AND customer.instagram_url IS NULL
          AND lead.instagram_url IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("customers", "instagram_url")
    op.drop_column("crm_leads", "instagram_url")
