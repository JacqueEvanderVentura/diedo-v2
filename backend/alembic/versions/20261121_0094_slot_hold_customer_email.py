"""Add customer email snapshot to appointment slot holds.

Revision ID: 20261121_0094
Revises: 20261121_0093
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261121_0094"
down_revision: str | Sequence[str] | None = "20261121_0093"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "appointment_slot_holds",
        sa.Column("customer_email", sa.String(length=254), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("appointment_slot_holds", "customer_email")
