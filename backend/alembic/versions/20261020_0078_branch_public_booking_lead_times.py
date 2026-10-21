"""Per-branch public booking and cancel minimum lead times.

Revision ID: 20261020_0078
Revises: 20261020_0077
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261020_0078"
down_revision: str | Sequence[str] | None = "20261020_0077"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ALLOWED_LEAD_MINUTES = (5, 30, 45, 60, 90, 240, 360, 720, 1440)
_LEAD_CHECK = "public_booking_min_lead_minutes IN ({})".format(
    ", ".join(str(m) for m in _ALLOWED_LEAD_MINUTES)
)
_CANCEL_CHECK = "public_cancel_min_lead_minutes IN ({})".format(
    ", ".join(str(m) for m in _ALLOWED_LEAD_MINUTES)
)


def upgrade() -> None:
    op.add_column(
        "branches",
        sa.Column(
            "public_booking_min_lead_minutes",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("5"),
        ),
    )
    op.add_column(
        "branches",
        sa.Column(
            "public_cancel_min_lead_minutes",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("5"),
        ),
    )
    op.create_check_constraint(
        "public_booking_min_lead_minutes",
        "branches",
        _LEAD_CHECK,
    )
    op.create_check_constraint(
        "public_cancel_min_lead_minutes",
        "branches",
        _CANCEL_CHECK,
    )


def downgrade() -> None:
    op.drop_constraint(
        "public_cancel_min_lead_minutes",
        "branches",
        type_="check",
    )
    op.drop_constraint(
        "public_booking_min_lead_minutes",
        "branches",
        type_="check",
    )
    op.drop_column("branches", "public_cancel_min_lead_minutes")
    op.drop_column("branches", "public_booking_min_lead_minutes")
