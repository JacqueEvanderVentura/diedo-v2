"""Agenda cabinas: resource metadata, opening hours, ACL.

Revision ID: 20260919_0038
Revises: 20260919_0037
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260919_0038"
down_revision: str | Sequence[str] | None = "20260919_0037"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "appointment_resources",
        sa.Column("description", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "appointment_resources",
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_table(
        "branch_opening_hours",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("weekday", sa.String(length=8), nullable=False),
        sa.Column("opens_at", sa.Time(), nullable=False),
        sa.Column("closes_at", sa.Time(), nullable=False),
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
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint(
            "weekday IN ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')",
            name="weekday_values",
        ),
        sa.CheckConstraint(
            "closes_at > opens_at",
            name="time_order",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_branch_opening_hours_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_branch_opening_hours_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_branch_opening_hours")),
        sa.UniqueConstraint(
            "workspace_id",
            "branch_id",
            "weekday",
            name="uq_branch_opening_hours_weekday",
        ),
    )
    op.create_table(
        "appointment_resource_acl",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("resource_id", sa.Uuid(), nullable=False),
        sa.Column("platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("access", sa.String(length=8), nullable=False),
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
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint(
            "access IN ('view', 'use')",
            name="access_values",
        ),
        sa.ForeignKeyConstraint(
            ["platform_user_id"],
            ["platform_users.id"],
            name=op.f("fk_appointment_resource_acl_platform_user_id_platform_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id", "resource_id"],
            [
                "appointment_resources.workspace_id",
                "appointment_resources.branch_id",
                "appointment_resources.id",
            ],
            name="fk_appointment_resource_acl_resource",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_appointment_resource_acl")),
        sa.UniqueConstraint(
            "workspace_id",
            "branch_id",
            "resource_id",
            "platform_user_id",
            name="uq_appointment_resource_acl_user",
        ),
    )


def downgrade() -> None:
    op.drop_table("appointment_resource_acl")
    op.drop_table("branch_opening_hours")
    op.drop_column("appointment_resources", "sort_order")
    op.drop_column("appointment_resources", "description")
