"""Supervisor: floor Carwash without sales or commission visibility.

Revision ID: 20261015_0074
Revises: 20261015_0073
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20261015_0074"
down_revision: str | Sequence[str] | None = "20261015_0073"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_REVOKE = (
    "sales.read",
    "report.read",
    "finance.read",
    "carwash.commissions.read",
    "carwash.commissions.settle",
    "carwash.commissions.reverse",
    "carwash.reports.read",
    "carwash.settings.manage",
)

_GRANT = (
    "carwash.read",
    "carwash.wash.manage",
    "carwash.wash.complete",
)


def upgrade() -> None:
    codes = ", ".join(f"'{code}'" for code in _REVOKE)
    op.execute(
        f"""
        DELETE FROM role_permissions
        WHERE role_id IN (
            SELECT id FROM roles WHERE code = 'supervisor' AND status = 'active'
        )
          AND permission_id IN (
            SELECT id FROM permissions WHERE code IN ({codes})
          )
        """
    )
    grant_codes = ", ".join(f"'{code}'" for code in _GRANT)
    op.execute(
        f"""
        INSERT INTO role_permissions (workspace_id, role_id, permission_id)
        SELECT role.workspace_id, role.id, permission.id
        FROM roles AS role
        CROSS JOIN permissions AS permission
        WHERE role.code = 'supervisor'
          AND role.status = 'active'
          AND permission.code IN ({grant_codes})
        ON CONFLICT (workspace_id, role_id, permission_id) DO NOTHING
        """
    )


def downgrade() -> None:
    grant_codes = ", ".join(f"'{code}'" for code in _GRANT)
    op.execute(
        f"""
        DELETE FROM role_permissions
        WHERE role_id IN (
            SELECT id FROM roles WHERE code = 'supervisor' AND status = 'active'
        )
          AND permission_id IN (
            SELECT id FROM permissions WHERE code IN ({grant_codes})
          )
        """
    )
