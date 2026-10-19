"""Allow ai as acquisition source for discovery leads.

Revision ID: 20261005_0062
Revises: 20261004_0061
Create Date: 2026-10-05

"""

from collections.abc import Sequence

from alembic import op

revision: str = "20261005_0062"
down_revision: str | Sequence[str] | None = "20261004_0061"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW_CHECK = (
    "acquisition_source IS NULL OR acquisition_source IN "
    "('whatsapp', 'instagram', 'referral', 'otros', 'pos_walk_in', 'app', 'ai')"
)
_OLD_CHECK = (
    "acquisition_source IS NULL OR acquisition_source IN "
    "('whatsapp', 'instagram', 'referral', 'otros', 'pos_walk_in', 'app')"
)


def _replace_acquisition_check(table: str, expression: str) -> None:
    for name in (
        f"ck_{table}_acquisition_source_values",
        f"ck_{table}_ck_{table}_acquisition_source_values",
        "acquisition_source_values",
    ):
        op.execute(f'ALTER TABLE {table} DROP CONSTRAINT IF EXISTS "{name}"')
    op.execute(
        f"ALTER TABLE {table} ADD CONSTRAINT ck_{table}_acquisition_source_values "
        f"CHECK ({expression})"
    )


def upgrade() -> None:
    _replace_acquisition_check("customers", _NEW_CHECK)
    _replace_acquisition_check("crm_leads", _NEW_CHECK)
    op.execute(
        "UPDATE crm_leads SET acquisition_source = 'ai' "
        "WHERE source IN ('serp', 'serper') AND acquisition_source IS NULL"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE customers SET acquisition_source = 'otros' WHERE acquisition_source = 'ai'"
    )
    op.execute(
        "UPDATE crm_leads SET acquisition_source = 'otros' WHERE acquisition_source = 'ai'"
    )
    _replace_acquisition_check("customers", _OLD_CHECK)
    _replace_acquisition_check("crm_leads", _OLD_CHECK)
