"""Store customer and service snapshots on appointment slot holds.

Revision ID: 20261121_0093
Revises: 20261121_0092
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261121_0093"
down_revision: str | Sequence[str] | None = "20261121_0092"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "appointment_slot_holds",
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "appointment_slot_holds",
        sa.Column("customer_display_name", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "appointment_slot_holds",
        sa.Column("customer_phone", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "appointment_slot_holds",
        sa.Column("service_name", sa.String(length=200), nullable=True),
    )
    op.create_foreign_key(
        "fk_appointment_slot_holds_workspace_customer",
        "appointment_slot_holds",
        "customers",
        ["workspace_id", "customer_id"],
        ["workspace_id", "id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_appointment_slot_holds_workspace_customer",
        "appointment_slot_holds",
        type_="foreignkey",
    )
    op.drop_column("appointment_slot_holds", "service_name")
    op.drop_column("appointment_slot_holds", "customer_phone")
    op.drop_column("appointment_slot_holds", "customer_display_name")
    op.drop_column("appointment_slot_holds", "customer_id")
