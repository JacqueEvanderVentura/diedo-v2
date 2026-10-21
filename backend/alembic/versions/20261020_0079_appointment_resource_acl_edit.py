"""Add edit level to appointment_resource_acl.

Revision ID: 20261020_0079
Revises: 20261020_0078
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20261020_0079"
down_revision: str | Sequence[str] | None = "20261020_0078"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACCESS_CHECK = "access IN ('view', 'use', 'edit')"

_ACL_CHECKS = (
    "access_values",
    "ck_appointment_resource_acl_appointment_resource_acl_access_values",
    "ck_appointment_resource_acl_appointment_resource_acl_ac_b354",
    "ck_appointment_resource_acl_ck_appointment_resource_acl_060a",
    "ck_appointment_resource_acl_access_values",
)


def upgrade() -> None:
    op.execute("UPDATE appointment_resource_acl SET access = 'edit' WHERE access = 'use'")
    for old_name in _ACL_CHECKS:
        op.execute(f'ALTER TABLE appointment_resource_acl DROP CONSTRAINT IF EXISTS "{old_name}"')
    op.create_check_constraint("access_values", "appointment_resource_acl", _ACCESS_CHECK)


def downgrade() -> None:
    op.execute("UPDATE appointment_resource_acl SET access = 'use' WHERE access = 'edit'")
    for old_name in _ACL_CHECKS:
        op.execute(f'ALTER TABLE appointment_resource_acl DROP CONSTRAINT IF EXISTS "{old_name}"')
    op.create_check_constraint(
        "access_values", "appointment_resource_acl", "access IN ('view', 'use')"
    )
