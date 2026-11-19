"""Allow credit-fiscal NCF sequences of 8 to 20 digits.

Revision ID: 20261118_0088
Revises: 20261118_0087
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261118_0088"
down_revision: str | Sequence[str] | None = "20261118_0087"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SEQUENCE_CHECK = (
    "fiscal_credit_ncf_next_sequence IS NULL OR ("
    "fiscal_credit_ncf_next_sequence ~ '^[0-9]{8,20}$' "
    "AND fiscal_credit_ncf_next_sequence <> "
    "repeat('0', char_length(fiscal_credit_ncf_next_sequence))"
    ")"
)
_LEGACY_SEQUENCE_CHECK = (
    "fiscal_credit_ncf_next_sequence IS NULL OR "
    "(fiscal_credit_ncf_next_sequence >= 1 AND fiscal_credit_ncf_next_sequence <= 99999999)"
)


def upgrade() -> None:
    op.drop_constraint("ck_branches_fiscal_credit_ncf_sequence", "branches", type_="check")
    op.alter_column(
        "branches",
        "fiscal_credit_ncf_next_sequence",
        existing_type=sa.Integer(),
        type_=sa.String(length=20),
        postgresql_using=(
            "CASE WHEN fiscal_credit_ncf_next_sequence IS NULL THEN NULL "
            "ELSE lpad(fiscal_credit_ncf_next_sequence::text, 8, '0') END"
        ),
    )
    op.create_check_constraint(
        "ck_branches_fiscal_credit_ncf_sequence",
        "branches",
        _SEQUENCE_CHECK,
    )


def downgrade() -> None:
    op.drop_constraint("ck_branches_fiscal_credit_ncf_sequence", "branches", type_="check")
    op.alter_column(
        "branches",
        "fiscal_credit_ncf_next_sequence",
        existing_type=sa.String(length=20),
        type_=sa.Integer(),
        postgresql_using=(
            "CASE WHEN fiscal_credit_ncf_next_sequence IS NULL THEN NULL "
            "ELSE fiscal_credit_ncf_next_sequence::integer END"
        ),
    )
    op.create_check_constraint(
        "ck_branches_fiscal_credit_ncf_sequence",
        "branches",
        _LEGACY_SEQUENCE_CHECK,
    )
