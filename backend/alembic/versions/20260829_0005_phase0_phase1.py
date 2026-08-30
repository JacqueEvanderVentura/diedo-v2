"""Phase 0 reliability and Phase 1 administration.

Revision ID: 20260829_0005
Revises: 20260824_0004
Create Date: 2026-08-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260829_0005"
down_revision: str | Sequence[str] | None = "20260824_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "workspaces",
        sa.Column("tax_default_rate", sa.Numeric(precision=5, scale=2), server_default="0", nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_workspaces_tax_default_rate_range"),
        "workspaces",
        "tax_default_rate >= 0 AND tax_default_rate <= 100",
    )
    op.add_column(
        "branches",
        sa.Column(
            "configuration",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )

    op.create_unique_constraint(
        "uq_memberships_workspace_id_user",
        "workspace_memberships",
        ["workspace_id", "id", "platform_user_id"],
    )
    op.drop_constraint(
        "fk_auth_sessions_workspace_membership",
        "auth_sessions",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_auth_sessions_membership_identity",
        "auth_sessions",
        "workspace_memberships",
        ["workspace_id", "membership_id", "platform_user_id"],
        ["workspace_id", "id", "platform_user_id"],
        ondelete="RESTRICT",
    )

    op.create_table(
        "payment_methods",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=48), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("icon", sa.String(length=48), server_default="Wallet", nullable=False),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("is_system", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint("status IN ('active', 'inactive', 'archived')", name=op.f("ck_payment_methods_status_values")),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], name=op.f("fk_payment_methods_workspace_id_workspaces"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payment_methods")),
        sa.UniqueConstraint("workspace_id", "code", name="uq_payment_methods_workspace_code"),
        sa.UniqueConstraint("workspace_id", "id", name="uq_payment_methods_workspace_id"),
    )
    op.create_index("ix_payment_methods_workspace_status", "payment_methods", ["workspace_id", "status"])

    op.create_table(
        "user_invitations",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("membership_id", sa.Uuid(), nullable=False),
        sa.Column("invited_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint("NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL)", name=op.f("ck_user_invitations_terminal_state")),
        sa.ForeignKeyConstraint(["invited_by_platform_user_id"], ["platform_users.id"], name=op.f("fk_user_invitations_invited_by_platform_user_id_platform_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["workspace_id", "membership_id"], ["workspace_memberships.workspace_id", "workspace_memberships.id"], name="fk_user_invitations_workspace_membership", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], name=op.f("fk_user_invitations_workspace_id_workspaces"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_invitations")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_user_invitations_token_hash")),
    )
    op.create_index("ix_user_invitations_workspace_expiry", "user_invitations", ["workspace_id", "expires_at"])

    op.create_table(
        "demo_seed_registry",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("seed_key", sa.String(length=96), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("seed_version", sa.String(length=32), nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint("char_length(checksum) = 64", name=op.f("ck_demo_seed_registry_checksum_length")),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], name=op.f("fk_demo_seed_registry_workspace_id_workspaces"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_demo_seed_registry")),
        sa.UniqueConstraint("workspace_id", "entity_type", "seed_key", name="uq_demo_seed_registry_key"),
    )
    op.create_index("ix_demo_seed_registry_version", "demo_seed_registry", ["workspace_id", "seed_version"])


def downgrade() -> None:
    op.drop_index("ix_demo_seed_registry_version", table_name="demo_seed_registry")
    op.drop_table("demo_seed_registry")
    op.drop_index("ix_user_invitations_workspace_expiry", table_name="user_invitations")
    op.drop_table("user_invitations")
    op.drop_index("ix_payment_methods_workspace_status", table_name="payment_methods")
    op.drop_table("payment_methods")
    op.drop_constraint("fk_auth_sessions_membership_identity", "auth_sessions", type_="foreignkey")
    op.create_foreign_key(
        "fk_auth_sessions_workspace_membership",
        "auth_sessions",
        "workspace_memberships",
        ["workspace_id", "membership_id"],
        ["workspace_id", "id"],
        ondelete="RESTRICT",
    )
    op.drop_constraint("uq_memberships_workspace_id_user", "workspace_memberships", type_="unique")
    op.drop_column("branches", "configuration")
    op.drop_constraint(op.f("ck_workspaces_tax_default_rate_range"), "workspaces", type_="check")
    op.drop_column("workspaces", "tax_default_rate")
