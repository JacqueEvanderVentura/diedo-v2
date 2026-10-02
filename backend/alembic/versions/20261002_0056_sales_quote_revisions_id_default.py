"""Align sales_quote_revisions.id default with UuidPrimaryKeyMixin.

Revision ID: 20261002_0056
Revises: 20261002_0055
Create Date: 2026-10-02

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261002_0056"
down_revision: str | Sequence[str] | None = "20261002_0055"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "sales_quote_revisions",
        "id",
        server_default=sa.text("uuidv7()"),
        existing_type=sa.Uuid(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "sales_quote_revisions",
        "id",
        server_default=None,
        existing_type=sa.Uuid(),
        existing_nullable=False,
    )
