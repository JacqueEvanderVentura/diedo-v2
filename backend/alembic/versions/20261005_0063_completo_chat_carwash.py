"""Include chat and carwash in Completo plan module list.

Revision ID: 20261005_0063
Revises: 20261005_0062
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20261005_0063"
down_revision: str | Sequence[str] | None = "20261005_0062"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE subscription_plans
        SET module_codes = (
            SELECT COALESCE(jsonb_agg(DISTINCT value ORDER BY value), '[]'::jsonb)
            FROM (
                SELECT jsonb_array_elements_text(
                    COALESCE(module_codes, '[]'::jsonb) || '["chat", "carwash"]'::jsonb
                ) AS value
            ) AS merged
        ),
            version = version + 1,
            updated_at = now()
        WHERE code = 'completo'
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (workspace_id, role_id, permission_id)
        SELECT role.workspace_id, role.id, permission.id
        FROM roles AS role
        CROSS JOIN permissions AS permission
        WHERE role.code IN ('workspace_admin', 'manager')
          AND role.status = 'active'
          AND permission.module_code = 'carwash'
        ON CONFLICT (workspace_id, role_id, permission_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE subscription_plans
        SET module_codes = (
            SELECT COALESCE(jsonb_agg(codes.value ORDER BY codes.value), '[]'::jsonb)
            FROM (
                SELECT jsonb_array_elements_text(COALESCE(module_codes, '[]'::jsonb)) AS value
            ) AS codes
            WHERE codes.value NOT IN ('chat', 'carwash')
        ),
            version = version + 1,
            updated_at = now()
        WHERE code = 'completo'
        """
    )
