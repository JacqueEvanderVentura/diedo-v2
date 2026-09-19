"""Align agenda cabinas tables with SQLAlchemy models (defaults and check names).

Revision ID: 20260919_0039
Revises: 20260919_0038
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260919_0039"
down_revision: str | Sequence[str] | None = "20260919_0038"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_WEEKDAY_CHECK = "weekday IN ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')"
_ACCESS_CHECK = "access IN ('view', 'use')"

_BRANCH_HOURS_CHECKS = (
    "ck_branch_opening_hours_branch_opening_hours_weekday_values",
    "ck_branch_opening_hours_branch_opening_hours_time_order",
    "ck_branch_opening_hours_ck_branch_opening_hours_weekday_values",
    "ck_branch_opening_hours_ck_branch_opening_hours_time_order",
    "ck_branch_opening_hours_weekday_values",
    "ck_branch_opening_hours_time_order",
)

_ACL_CHECKS = (
    "ck_appointment_resource_acl_appointment_resource_acl_access_values",
    "ck_appointment_resource_acl_appointment_resource_acl_ac_b354",
    "ck_appointment_resource_acl_ck_appointment_resource_acl_060a",
    "ck_appointment_resource_acl_access_values",
)


def upgrade() -> None:
    for table in ("branch_opening_hours", "appointment_resource_acl"):
        op.alter_column(table, "id", server_default=sa.text("uuidv7()"))

    for old_name in _BRANCH_HOURS_CHECKS:
        op.execute(
            f'ALTER TABLE branch_opening_hours DROP CONSTRAINT IF EXISTS "{old_name}"'
        )
    op.create_check_constraint("weekday_values", "branch_opening_hours", _WEEKDAY_CHECK)
    op.create_check_constraint("time_order", "branch_opening_hours", "closes_at > opens_at")

    for old_name in _ACL_CHECKS:
        op.execute(
            f'ALTER TABLE appointment_resource_acl DROP CONSTRAINT IF EXISTS "{old_name}"'
        )
    op.create_check_constraint("access_values", "appointment_resource_acl", _ACCESS_CHECK)


def downgrade() -> None:
    pass
