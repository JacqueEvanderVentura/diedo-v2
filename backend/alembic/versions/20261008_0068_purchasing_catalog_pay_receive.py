"""Supplier catalog, purchase pay/receive, request item links.

Revision ID: 20261008_0068
Revises: 20261008_0067
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261008_0068"
down_revision: str | Sequence[str] | None = "20261008_0067"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "supplier_catalog_items",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("supplier_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(240), nullable=False),
        sa.Column("normalized_name", sa.String(280), nullable=False),
        sa.Column("unit", sa.String(40), nullable=False),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=False),
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
        sa.CheckConstraint("unit_price >= 0", name=op.f("ck_supplier_catalog_items_unit_price_nonneg")),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_supplier_catalog_items_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "supplier_id"],
            ["suppliers.workspace_id", "suppliers.id"],
            name=op.f("fk_supplier_catalog_items_workspace_supplier"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "category_id"],
            ["item_categories.workspace_id", "item_categories.id"],
            name=op.f("fk_supplier_catalog_items_workspace_category"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"],
            ["platform_users.id"],
            name=op.f("fk_supplier_catalog_items_created_by"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"],
            ["platform_users.id"],
            name=op.f("fk_supplier_catalog_items_updated_by"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_supplier_catalog_items")),
        sa.UniqueConstraint(
            "workspace_id",
            "id",
            name=op.f("uq_supplier_catalog_items_workspace_id"),
        ),
        sa.UniqueConstraint(
            "workspace_id",
            "supplier_id",
            "normalized_name",
            name=op.f("uq_supplier_catalog_items_supplier_name"),
        ),
    )
    op.create_index(
        op.f("ix_supplier_catalog_items_workspace_supplier"),
        "supplier_catalog_items",
        ["workspace_id", "supplier_id", "active"],
    )
    op.create_index(
        op.f("ix_supplier_catalog_items_workspace_category"),
        "supplier_catalog_items",
        ["workspace_id", "category_id"],
    )

    op.add_column(
        "purchase_requests",
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "purchase_requests",
        sa.Column("finance_expense_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_purchase_requests_workspace_finance_expense"),
        "purchase_requests",
        "finance_expenses",
        ["workspace_id", "finance_expense_id"],
        ["workspace_id", "id"],
        ondelete="RESTRICT",
    )

    op.add_column("purchase_request_items", sa.Column("supplier_catalog_item_id", sa.Uuid(), nullable=True))
    op.add_column("purchase_request_items", sa.Column("category_id", sa.Uuid(), nullable=True))
    op.add_column("purchase_request_items", sa.Column("inventory_item_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_purchase_request_items_workspace_catalog_item"),
        "purchase_request_items",
        "supplier_catalog_items",
        ["workspace_id", "supplier_catalog_item_id"],
        ["workspace_id", "id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_purchase_request_items_workspace_category"),
        "purchase_request_items",
        "item_categories",
        ["workspace_id", "category_id"],
        ["workspace_id", "id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_purchase_request_items_workspace_inventory_item"),
        "purchase_request_items",
        "items",
        ["workspace_id", "inventory_item_id"],
        ["workspace_id", "id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "document_attachments",
        sa.Column(
            "purpose",
            sa.String(16),
            server_default=sa.text("'quote'"),
            nullable=False,
        ),
    )
    op.create_check_constraint(
        op.f("ck_document_attachments_purpose_values"),
        "document_attachments",
        "purpose IN ('quote', 'receipt')",
    )

    op.drop_constraint("status_values", "purchase_requests", type_="check")
    op.create_check_constraint(
        op.f("ck_purchase_requests_status_values"),
        "purchase_requests",
        "status IN ('pendiente', 'aprobada', 'rechazada', 'pagada', 'entregada')",
    )
    op.drop_constraint("status_timestamps_consistent", "purchase_requests", type_="check")
    op.execute(
        sa.text(
            "UPDATE purchase_requests SET paid_at = reviewed_at "
            "WHERE status = 'entregada' AND paid_at IS NULL AND reviewed_at IS NOT NULL"
        )
    )
    op.create_check_constraint(
        op.f("ck_purchase_requests_status_timestamps_consistent"),
        "purchase_requests",
        "(status = 'pendiente' AND reviewer_membership_id IS NULL AND reviewed_at IS NULL "
        "AND paid_at IS NULL AND delivered_at IS NULL) OR "
        "(status = 'rechazada' AND reviewer_membership_id IS NOT NULL AND reviewed_at IS NOT NULL "
        "AND delivered_at IS NULL) OR "
        "(status = 'aprobada' AND reviewer_membership_id IS NOT NULL AND reviewed_at IS NOT NULL "
        "AND paid_at IS NULL AND delivered_at IS NULL) OR "
        "(status = 'pagada' AND reviewer_membership_id IS NOT NULL AND reviewed_at IS NOT NULL "
        "AND paid_at IS NOT NULL AND delivered_at IS NULL) OR "
        "(status = 'entregada' AND reviewer_membership_id IS NOT NULL AND reviewed_at IS NOT NULL "
        "AND delivered_at IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_purchase_requests_status_timestamps_consistent"),
        "purchase_requests",
        type_="check",
    )
    op.create_check_constraint(
        "status_timestamps_consistent",
        "purchase_requests",
        "(status = 'pendiente' AND reviewer_membership_id IS NULL AND reviewed_at IS NULL "
        "AND delivered_at IS NULL) OR "
        "(status IN ('aprobada', 'rechazada') AND reviewer_membership_id IS NOT NULL "
        "AND reviewed_at IS NOT NULL AND delivered_at IS NULL) OR "
        "(status = 'entregada' AND reviewer_membership_id IS NOT NULL "
        "AND reviewed_at IS NOT NULL AND delivered_at IS NOT NULL)",
    )
    op.drop_constraint(op.f("ck_purchase_requests_status_values"), "purchase_requests", type_="check")
    op.create_check_constraint(
        "status_values",
        "purchase_requests",
        "status IN ('pendiente', 'aprobada', 'rechazada', 'entregada')",
    )
    op.drop_constraint(
        op.f("ck_document_attachments_purpose_values"),
        "document_attachments",
        type_="check",
    )
    op.drop_column("document_attachments", "purpose")

    op.drop_constraint(
        op.f("fk_purchase_request_items_workspace_inventory_item"),
        "purchase_request_items",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_purchase_request_items_workspace_category"),
        "purchase_request_items",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_purchase_request_items_workspace_catalog_item"),
        "purchase_request_items",
        type_="foreignkey",
    )
    op.drop_column("purchase_request_items", "inventory_item_id")
    op.drop_column("purchase_request_items", "category_id")
    op.drop_column("purchase_request_items", "supplier_catalog_item_id")

    op.drop_constraint(
        op.f("fk_purchase_requests_workspace_finance_expense"),
        "purchase_requests",
        type_="foreignkey",
    )
    op.drop_column("purchase_requests", "finance_expense_id")
    op.drop_column("purchase_requests", "paid_at")

    op.drop_index(op.f("ix_supplier_catalog_items_workspace_category"), table_name="supplier_catalog_items")
    op.drop_index(
        op.f("ix_supplier_catalog_items_workspace_supplier"),
        table_name="supplier_catalog_items",
    )
    op.drop_table("supplier_catalog_items")
