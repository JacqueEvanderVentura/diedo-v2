"""Add sales.invoice.void permission and session privilege elevation.

Revision ID: 20260908_0022
Revises: 20260908_0021
Create Date: 2026-09-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260908_0022"
down_revision: str | Sequence[str] | None = "20260908_0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO permissions (code, module_code, action, name, description, sort_order, is_platform_only)
        VALUES (
            'sales.invoice.void',
            'sales',
            'invoice.void',
            'Anular facturas',
            'Void posted invoices and record compensating movements.',
            110,
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
          AND permission.code IN ('sales.invoice.void', 'pos.void')
          AND EXISTS (
            SELECT 1
            FROM role_permissions AS existing
            JOIN permissions AS existing_permission
              ON existing_permission.id = existing.permission_id
            WHERE existing.workspace_id = role.workspace_id
              AND existing.role_id = role.id
              AND existing_permission.code = 'pos.void'
          )
        ON CONFLICT (workspace_id, role_id, permission_id) DO NOTHING
        """
    )
    op.create_table(
        "auth_session_elevations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("granted_by_membership_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("granted_by_display_name", sa.String(length=160), nullable=False),
        sa.Column(
            "granted_permission_codes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["auth_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_auth_session_elevations_session_active",
        "auth_session_elevations",
        ["session_id"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_auth_session_elevations_session_active", table_name="auth_session_elevations")
    op.drop_table("auth_session_elevations")
    op.execute("DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'sales.invoice.void')")
    op.execute("DELETE FROM permissions WHERE code = 'sales.invoice.void'")
