"""Allow up to two confirmed appointments to share a cabin.

Cabin capacity is enforced by AgendaService under a row lock on the resource.
Downgrade recreates the exclusive constraint and fails if shared slots already exist.

Revision ID: 20261029_0084
Revises: 20261028_0083
Create Date: 2026-10-29

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "20261029_0084"
down_revision: str | Sequence[str] | None = "20261028_0083"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE appointments DROP CONSTRAINT excl_appointments_resource_period")


def downgrade() -> None:
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
