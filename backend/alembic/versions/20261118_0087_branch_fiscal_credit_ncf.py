"""Per-branch credit fiscal NCF sequence (DGII series B, type 01).

Revision ID: 20261118_0087
Revises: 20261117_0086
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261118_0087"
down_revision: str | Sequence[str] | None = "20261117_0086"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "branches",
        sa.Column("fiscal_credit_ncf_prefix", sa.String(length=3), nullable=True),
    )
    op.add_column(
        "branches",
        sa.Column("fiscal_credit_ncf_next_sequence", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "ck_branches_fiscal_credit_ncf_prefix",
        "branches",
        "fiscal_credit_ncf_prefix IS NULL OR fiscal_credit_ncf_prefix = 'B01'",
    )
    op.create_check_constraint(
        "ck_branches_fiscal_credit_ncf_sequence",
        "branches",
        "fiscal_credit_ncf_next_sequence IS NULL OR "
        "(fiscal_credit_ncf_next_sequence >= 1 AND fiscal_credit_ncf_next_sequence <= 99999999)",
    )
    op.create_check_constraint(
        "ck_branches_fiscal_credit_ncf_pair",
        "branches",
        "(fiscal_credit_ncf_prefix IS NULL) = (fiscal_credit_ncf_next_sequence IS NULL)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_branches_fiscal_credit_ncf_pair", "branches", type_="check")
    op.drop_constraint("ck_branches_fiscal_credit_ncf_sequence", "branches", type_="check")
    op.drop_constraint("ck_branches_fiscal_credit_ncf_prefix", "branches", type_="check")
    op.drop_column("branches", "fiscal_credit_ncf_next_sequence")
    op.drop_column("branches", "fiscal_credit_ncf_prefix")
