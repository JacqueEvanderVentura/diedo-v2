"""carwash_settlements

Revision ID: 20260928_0053
Revises: 20260928_0052
Create Date: 2026-09-27 23:59:39.279117

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260928_0053"
down_revision: str | Sequence[str] | None = "20260928_0052"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_unique_constraint(
        "uq_cash_movements_scope_id", "cash_movements", ["workspace_id", "branch_id", "id"]
    )
    op.create_table(
        "carwash_settlements",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("employee_name", sa.String(length=201), nullable=False),
        sa.Column("register_id", sa.Uuid(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column(
            "status", sa.String(length=16), server_default=sa.text("'posted'"), nullable=False
        ),
        sa.Column("movement_id", sa.Uuid(), nullable=True),
        sa.Column("reversal_movement_id", sa.Uuid(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("reversal_key", sa.String(length=128), nullable=True),
        sa.Column("reversal_fingerprint", sa.String(length=64), nullable=True),
        sa.Column("reversed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reversal_reason", sa.String(length=1000), nullable=True),
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
            "(status = 'reversed' AND amount > 0) = (reversal_movement_id IS NOT NULL)",
            name=op.f("ck_carwash_settlements_reversal_movement_consistent"),
        ),
        sa.CheckConstraint(
            "(status = 'reversed') = (reversed_at IS NOT NULL AND reversal_reason IS NOT NULL AND reversal_key IS NOT NULL AND reversal_fingerprint IS NOT NULL)",
            name=op.f("ck_carwash_settlements_reversal_consistent"),
        ),
        sa.CheckConstraint(
            "status IN ('posted', 'reversed')", name=op.f("ck_carwash_settlements_status_values")
        ),
        sa.CheckConstraint(
            "amount >= 0 AND (amount = 0) = (movement_id IS NULL)",
            name=op.f("ck_carwash_settlements_movement_consistent"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id", "movement_id"],
            ["cash_movements.workspace_id", "cash_movements.branch_id", "cash_movements.id"],
            name="fk_carwash_settlements_movement",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id", "register_id"],
            ["cash_registers.workspace_id", "cash_registers.branch_id", "cash_registers.id"],
            name="fk_carwash_settlements_register",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id", "reversal_movement_id"],
            ["cash_movements.workspace_id", "cash_movements.branch_id", "cash_movements.id"],
            name="fk_carwash_settlements_reversal",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "employee_id", "branch_id"],
            [
                "employee_branch_assignments.workspace_id",
                "employee_branch_assignments.employee_id",
                "employee_branch_assignments.branch_id",
            ],
            name="fk_carwash_settlements_employee",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_carwash_settlements")),
        sa.UniqueConstraint("workspace_id", "branch_id", "id", name="uq_carwash_settlements_scope"),
        sa.UniqueConstraint("workspace_id", "idempotency_key", name="uq_carwash_settlements_key"),
        sa.UniqueConstraint("workspace_id", "movement_id", name="uq_carwash_settlements_movement"),
        sa.UniqueConstraint(
            "workspace_id", "reversal_key", name="uq_carwash_settlements_reverse_key"
        ),
        sa.UniqueConstraint(
            "workspace_id", "reversal_movement_id", name="uq_carwash_settlements_reversal"
        ),
    )
    op.create_index(
        "ix_carwash_settlements_branch_created",
        "carwash_settlements",
        ["workspace_id", "branch_id", "created_at"],
        unique=False,
    )
    op.create_table(
        "carwash_settlement_details",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("settlement_id", sa.Uuid(), nullable=False),
        sa.Column("commission_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column("reversed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.CheckConstraint(
            "amount >= 0", name=op.f("ck_carwash_settlement_details_amount_non_negative")
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id", "commission_id"],
            [
                "carwash_commissions.workspace_id",
                "carwash_commissions.branch_id",
                "carwash_commissions.id",
            ],
            name="fk_carwash_settlement_details_commission",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id", "settlement_id"],
            [
                "carwash_settlements.workspace_id",
                "carwash_settlements.branch_id",
                "carwash_settlements.id",
            ],
            name="fk_carwash_settlement_details_header",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_carwash_settlement_details")),
        sa.UniqueConstraint(
            "settlement_id", "commission_id", name="uq_carwash_settlement_details_entry"
        ),
    )
    op.create_index(
        "uq_carwash_settlement_details_active",
        "carwash_settlement_details",
        ["workspace_id", "commission_id"],
        unique=True,
        postgresql_where=sa.text("reversed_at IS NULL"),
    )


def downgrade() -> None:
    """Downgrade only an empty financial module."""
    if op.get_bind().scalar(sa.text("SELECT EXISTS (SELECT 1 FROM carwash_settlements)")):
        raise RuntimeError("Cannot downgrade Carwash with settlement history.")
    op.drop_index(
        "uq_carwash_settlement_details_active",
        table_name="carwash_settlement_details",
        postgresql_where=sa.text("reversed_at IS NULL"),
    )
    op.drop_table("carwash_settlement_details")
    op.drop_index("ix_carwash_settlements_branch_created", table_name="carwash_settlements")
    op.drop_table("carwash_settlements")
    op.drop_constraint("uq_cash_movements_scope_id", "cash_movements", type_="unique")
