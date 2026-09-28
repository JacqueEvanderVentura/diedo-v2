"""carwash_service_configuration

Revision ID: 20260928_0050
Revises: 20260928_0049
Create Date: 2026-09-27 22:04:19.904301

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260928_0050"
down_revision: str | Sequence[str] | None = "20260928_0049"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "carwash_service_configs",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "washer_rate",
            sa.Numeric(precision=5, scale=2),
            server_default=sa.text("20"),
            nullable=False,
        ),
        sa.Column(
            "supervisor_rate",
            sa.Numeric(precision=5, scale=2),
            server_default=sa.text("5"),
            nullable=False,
        ),
        sa.Column("creation_key", sa.String(length=128), nullable=False),
        sa.Column("creation_position", sa.Integer(), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
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
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.CheckConstraint(
            "creation_position >= 0",
            name=op.f("ck_carwash_service_configs_creation_position_non_negative"),
        ),
        sa.CheckConstraint(
            "supervisor_rate >= 0 AND supervisor_rate <= 100",
            name=op.f("ck_carwash_service_configs_supervisor_rate_range"),
        ),
        sa.CheckConstraint(
            "version >= 1", name=op.f("ck_carwash_service_configs_version_positive")
        ),
        sa.CheckConstraint(
            "washer_rate + supervisor_rate <= 100",
            name=op.f("ck_carwash_service_configs_commission_total_range"),
        ),
        sa.CheckConstraint(
            "washer_rate >= 0 AND washer_rate <= 100",
            name=op.f("ck_carwash_service_configs_washer_rate_range"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "item_id", "branch_id"],
            [
                "item_branch_assignments.workspace_id",
                "item_branch_assignments.item_id",
                "item_branch_assignments.branch_id",
            ],
            name="fk_carwash_service_configs_item_branch",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_carwash_service_configs")),
        sa.UniqueConstraint(
            "workspace_id", "branch_id", "id", name="uq_carwash_service_configs_scope_id"
        ),
        sa.UniqueConstraint(
            "workspace_id", "branch_id", "item_id", name="uq_carwash_service_configs_scope_item"
        ),
        sa.UniqueConstraint(
            "workspace_id",
            "creation_key",
            "creation_position",
            name="uq_carwash_service_configs_creation",
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("carwash_service_configs")
