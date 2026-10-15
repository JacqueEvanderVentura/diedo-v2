"""Branch flag for public online booking visibility.

Revision ID: 20261015_0073
Revises: 20261015_0072
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261015_0073"
down_revision: str | Sequence[str] | None = "20261015_0072"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "branches",
        sa.Column(
            "online_booking_selectable",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.execute(sa.text("UPDATE branches SET online_booking_selectable = false"))


def downgrade() -> None:
    op.drop_column("branches", "online_booking_selectable")
