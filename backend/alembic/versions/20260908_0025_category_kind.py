"""Add category_kind to item_categories.

Revision ID: 20260908_0025
Revises: 20260908_0024
Create Date: 2026-09-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260908_0025"
down_revision: str | Sequence[str] | None = "20260908_0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_KIND_CHECK = (
    "category_kind IN ('product', 'service', 'supply', 'income', 'expense')"
)


def upgrade() -> None:
    op.add_column(
        "item_categories",
        sa.Column(
            "category_kind",
            sa.String(length=16),
            nullable=False,
            server_default="product",
        ),
    )
    op.execute(
        f"ALTER TABLE item_categories ADD CONSTRAINT ck_item_categories_category_kind_values "
        f"CHECK ({_KIND_CHECK})"
    )


def downgrade() -> None:
    op.execute(
        'ALTER TABLE item_categories DROP CONSTRAINT IF EXISTS '
        '"ck_item_categories_category_kind_values"'
    )
    op.drop_column("item_categories", "category_kind")
