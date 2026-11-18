"""Allow up to two confirmed appointments per specialist (staff booking only).

Specialist capacity is enforced by AgendaService under a row lock on the employee,
mirroring cabin capacity after 0084.

Revision ID: 20261030_0085
Revises: 20261029_0084
Create Date: 2026-10-30

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "20261030_0085"
down_revision: str | Sequence[str] | None = "20261029_0084"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE appointments DROP CONSTRAINT excl_appointments_employee_period")


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE appointments
        ADD CONSTRAINT excl_appointments_employee_period
        EXCLUDE USING gist (
            workspace_id WITH =,
            employee_id WITH =,
            scheduled_period WITH &&
        )
        WHERE (
            employee_id IS NOT NULL
            AND record_status = 'active'
            AND status = 'confirmed'
        )
        """
    )
