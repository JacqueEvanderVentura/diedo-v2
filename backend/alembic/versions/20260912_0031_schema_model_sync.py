"""Align database schema with SQLAlchemy models for alembic check.

Revision ID: 20260912_0031
Revises: 20260912_0030
Create Date: 2026-09-12

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260912_0031"
down_revision: str | Sequence[str] | None = "20260912_0030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_KIND_CHECK = (
    "category_kind IN ('product', 'service', 'supply', 'income', 'expense')"
)


def upgrade() -> None:
    for table in (
        "asset_attachments",
        "auth_session_elevations",
        "subscription_plans",
        "workspace_subscriptions",
    ):
        op.alter_column(table, "id", server_default=sa.text("uuidv7()"))

    op.execute(
        'ALTER TABLE item_categories DROP CONSTRAINT IF EXISTS '
        '"ck_item_categories_ck_item_categories_category_kind_values"'
    )
    op.execute(
        'ALTER TABLE item_categories DROP CONSTRAINT IF EXISTS '
        '"ck_item_categories_category_kind_values"'
    )
    op.execute(
        f"ALTER TABLE item_categories ADD CONSTRAINT ck_item_categories_category_kind_values "
        f"CHECK ({_KIND_CHECK})"
    )
    op.create_index(
        "ix_item_categories_workspace_kind",
        "item_categories",
        ["workspace_id", "category_kind"],
        unique=False,
    )

    op.alter_column("subscription_plans", "description", server_default=None)


def downgrade() -> None:
    op.alter_column(
        "subscription_plans",
        "description",
        server_default=sa.text("''::character varying"),
    )
    op.drop_index("ix_item_categories_workspace_kind", table_name="item_categories")
    op.drop_constraint(
        "ck_item_categories_category_kind_values",
        "item_categories",
        type_="check",
    )
    op.create_check_constraint(
        "ck_item_categories_category_kind_values",
        "item_categories",
        _KIND_CHECK,
    )
    for table in (
        "workspace_subscriptions",
        "subscription_plans",
        "auth_session_elevations",
        "asset_attachments",
    ):
        op.alter_column(table, "id", server_default=None)
