"""Grant seller role CRM receivable permissions.

Revision ID: 20260911_0027
Revises: 20260911_0026
Create Date: 2026-09-11

"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260911_0027"
down_revision: str | Sequence[str] | None = "20260911_0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO role_permissions (workspace_id, role_id, permission_id)
        SELECT role.workspace_id, role.id, permission.id
        FROM roles AS role
        CROSS JOIN permissions AS permission
        WHERE role.status = 'active'
          AND role.code = 'seller'
          AND permission.code IN ('pos.receivables.read', 'pos.receivables.collect')
        ON CONFLICT (workspace_id, role_id, permission_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permissions AS rp
        USING roles AS role, permissions AS permission
        WHERE rp.workspace_id = role.workspace_id
          AND rp.role_id = role.id
          AND rp.permission_id = permission.id
          AND role.code = 'seller'
          AND permission.code IN ('pos.receivables.read', 'pos.receivables.collect')
        """
    )
