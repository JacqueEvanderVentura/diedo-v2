"""Allow app as a customer acquisition source.

Revision ID: 20260912_0028
Revises: 20260911_0027
Create Date: 2026-09-12

"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260912_0028"
down_revision: str | Sequence[str] | None = "20260911_0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW_CHECK = (
    "acquisition_source IS NULL OR acquisition_source IN "
    "('whatsapp', 'instagram', 'referral', 'otros', 'pos_walk_in', 'app')"
)
_OLD_CHECK = (
    "acquisition_source IS NULL OR acquisition_source IN "
    "('whatsapp', 'instagram', 'referral', 'otros', 'pos_walk_in')"
)


def _replace_acquisition_check(table: str, expression: str) -> None:
    op.execute(
        f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS ck_{table}_acquisition_source_values"
    )
    op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS acquisition_source_values")
    op.create_check_constraint(
        f"ck_{table}_acquisition_source_values",
        table,
        expression,
    )


def upgrade() -> None:
    _replace_acquisition_check("customers", _NEW_CHECK)
    _replace_acquisition_check("crm_leads", _NEW_CHECK)


def downgrade() -> None:
    op.execute(
        "UPDATE customers SET acquisition_source = 'otros' WHERE acquisition_source = 'app'"
    )
    op.execute(
        "UPDATE crm_leads SET acquisition_source = 'otros' WHERE acquisition_source = 'app'"
    )
    _replace_acquisition_check("customers", _OLD_CHECK)
    _replace_acquisition_check("crm_leads", _OLD_CHECK)
