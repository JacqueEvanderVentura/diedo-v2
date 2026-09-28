"""Register opt-in Carwash module and permissions; no business tables yet.

Revision ID: 20260928_0049
Revises: 20260924_0048
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260928_0049"
down_revision: str | Sequence[str] | None = "20260924_0048"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO module_definitions (code, name, kind, status, dependency_codes)
        VALUES ('carwash', 'Carwash', 'optional', 'available', '["pos", "hr"]')
        ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name, kind = EXCLUDED.kind, status = EXCLUDED.status,
            dependency_codes = EXCLUDED.dependency_codes, updated_at = now()
    """)
    op.execute("""
        INSERT INTO permissions
            (code, module_code, action, name, description, sort_order, is_platform_only)
        VALUES
            ('carwash.read', 'carwash', 'read', 'Ver Carwash',
             'View Carwash in authorized branches.', 10, false),
            ('carwash.wash.manage', 'carwash', 'manage', 'Gestionar lavados',
             'Receive, edit, start and cancel unfinished washes.', 20, false),
            ('carwash.wash.complete', 'carwash', 'complete', 'Completar lavados',
             'Complete washes with POS billing and commission accrual.', 30, false),
            ('carwash.wash.void', 'carwash', 'void', 'Anular lavados',
             'Void completed washes and their linked financial records.', 40, false),
            ('carwash.settings.manage', 'carwash', 'configure', 'Configurar Carwash',
             'Configure enabled services and commission percentages.', 50, false),
            ('carwash.commissions.read', 'carwash', 'read', 'Ver comisiones Carwash',
             'View commissions by employee and role.', 60, false),
            ('carwash.commissions.settle', 'carwash', 'settle', 'Liquidar comisiones Carwash',
             'Settle employee commissions from an open cash register.', 70, false),
            ('carwash.commissions.reverse', 'carwash', 'reverse', 'Revertir liquidaciones Carwash',
             'Reverse commission settlements and their cash movements.', 80, false),
            ('carwash.reports.read', 'carwash', 'report', 'Ver reportes Carwash',
             'View Carwash operational and commission reports.', 90, false)
        ON CONFLICT (code) DO UPDATE SET
            module_code = EXCLUDED.module_code, action = EXCLUDED.action,
            name = EXCLUDED.name, description = EXCLUDED.description,
            sort_order = EXCLUDED.sort_order, is_platform_only = EXCLUDED.is_platform_only,
            updated_at = now()
    """)
    op.execute("""
        INSERT INTO role_permissions (workspace_id, role_id, permission_id)
        SELECT role.workspace_id, role.id, permission.id
        FROM roles AS role CROSS JOIN permissions AS permission
        WHERE role.code = 'workspace_admin' AND role.status = 'active'
          AND permission.module_code = 'carwash'
        ON CONFLICT (workspace_id, role_id, permission_id) DO NOTHING
    """)
    # Availability in Backoffice is not an entitlement. Do not modify subscription plans.
    op.execute("""
        INSERT INTO module_entitlements
            (workspace_id, module_definition_id, status, effective_from)
        SELECT workspace.id, module.id, 'disabled', now()
        FROM workspaces AS workspace
        JOIN module_definitions AS module ON module.code = 'carwash'
        ON CONFLICT (workspace_id, module_definition_id) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM role_permissions WHERE permission_id IN (
            SELECT id FROM permissions WHERE module_code = 'carwash'
        )
    """)
    op.execute("DELETE FROM permissions WHERE module_code = 'carwash'")
    # Keep activation history. Re-upgrading must not silently activate any tenant.
    op.execute("""
        UPDATE module_entitlements SET status = 'disabled', updated_at = now()
        WHERE module_definition_id = (
            SELECT id FROM module_definitions WHERE code = 'carwash'
        )
    """)
    op.execute("UPDATE module_definitions SET status = 'planned' WHERE code = 'carwash'")
