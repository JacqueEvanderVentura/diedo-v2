"""Per-cabin switch that lets public online booking use the cabin.

Revision ID: 20261028_0081
Revises: 20261026_0080
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261028_0081"
down_revision: str | Sequence[str] | None = "20261026_0080"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "appointment_resources",
        sa.Column(
            "online_booking_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("appointment_resources", "online_booking_enabled")
