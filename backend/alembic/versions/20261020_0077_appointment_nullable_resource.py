"""Allow unassigned cabin on appointments (cualquiera disponible).

Revision ID: 20261020_0077
Revises: 20261020_0076
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261020_0077"
down_revision: str | Sequence[str] | None = "20261020_0076"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE appointments DROP CONSTRAINT excl_appointments_resource_period")
    op.alter_column(
        "appointments",
        "resource_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )
    op.execute(
        """
        ALTER TABLE appointments
        ADD CONSTRAINT excl_appointments_resource_period
        EXCLUDE USING gist (
            workspace_id WITH =,
            branch_id WITH =,
            resource_id WITH =,
            scheduled_period WITH &&
        )
        WHERE (
            resource_id IS NOT NULL
            AND record_status = 'active'
            AND status = 'confirmed'
        )
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE appointments DROP CONSTRAINT excl_appointments_resource_period")
    op.execute(
        """
        UPDATE appointments
        SET resource_id = (
            SELECT ar.id
            FROM appointment_resources ar
            WHERE ar.workspace_id = appointments.workspace_id
              AND ar.branch_id = appointments.branch_id
              AND ar.status = 'active'
            ORDER BY ar.sort_order, ar.id
            LIMIT 1
        )
        WHERE resource_id IS NULL
        """
    )
    op.alter_column(
        "appointments",
        "resource_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
    op.execute(
        """
        ALTER TABLE appointments
        ADD CONSTRAINT excl_appointments_resource_period
        EXCLUDE USING gist (
            workspace_id WITH =,
            branch_id WITH =,
            resource_id WITH =,
            scheduled_period WITH &&
        )
        WHERE (record_status = 'active' AND status = 'confirmed')
        """
    )
