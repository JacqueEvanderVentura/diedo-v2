"""Temporary slot holds for public booking.

Revision ID: 20261121_0091
Revises: 20261120_0090
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261121_0091"
down_revision: str | Sequence[str] | None = "20261120_0090"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "appointment_slot_holds",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("uuidv7()"),
            nullable=False,
        ),
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
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("resource_id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=True),
        sa.Column("service_id", sa.Uuid(), nullable=False),
        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column("scheduled_time", sa.Time(timezone=False), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("holder_token", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("ends_at > starts_at", name="time_order"),
        sa.CheckConstraint(
            "char_length(holder_token) >= 8 AND char_length(holder_token) <= 64",
            name="holder_token_length",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name="fk_appointment_slot_holds_workspace_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_appointment_slot_holds_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id", "resource_id"],
            [
                "appointment_resources.workspace_id",
                "appointment_resources.branch_id",
                "appointment_resources.id",
            ],
            name="fk_appointment_slot_holds_resource",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            name="fk_appointment_slot_holds_employee",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "service_id"],
            ["items.workspace_id", "items.id"],
            name="fk_appointment_slot_holds_service",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("holder_token", name="uq_appointment_slot_holds_holder_token"),
    )
    op.create_index(
        "ix_appointment_slot_holds_branch_date",
        "appointment_slot_holds",
        ["workspace_id", "branch_id", "scheduled_date"],
    )
    op.create_index(
        "ix_appointment_slot_holds_expires",
        "appointment_slot_holds",
        ["expires_at"],
    )
    op.create_index(
        "ix_appointment_slot_holds_resource_starts",
        "appointment_slot_holds",
        ["workspace_id", "branch_id", "resource_id", "starts_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_appointment_slot_holds_resource_starts", table_name="appointment_slot_holds")
    op.drop_index("ix_appointment_slot_holds_expires", table_name="appointment_slot_holds")
    op.drop_index("ix_appointment_slot_holds_branch_date", table_name="appointment_slot_holds")
    op.drop_table("appointment_slot_holds")
