"""Allow CRM sales/payments to park until the next cash register shift.

Revision ID: 20260921_0041
Revises: 20260921_0040
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260921_0041"
down_revision: str | Sequence[str] | None = "20260921_0040"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("sales", "cash_register_id", existing_type=sa.Uuid(), nullable=True)
    op.add_column(
        "customer_payments",
        sa.Column(
            "pending_shift_cash_assignment",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.drop_constraint("cash_payment_requires_register", "customer_payments", type_="check")
    op.create_check_constraint(
        "cash_payment_requires_register",
        "customer_payments",
        "NOT affects_cash_drawer OR cash_register_id IS NOT NULL OR pending_shift_cash_assignment",
    )


_LATEST_REGISTER = """
SELECT DISTINCT ON (workspace_id, branch_id) id, workspace_id, branch_id
FROM cash_registers
ORDER BY workspace_id, branch_id, opened_at DESC
"""


def _backfill_register(table: str) -> None:
    op.execute(
        sa.text(
            f"""
            UPDATE {table} AS target
            SET cash_register_id = register.id
            FROM ({_LATEST_REGISTER}) AS register
            WHERE target.cash_register_id IS NULL
              AND target.workspace_id = register.workspace_id
              AND target.branch_id = register.branch_id
            """
        )
    )


def _delete_incompatible_parked_rows() -> None:
    parked_sales = "SELECT id FROM sales WHERE cash_register_id IS NULL"
    parked_receivables = f"SELECT id FROM customer_receivables WHERE sale_id IN ({parked_sales})"
    incompatible_payments = f"""
        SELECT id FROM customer_payments
        WHERE (cash_register_id IS NULL AND affects_cash_drawer)
           OR receivable_id IN ({parked_receivables})
    """
    related_movements = f"""
        SELECT id FROM cash_movements
        WHERE sale_id IN ({parked_sales})
           OR customer_payment_id IN ({incompatible_payments})
    """
    all_movements = f"""
        SELECT id FROM cash_movements
        WHERE id IN ({related_movements})
           OR reversal_of_movement_id IN ({related_movements})
    """
    op.execute(
        sa.text(
            f"DELETE FROM payment_proofs WHERE customer_payment_id IN ({incompatible_payments})"
        )
    )
    op.execute(sa.text(f"DELETE FROM payment_proofs WHERE receivable_id IN ({parked_receivables})"))
    op.execute(
        sa.text(f"DELETE FROM cash_movement_lines WHERE cash_movement_id IN ({all_movements})")
    )
    op.execute(
        sa.text(
            f"DELETE FROM cash_movements WHERE reversal_of_movement_id IN ({related_movements})"
        )
    )
    op.execute(sa.text(f"DELETE FROM cash_movements WHERE id IN ({related_movements})"))
    op.execute(sa.text(f"DELETE FROM customer_payments WHERE id IN ({incompatible_payments})"))
    op.execute(
        sa.text(f"DELETE FROM finance_pos_income_corrections WHERE sale_id IN ({parked_sales})")
    )
    op.execute(
        sa.text(
            f"DELETE FROM customer_receivable_lines WHERE receivable_id IN ({parked_receivables})"
        )
    )
    op.execute(sa.text(f"DELETE FROM customer_receivables WHERE id IN ({parked_receivables})"))
    op.execute(sa.text(f"DELETE FROM sale_lines WHERE sale_id IN ({parked_sales})"))
    op.execute(sa.text(f"DELETE FROM sales WHERE id IN ({parked_sales})"))


def downgrade() -> None:
    _backfill_register("sales")
    _backfill_register("customer_payments")
    _delete_incompatible_parked_rows()
    op.drop_constraint("cash_payment_requires_register", "customer_payments", type_="check")
    op.create_check_constraint(
        "cash_payment_requires_register",
        "customer_payments",
        "NOT affects_cash_drawer OR cash_register_id IS NOT NULL",
    )
    op.drop_column("customer_payments", "pending_shift_cash_assignment")
    op.alter_column("sales", "cash_register_id", existing_type=sa.Uuid(), nullable=False)
