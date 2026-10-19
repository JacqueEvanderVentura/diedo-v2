"""Add sales.invoice.edit and sales.invoice.delete permissions.

Revision ID: 20261004_0059
Revises: 20261004_0058
Create Date: 2026-10-04

"""

from collections.abc import Sequence

from alembic import op

revision: str = "20261004_0059"
down_revision: str | Sequence[str] | None = "20261004_0058"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO permissions (code, module_code, action, name, description, sort_order, is_platform_only)
        VALUES
        (
            'sales.invoice.edit',
            'sales',
            'invoice.edit',
            'Editar facturas',
            'Edit posted invoices and reconcile stock, cash, and receivables.',
            120,
            false
        ),
        (
            'sales.invoice.delete',
            'sales',
            'invoice.delete',
            'Eliminar facturas',
            'Permanently remove posted invoices without applied collections or cash history.',
            130,
            false
        )
        ON CONFLICT (code) DO UPDATE SET
            module_code = EXCLUDED.module_code,
            action = EXCLUDED.action,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            sort_order = EXCLUDED.sort_order,
            is_platform_only = EXCLUDED.is_platform_only,
            updated_at = now()
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (workspace_id, role_id, permission_id)
        SELECT role.workspace_id, role.id, permission.id
        FROM roles AS role
        CROSS JOIN permissions AS permission
        WHERE role.status = 'active'
          AND permission.code IN ('sales.invoice.edit', 'sales.invoice.delete')
          AND EXISTS (
            SELECT 1
            FROM role_permissions AS existing
            JOIN permissions AS existing_permission
              ON existing_permission.id = existing.permission_id
            WHERE existing.workspace_id = role.workspace_id
              AND existing.role_id = role.id
              AND existing_permission.code = 'pos.receivables.manage'
          )
        ON CONFLICT (workspace_id, role_id, permission_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permissions
        WHERE permission_id IN (
            SELECT id FROM permissions
            WHERE code IN ('sales.invoice.edit', 'sales.invoice.delete')
        )
        """
    )
    op.execute(
        "DELETE FROM permissions WHERE code IN ('sales.invoice.edit', 'sales.invoice.delete')"
    )
