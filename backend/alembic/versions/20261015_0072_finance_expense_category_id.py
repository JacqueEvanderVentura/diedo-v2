"""Allow finance expenses to reference catalog expense categories.

Revision ID: 20261015_0072
Revises: 20261009_0071
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261015_0072"
down_revision: str | Sequence[str] | None = "20261009_0071"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("category_values", "finance_expenses", type_="check")
    op.drop_constraint("category_values", "finance_fixed_expenses", type_="check")
    op.alter_column(
        "finance_expenses",
        "category",
        existing_type=sa.String(length=24),
        type_=sa.String(length=36),
        existing_nullable=False,
    )
    op.alter_column(
        "finance_fixed_expenses",
        "category",
        existing_type=sa.String(length=24),
        type_=sa.String(length=36),
        existing_nullable=False,
    )
    op.add_column("finance_expenses", sa.Column("category_id", sa.Uuid(), nullable=True))
    op.add_column("finance_fixed_expenses", sa.Column("category_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_finance_expenses_workspace_category"),
        "finance_expenses",
        "item_categories",
        ["workspace_id", "category_id"],
        ["workspace_id", "id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_finance_fixed_expenses_workspace_category"),
        "finance_fixed_expenses",
        "item_categories",
        ["workspace_id", "category_id"],
        ["workspace_id", "id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        op.f("ix_finance_expenses_workspace_category"),
        "finance_expenses",
        ["workspace_id", "category_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_finance_fixed_expenses_workspace_category"),
        "finance_fixed_expenses",
        ["workspace_id", "category_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_finance_fixed_expenses_workspace_category"),
        table_name="finance_fixed_expenses",
    )
    op.drop_index(op.f("ix_finance_expenses_workspace_category"), table_name="finance_expenses")
    op.drop_constraint(
        op.f("fk_finance_fixed_expenses_workspace_category"),
        "finance_fixed_expenses",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_finance_expenses_workspace_category"),
        "finance_expenses",
        type_="foreignkey",
    )
    op.drop_column("finance_fixed_expenses", "category_id")
    op.drop_column("finance_expenses", "category_id")
    op.alter_column(
        "finance_fixed_expenses",
        "category",
        existing_type=sa.String(length=36),
        type_=sa.String(length=24),
        existing_nullable=False,
    )
    op.alter_column(
        "finance_expenses",
        "category",
        existing_type=sa.String(length=36),
        type_=sa.String(length=24),
        existing_nullable=False,
    )
    op.create_check_constraint(
        "category_values",
        "finance_fixed_expenses",
        "category IN ('alquiler', 'servicios', 'nomina', 'insumos', "
        "'marketing', 'mantenimiento', 'otros')",
    )
    op.create_check_constraint(
        "category_values",
        "finance_expenses",
        "category IN ('alquiler', 'servicios', 'nomina', 'insumos', "
        "'marketing', 'mantenimiento', 'otros')",
    )
