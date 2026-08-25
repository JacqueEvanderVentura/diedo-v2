"""Add the base catalog for categories and products.

Revision ID: 20260824_0004
Revises: 20260823_0003
Create Date: 2026-08-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260824_0004"
down_revision: str | Sequence[str] | None = "20260823_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "item_categories",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("normalized_name", sa.String(length=320), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=16), server_default=sa.text("'active'"), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'archived')",
            name=op.f("ck_item_categories_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_item_categories_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_item_categories")),
        sa.UniqueConstraint(
            "workspace_id", "id", name="uq_item_categories_workspace_id_id"
        ),
        sa.UniqueConstraint(
            "workspace_id",
            "normalized_name",
            name="uq_item_categories_workspace_normalized_name",
        ),
    )
    op.create_index(
        "ix_item_categories_workspace_status",
        "item_categories",
        ["workspace_id", "status"],
        unique=False,
    )

    op.create_table(
        "units_of_measure",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("symbol", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), server_default=sa.text("'active'"), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'archived')",
            name=op.f("ck_units_of_measure_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_units_of_measure_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_units_of_measure")),
        sa.UniqueConstraint(
            "workspace_id", "code", name="uq_units_of_measure_workspace_code"
        ),
        sa.UniqueConstraint(
            "workspace_id", "id", name="uq_units_of_measure_workspace_id_id"
        ),
    )
    op.create_index(
        "ix_units_of_measure_workspace_status",
        "units_of_measure",
        ["workspace_id", "status"],
        unique=False,
    )

    op.create_table(
        "items",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("unit_of_measure_id", sa.Uuid(), nullable=False),
        sa.Column("item_type", sa.String(length=24), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("sku", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=16), server_default=sa.text("'active'"), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.CheckConstraint(
            "item_type IN ('product', 'service', 'membership', 'asset_template', 'other')",
            name=op.f("ck_items_item_type_values"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'archived')",
            name=op.f("ck_items_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "category_id"],
            ["item_categories.workspace_id", "item_categories.id"],
            name="fk_items_workspace_category",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "unit_of_measure_id"],
            ["units_of_measure.workspace_id", "units_of_measure.id"],
            name="fk_items_workspace_unit",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_items")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_items_workspace_id_id"),
    )
    op.create_index(
        "ix_items_workspace_category", "items", ["workspace_id", "category_id"], unique=False
    )
    op.create_index(
        "ix_items_workspace_type_status",
        "items",
        ["workspace_id", "item_type", "status"],
        unique=False,
    )
    op.create_index(
        "uq_items_workspace_sku",
        "items",
        ["workspace_id", "sku"],
        unique=True,
        postgresql_where=sa.text("sku IS NOT NULL"),
    )

    op.create_table(
        "item_branch_assignments",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), server_default=sa.text("'active'"), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')",
            name=op.f("ck_item_branch_assignments_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_item_branch_assignments_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "item_id"],
            ["items.workspace_id", "items.id"],
            name="fk_item_branch_assignments_workspace_item",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_item_branch_assignments")),
        sa.UniqueConstraint(
            "workspace_id",
            "id",
            name="uq_item_branch_assignments_workspace_id_id",
        ),
        sa.UniqueConstraint(
            "workspace_id",
            "item_id",
            "branch_id",
            name="uq_item_branch_assignments_workspace_item_branch",
        ),
    )
    op.create_index(
        "ix_item_branch_assignments_workspace_branch_status",
        "item_branch_assignments",
        ["workspace_id", "branch_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_item_branch_assignments_workspace_item_status",
        "item_branch_assignments",
        ["workspace_id", "item_id", "status"],
        unique=False,
    )

    _install_catalog_data()


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permissions
        WHERE permission_id IN (
            SELECT id FROM permissions WHERE code IN ('catalog.read', 'catalog.manage')
        )
        """
    )
    op.execute("DELETE FROM permissions WHERE code IN ('catalog.read', 'catalog.manage')")
    op.execute("UPDATE module_definitions SET status = 'planned' WHERE code = 'catalog'")

    op.drop_index(
        "ix_item_branch_assignments_workspace_item_status",
        table_name="item_branch_assignments",
    )
    op.drop_index(
        "ix_item_branch_assignments_workspace_branch_status",
        table_name="item_branch_assignments",
    )
    op.drop_table("item_branch_assignments")
    op.drop_index("uq_items_workspace_sku", table_name="items")
    op.drop_index("ix_items_workspace_type_status", table_name="items")
    op.drop_index("ix_items_workspace_category", table_name="items")
    op.drop_table("items")
    op.drop_index("ix_units_of_measure_workspace_status", table_name="units_of_measure")
    op.drop_table("units_of_measure")
    op.drop_index("ix_item_categories_workspace_status", table_name="item_categories")
    op.drop_table("item_categories")


def _install_catalog_data() -> None:
    op.execute(
        """
        INSERT INTO module_definitions (code, name, kind, status, dependency_codes)
        VALUES ('catalog', 'Product and service catalog', 'optional', 'available', '["foundation"]')
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            kind = EXCLUDED.kind,
            status = EXCLUDED.status,
            dependency_codes = EXCLUDED.dependency_codes,
            updated_at = now()
        """
    )
    op.execute(
        """
        INSERT INTO permissions
            (code, module_code, action, name, description, sort_order, is_platform_only)
        VALUES
            ('catalog.read', 'catalog', 'read', 'Ver catálogo',
             'View categories, units, and products in the authorized scope.', 10, false),
            ('catalog.manage', 'catalog', 'manage', 'Gestionar catálogo',
             'Create and change categories and products in the authorized scope.', 20, false)
        ON CONFLICT (code) DO UPDATE
        SET module_code = EXCLUDED.module_code,
            action = EXCLUDED.action,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            sort_order = EXCLUDED.sort_order,
            is_platform_only = EXCLUDED.is_platform_only,
            updated_at = now()
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (workspace_id, role_id, permission_id)
        SELECT role.workspace_id, role.id, permission.id
        FROM roles AS role
        CROSS JOIN permissions AS permission
        WHERE role.code = 'workspace_admin'
          AND role.status = 'active'
          AND permission.code IN ('catalog.read', 'catalog.manage')
        ON CONFLICT (workspace_id, role_id, permission_id) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO units_of_measure (workspace_id, code, name, symbol, status)
        SELECT workspace.id, unit.code, unit.name, unit.symbol, 'active'
        FROM workspaces AS workspace
        CROSS JOIN (
            VALUES
                ('unit', 'Unidad', 'ud'),
                ('kg', 'Kilogramo', 'kg'),
                ('g', 'Gramo', 'g'),
                ('lb', 'Libra', 'lb'),
                ('l', 'Litro', 'L'),
                ('ml', 'Mililitro', 'mL'),
                ('m', 'Metro', 'm'),
                ('cm', 'Centímetro', 'cm')
        ) AS unit(code, name, symbol)
        ON CONFLICT (workspace_id, code) DO NOTHING
        """
    )
