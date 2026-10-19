"""Add service duration on inventory item profiles.

Revision ID: 20261009_0071
Revises: 20261009_0070
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261009_0071"
down_revision: str | Sequence[str] | None = "20261009_0070"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "inventory_item_profiles",
        sa.Column(
            "duration_minutes",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("30"),
        ),
    )
    op.create_check_constraint(
        op.f("ck_inventory_item_profiles_duration_range"),
        "inventory_item_profiles",
        "duration_minutes >= 5 AND duration_minutes <= 480",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_inventory_item_profiles_duration_range"),
        "inventory_item_profiles",
        type_="check",
    )
    op.drop_column("inventory_item_profiles", "duration_minutes")
