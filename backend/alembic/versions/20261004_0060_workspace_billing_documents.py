"""Workspace billing documents for invoices and quotes.

Revision ID: 20261004_0060
Revises: 20261004_0059
Create Date: 2026-10-04

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261004_0060"
down_revision: str | Sequence[str] | None = "20261004_0059"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "workspaces",
        sa.Column(
            "billing_documents",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("workspaces", "billing_documents")
