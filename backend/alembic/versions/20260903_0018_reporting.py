"""Install the consolidated reporting module.

Revision ID: 20260903_0018
Revises: 20260903_0017
Create Date: 2026-09-03

"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260903_0018"
down_revision: str | Sequence[str] | None = "20260903_0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO module_definitions (code, name, kind, status, dependency_codes)
        VALUES ('reporting', 'Reportes', 'optional', 'available', '["foundation"]')
        ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            kind = EXCLUDED.kind,
            status = EXCLUDED.status,
            dependency_codes = EXCLUDED.dependency_codes,
            updated_at = now()
        """
    )
    op.execute(
        """
        INSERT INTO permissions
            (code, module_code, action, name, description, sort_order, is_platform_only)
        VALUES
            ('report.read', 'reporting', 'read', 'Ver reportes',
             'View consolidated operational and financial reports.', 10, false)
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
          AND (
            (role.code IN ('workspace_admin', 'manager', 'supervisor')
             AND permission.code = 'report.read')
            OR (role.code = 'manager'
                AND permission.code IN ('membership.read', 'membership.manage'))
          )
        ON CONFLICT (workspace_id, role_id, permission_id) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO module_entitlements
            (workspace_id, module_definition_id, status, effective_from)
        SELECT workspace.id, module.id, 'enabled', now()
        FROM workspaces AS workspace
        JOIN module_definitions AS module ON module.code = 'reporting'
        ON CONFLICT (workspace_id, module_definition_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM role_permissions WHERE permission_id = "
        "(SELECT id FROM permissions WHERE code = 'report.read')"
    )
    op.execute("DELETE FROM permissions WHERE code = 'report.read'")
    op.execute(
        "DELETE FROM module_entitlements WHERE module_definition_id = "
        "(SELECT id FROM module_definitions WHERE code = 'reporting')"
    )
    op.execute("UPDATE module_definitions SET status = 'planned' WHERE code = 'reporting'")
