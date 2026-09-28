"""carwash_checkout

Revision ID: 20260928_0052
Revises: 20260928_0051
Create Date: 2026-09-27 23:15:43.766397

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260928_0052"
down_revision: str | Sequence[str] | None = "20260928_0051"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_unique_constraint(
        "uq_carwash_lines_scope_id",
        "carwash_wash_lines",
        ["workspace_id", "branch_id", "wash_id", "id"],
    )

    op.create_table(
        "carwash_commissions",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("wash_id", sa.Uuid(), nullable=False),
        sa.Column("wash_line_id", sa.Uuid(), nullable=False),
        sa.Column("sale_line_id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("employee_name", sa.String(length=201), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("base_amount", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column("rate", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("amount", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column(
            "status", sa.String(length=16), server_default=sa.text("'pending'"), nullable=False
        ),
        sa.Column("accrued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("void_reason", sa.String(length=1000), nullable=True),
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
            "(status = 'voided') = (voided_at IS NOT NULL AND void_reason IS NOT NULL)",
            name=op.f("ck_carwash_commissions_void_consistent"),
        ),
        sa.CheckConstraint(
            "role IN ('washer', 'supervisor')", name=op.f("ck_carwash_commissions_role_values")
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'settled', 'voided')",
            name=op.f("ck_carwash_commissions_status_values"),
        ),
        sa.CheckConstraint(
            "base_amount >= 0 AND rate BETWEEN 0 AND 100 AND amount = round(base_amount * rate / 100, 2)",
            name=op.f("ck_carwash_commissions_amount_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id", "wash_id", "wash_line_id"],
            [
                "carwash_wash_lines.workspace_id",
                "carwash_wash_lines.branch_id",
                "carwash_wash_lines.wash_id",
                "carwash_wash_lines.id",
            ],
            name="fk_carwash_commissions_line",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "employee_id", "branch_id"],
            [
                "employee_branch_assignments.workspace_id",
                "employee_branch_assignments.employee_id",
                "employee_branch_assignments.branch_id",
            ],
            name="fk_carwash_commissions_employee",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "sale_line_id"],
            ["sale_lines.workspace_id", "sale_lines.id"],
            name="fk_carwash_commissions_sale_line",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_carwash_commissions")),
        sa.UniqueConstraint(
            "workspace_id", "branch_id", "id", name="uq_carwash_commissions_scope_id"
        ),
        sa.UniqueConstraint(
            "workspace_id", "wash_line_id", "role", name="uq_carwash_commissions_line_role"
        ),
    )
    op.create_index(
        "ix_carwash_commissions_branch_employee_status",
        "carwash_commissions",
        ["workspace_id", "branch_id", "employee_id", "status"],
        unique=False,
    )
    op.add_column("carwash_washes", sa.Column("sale_id", sa.Uuid(), nullable=True))
    op.add_column("carwash_washes", sa.Column("sale_number", sa.String(length=32), nullable=True))
    op.add_column("carwash_washes", sa.Column("receivable_id", sa.Uuid(), nullable=True))
    op.add_column(
        "carwash_washes", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "carwash_washes", sa.Column("completion_key", sa.String(length=128), nullable=True)
    )
    op.add_column(
        "carwash_washes", sa.Column("completion_fingerprint", sa.String(length=64), nullable=True)
    )
    op.add_column(
        "carwash_washes",
        sa.Column("final_subtotal", sa.Numeric(precision=18, scale=2), nullable=True),
    )
    op.add_column(
        "carwash_washes",
        sa.Column("final_discount_amount", sa.Numeric(precision=18, scale=2), nullable=True),
    )
    op.add_column(
        "carwash_washes",
        sa.Column("final_tax_amount", sa.Numeric(precision=18, scale=2), nullable=True),
    )
    op.add_column(
        "carwash_washes", sa.Column("final_total", sa.Numeric(precision=18, scale=2), nullable=True)
    )
    op.add_column(
        "carwash_washes", sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("carwash_washes", sa.Column("void_reason", sa.String(length=1000), nullable=True))
    op.add_column("carwash_washes", sa.Column("void_key", sa.String(length=128), nullable=True))
    op.add_column(
        "carwash_washes", sa.Column("void_fingerprint", sa.String(length=64), nullable=True)
    )
    op.create_unique_constraint(
        "uq_carwash_washes_completion", "carwash_washes", ["workspace_id", "completion_key"]
    )
    op.create_unique_constraint(
        "uq_carwash_washes_sale", "carwash_washes", ["workspace_id", "sale_id"]
    )
    op.create_unique_constraint(
        "uq_carwash_washes_void", "carwash_washes", ["workspace_id", "void_key"]
    )
    op.create_foreign_key(
        "fk_carwash_washes_sale",
        "carwash_washes",
        "sales",
        ["workspace_id", "branch_id", "sale_id"],
        ["workspace_id", "branch_id", "id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_carwash_washes_receivable",
        "carwash_washes",
        "customer_receivables",
        ["workspace_id", "branch_id", "receivable_id"],
        ["workspace_id", "branch_id", "id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        op.f("ck_carwash_washes_completion_consistent"),
        "carwash_washes",
        "(status IN ('completed', 'voided')) = (sale_id IS NOT NULL) AND (sale_id IS NULL) = (completed_at IS NULL) AND (sale_id IS NULL) = (completion_key IS NULL) AND (sale_id IS NULL) = (completion_fingerprint IS NULL) AND (sale_id IS NULL) = (sale_number IS NULL)",
    )
    op.create_check_constraint(
        op.f("ck_carwash_washes_final_totals_valid"),
        "carwash_washes",
        "(sale_id IS NULL AND final_subtotal IS NULL AND final_discount_amount IS NULL AND final_tax_amount IS NULL AND final_total IS NULL) OR (sale_id IS NOT NULL AND final_subtotal IS NOT NULL AND final_discount_amount IS NOT NULL AND final_tax_amount IS NOT NULL AND final_total IS NOT NULL AND final_subtotal >= 0 AND final_discount_amount BETWEEN 0 AND final_subtotal AND final_tax_amount >= 0 AND final_total = final_subtotal - final_discount_amount + final_tax_amount)",
    )
    op.create_check_constraint(
        op.f("ck_carwash_washes_void_consistent"),
        "carwash_washes",
        "(status = 'voided') = (voided_at IS NOT NULL AND void_reason IS NOT NULL)",
    )
    op.drop_constraint(op.f("ck_carwash_washes_status_values"), "carwash_washes", type_="check")
    op.create_check_constraint(
        op.f("ck_carwash_washes_status_values"),
        "carwash_washes",
        "status IN ('waiting', 'washing', 'cancelled', 'completed', 'voided')",
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Downgrade is refused when financial history exists; never discard posted operations.
    if (
        op.get_bind()
        .execute(sa.text("SELECT 1 FROM carwash_washes WHERE sale_id IS NOT NULL LIMIT 1"))
        .first()
    ):
        raise RuntimeError("Cannot downgrade Carwash with completed or voided washes.")
    op.drop_constraint(op.f("ck_carwash_washes_status_values"), "carwash_washes", type_="check")
    op.create_check_constraint(
        op.f("ck_carwash_washes_status_values"),
        "carwash_washes",
        "status IN ('waiting', 'washing', 'cancelled')",
    )
    op.drop_constraint(op.f("ck_carwash_washes_void_consistent"), "carwash_washes", type_="check")
    op.drop_constraint(
        op.f("ck_carwash_washes_final_totals_valid"), "carwash_washes", type_="check"
    )
    op.drop_constraint(
        op.f("ck_carwash_washes_completion_consistent"), "carwash_washes", type_="check"
    )
    op.drop_constraint("fk_carwash_washes_receivable", "carwash_washes", type_="foreignkey")
    op.drop_constraint("fk_carwash_washes_sale", "carwash_washes", type_="foreignkey")
    op.drop_constraint("uq_carwash_washes_void", "carwash_washes", type_="unique")
    op.drop_constraint("uq_carwash_washes_sale", "carwash_washes", type_="unique")
    op.drop_constraint("uq_carwash_washes_completion", "carwash_washes", type_="unique")
    op.drop_column("carwash_washes", "void_fingerprint")
    op.drop_column("carwash_washes", "void_key")
    op.drop_column("carwash_washes", "void_reason")
    op.drop_column("carwash_washes", "voided_at")
    op.drop_column("carwash_washes", "final_total")
    op.drop_column("carwash_washes", "final_tax_amount")
    op.drop_column("carwash_washes", "final_discount_amount")
    op.drop_column("carwash_washes", "final_subtotal")
    op.drop_column("carwash_washes", "completion_fingerprint")
    op.drop_column("carwash_washes", "completion_key")
    op.drop_column("carwash_washes", "completed_at")
    op.drop_column("carwash_washes", "receivable_id")
    op.drop_column("carwash_washes", "sale_number")
    op.drop_column("carwash_washes", "sale_id")
    op.drop_index("ix_carwash_commissions_branch_employee_status", table_name="carwash_commissions")
    op.drop_table("carwash_commissions")
    op.drop_constraint("uq_carwash_lines_scope_id", "carwash_wash_lines", type_="unique")

    # ### end Alembic commands ###
