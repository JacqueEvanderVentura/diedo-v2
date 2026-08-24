"""Add IAM administration and first-party authentication state.

Revision ID: 20260823_0002
Revises: 4a983691d307
Create Date: 2026-08-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260823_0002"
down_revision: str | Sequence[str] | None = "4a983691d307"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("platform_users", sa.Column("normalized_email", sa.String(254)))
    op.add_column("platform_users", sa.Column("password_hash", sa.String(255)))
    op.add_column(
        "platform_users", sa.Column("password_changed_at", sa.DateTime(timezone=True))
    )
    op.execute("UPDATE platform_users SET normalized_email = lower(btrim(email))")
    op.alter_column("platform_users", "normalized_email", nullable=False)
    op.create_unique_constraint(
        "uq_platform_users_normalized_email",
        "platform_users",
        ["normalized_email"],
    )

    op.add_column(
        "workspace_memberships", sa.Column("last_access_at", sa.DateTime(timezone=True))
    )

    op.add_column("permissions", sa.Column("module_code", sa.String(64)))
    op.add_column("permissions", sa.Column("action", sa.String(64)))
    op.add_column("permissions", sa.Column("name", sa.String(120)))
    op.add_column(
        "permissions",
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )
    op.execute(
        """
        UPDATE permissions
        SET module_code = CASE
                WHEN split_part(code, '.', 1) IN ('membership', 'role') THEN 'iam'
                ELSE 'foundation'
            END,
            action = split_part(code, '.', 2),
            name = CASE code
                WHEN 'workspace.read' THEN 'Ver espacio de trabajo'
                WHEN 'workspace.update' THEN 'Editar espacio de trabajo'
                WHEN 'legal_entity.read' THEN 'Ver entidades legales'
                WHEN 'legal_entity.manage' THEN 'Gestionar entidades legales'
                WHEN 'branch.read' THEN 'Ver sucursales'
                WHEN 'branch.manage' THEN 'Gestionar sucursales'
                WHEN 'membership.read' THEN 'Ver usuarios'
                WHEN 'membership.manage' THEN 'Gestionar usuarios'
                WHEN 'role.read' THEN 'Ver roles y permisos'
                WHEN 'role.manage' THEN 'Gestionar roles y permisos'
                WHEN 'entitlement.read' THEN 'Ver módulos habilitados'
                WHEN 'audit.read' THEN 'Ver auditoría'
                ELSE code
            END
        """
    )
    op.alter_column("permissions", "module_code", nullable=False)
    op.alter_column("permissions", "action", nullable=False)
    op.alter_column("permissions", "name", nullable=False)
    op.create_check_constraint(
        op.f("ck_permissions_sort_order_non_negative"),
        "permissions",
        "sort_order >= 0",
    )
    op.create_foreign_key(
        "fk_permissions_module_code_module_definitions",
        "permissions",
        "module_definitions",
        ["module_code"],
        ["code"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_permissions_module_sort",
        "permissions",
        ["module_code", "sort_order"],
    )

    op.create_table(
        "auth_sessions",
        sa.Column("platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("membership_id", sa.Uuid(), nullable=False),
        sa.Column("refresh_token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "expires_at > created_at", name=op.f("ck_auth_sessions_valid_expiry")
        ),
        sa.ForeignKeyConstraint(
            ["platform_user_id"],
            ["platform_users.id"],
            name="fk_auth_sessions_platform_user_id_platform_users",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name="fk_auth_sessions_workspace_id_workspaces",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            name="fk_auth_sessions_workspace_membership",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_auth_sessions"),
        sa.UniqueConstraint(
            "refresh_token_hash", name="uq_auth_sessions_refresh_token_hash"
        ),
    )
    op.create_index(
        "ix_auth_sessions_membership_expiry",
        "auth_sessions",
        ["membership_id", "expires_at"],
    )
    op.create_index(
        "ix_auth_sessions_user_expiry",
        "auth_sessions",
        ["platform_user_id", "expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_auth_sessions_user_expiry", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_membership_expiry", table_name="auth_sessions")
    op.drop_table("auth_sessions")

    op.drop_index("ix_permissions_module_sort", table_name="permissions")
    op.drop_constraint(
        "fk_permissions_module_code_module_definitions",
        "permissions",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("ck_permissions_sort_order_non_negative"), "permissions", type_="check"
    )
    op.drop_column("permissions", "sort_order")
    op.drop_column("permissions", "name")
    op.drop_column("permissions", "action")
    op.drop_column("permissions", "module_code")

    op.drop_column("workspace_memberships", "last_access_at")
    op.drop_constraint(
        "uq_platform_users_normalized_email", "platform_users", type_="unique"
    )
    op.drop_column("platform_users", "password_changed_at")
    op.drop_column("platform_users", "password_hash")
    op.drop_column("platform_users", "normalized_email")
