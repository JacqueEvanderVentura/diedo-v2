"""Add service channel flags on inventory item profiles.

Revision ID: 20261008_0066
Revises: 20261008_0065
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261008_0066"
down_revision: str | Sequence[str] | None = "20261008_0065"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "inventory_item_profiles",
        sa.Column(
            "available_in_agenda",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "inventory_item_profiles",
        sa.Column(
            "available_in_pos",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("inventory_item_profiles", "available_in_pos")
    op.drop_column("inventory_item_profiles", "available_in_agenda")
