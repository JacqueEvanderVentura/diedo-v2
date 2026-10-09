"""Default employees as online-booking specialists.

Revision ID: 20261009_0070
Revises: 20261008_0069
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261009_0070"
down_revision: str | Sequence[str] | None = "20261008_0069"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "employees",
        "online_booking_selectable",
        existing_type=sa.Boolean(),
        server_default=sa.text("true"),
        existing_nullable=False,
    )
    op.execute(sa.text("UPDATE employees SET online_booking_selectable = true"))


def downgrade() -> None:
    op.alter_column(
        "employees",
        "online_booking_selectable",
        existing_type=sa.Boolean(),
        server_default=sa.text("false"),
        existing_nullable=False,
    )
