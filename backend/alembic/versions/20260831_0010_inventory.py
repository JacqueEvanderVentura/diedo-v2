"""Add inventory ledger, stock balances, pricing, warehouses, and assets.

Revision ID: 20260831_0010
Revises: 20260830_0009
Create Date: 2026-08-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260831_0010"
down_revision: str | Sequence[str] | None = "20260830_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PERMISSION_CODES = ("inventory.read", "inventory.manage", "inventory.move")


def _id_column() -> sa.Column[object]:
    return sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False)


def _created_at_column() -> sa.Column[object]:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        server_default=sa.text("now()"),
        nullable=False,
    )


def _updated_at_column() -> sa.Column[object]:
    return sa.Column(
        "updated_at",
        sa.DateTime(timezone=True),
        server_default=sa.text("now()"),
        nullable=False,
    )


def _version_column() -> sa.Column[object]:
    return sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False)


def upgrade() -> None:
    op.drop_constraint(op.f("ck_items_item_type_values"), "items", type_="check")
    op.create_check_constraint(
        op.f("ck_items_item_type_values"),
        "items",
        "item_type IN ('product', 'service', 'supply', 'membership', 'asset_template', 'other')",
    )

    op.create_table(
        "inventory_warehouses",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(48), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("status", sa.String(16), server_default=sa.text("'active'"), nullable=False),
        _id_column(),
        _created_at_column(),
        _updated_at_column(),
        _version_column(),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'archived')",
            name=op.f("ck_inventory_warehouses_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_inventory_warehouses_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_inventory_warehouses_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inventory_warehouses")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_inventory_warehouses_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id",
            "branch_id",
            "id",
            name="uq_inventory_warehouses_scope_id",
        ),
        sa.UniqueConstraint(
            "workspace_id",
            "branch_id",
            "code",
            name="uq_inventory_warehouses_scope_code",
        ),
    )
    op.create_index(
        "ix_inventory_warehouses_workspace_branch_status",
        "inventory_warehouses",
        ["workspace_id", "branch_id", "status"],
    )
    op.create_index(
        "uq_inventory_warehouses_default_branch",
        "inventory_warehouses",
        ["workspace_id", "branch_id"],
        unique=True,
        postgresql_where=sa.text("is_default AND status = 'active'"),
    )

    op.create_table(
        "inventory_item_profiles",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("sale_price", sa.Numeric(14, 2)),
        sa.Column("unit_cost", sa.Numeric(14, 2)),
        sa.Column("tax_rate", sa.Numeric(5, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("creation_idempotency_key", sa.String(128)),
        sa.Column("request_fingerprint", sa.String(64)),
        _id_column(),
        _created_at_column(),
        _updated_at_column(),
        sa.CheckConstraint(
            "sale_price IS NULL OR sale_price >= 0",
            name=op.f("ck_inventory_item_profiles_sale_price_non_negative"),
        ),
        sa.CheckConstraint(
            "unit_cost IS NULL OR unit_cost >= 0",
            name=op.f("ck_inventory_item_profiles_unit_cost_non_negative"),
        ),
        sa.CheckConstraint(
            "tax_rate >= 0 AND tax_rate <= 100",
            name=op.f("ck_inventory_item_profiles_tax_rate_range"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_inventory_item_profiles_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "item_id"],
            ["items.workspace_id", "items.id"],
            name="fk_inventory_item_profiles_workspace_item",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inventory_item_profiles")),
        sa.UniqueConstraint("workspace_id", "item_id", name="uq_inventory_item_profiles_item"),
    )
    op.create_index(
        "uq_inventory_item_profiles_idempotency",
        "inventory_item_profiles",
        ["workspace_id", "creation_idempotency_key"],
        unique=True,
        postgresql_where=sa.text("creation_idempotency_key IS NOT NULL"),
    )

    op.create_table(
        "inventory_stock_balances",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("warehouse_id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Numeric(14, 3), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "minimum_quantity", sa.Numeric(14, 3), server_default=sa.text("0"), nullable=False
        ),
        _id_column(),
        _created_at_column(),
        _updated_at_column(),
        _version_column(),
        sa.CheckConstraint(
            "quantity >= 0", name=op.f("ck_inventory_stock_balances_quantity_non_negative")
        ),
        sa.CheckConstraint(
            "minimum_quantity >= 0",
            name=op.f("ck_inventory_stock_balances_minimum_quantity_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_inventory_stock_balances_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id", "warehouse_id"],
            [
                "inventory_warehouses.workspace_id",
                "inventory_warehouses.branch_id",
                "inventory_warehouses.id",
            ],
            name="fk_inventory_stock_balances_workspace_warehouse",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "item_id", "branch_id"],
            [
                "item_branch_assignments.workspace_id",
                "item_branch_assignments.item_id",
                "item_branch_assignments.branch_id",
            ],
            name="fk_inventory_stock_balances_workspace_item_branch",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inventory_stock_balances")),
        sa.UniqueConstraint(
            "workspace_id",
            "warehouse_id",
            "item_id",
            name="uq_inventory_stock_balances_warehouse_item",
        ),
    )
    op.create_index(
        "ix_inventory_stock_balances_workspace_branch_item",
        "inventory_stock_balances",
        ["workspace_id", "branch_id", "item_id"],
    )
    op.create_index(
        "ix_inventory_stock_balances_workspace_low_stock",
        "inventory_stock_balances",
        ["workspace_id", "branch_id", "quantity", "minimum_quantity"],
    )

    op.create_table(
        "inventory_movements",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("warehouse_id", sa.Uuid(), nullable=False),
        sa.Column("movement_type", sa.String(16), nullable=False),
        sa.Column("employee_id", sa.Uuid()),
        sa.Column("appointment_id", sa.Uuid()),
        sa.Column("comment", sa.String(1000)),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_fingerprint", sa.String(64), nullable=False),
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        _id_column(),
        _created_at_column(),
        sa.CheckConstraint(
            "movement_type IN ('opening', 'outbound', 'adjustment', 'inbound')",
            name=op.f("ck_inventory_movements_movement_type_values"),
        ),
        sa.CheckConstraint(
            "char_length(idempotency_key) >= 8",
            name=op.f("ck_inventory_movements_idempotency_key_length"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_inventory_movements_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id", "warehouse_id"],
            [
                "inventory_warehouses.workspace_id",
                "inventory_warehouses.branch_id",
                "inventory_warehouses.id",
            ],
            name="fk_inventory_movements_workspace_warehouse",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            name="fk_inventory_movements_workspace_employee",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "appointment_id"],
            ["appointments.workspace_id", "appointments.id"],
            name="fk_inventory_movements_workspace_appointment",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"],
            ["platform_users.id"],
            name=op.f("fk_inventory_movements_created_by_platform_user_id_platform_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inventory_movements")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_inventory_movements_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id", "idempotency_key", name="uq_inventory_movements_idempotency"
        ),
    )
    op.create_index(
        "ix_inventory_movements_workspace_branch_created",
        "inventory_movements",
        ["workspace_id", "branch_id", "created_at"],
    )
    op.create_index(
        "ix_inventory_movements_workspace_type_created",
        "inventory_movements",
        ["workspace_id", "movement_type", "created_at"],
    )
    op.create_index(
        "ix_inventory_movements_workspace_employee_created",
        "inventory_movements",
        ["workspace_id", "employee_id", "created_at"],
    )

    op.create_table(
        "inventory_movement_lines",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("movement_id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("quantity_delta", sa.Numeric(14, 3), nullable=False),
        sa.Column("quantity_before", sa.Numeric(14, 3), nullable=False),
        sa.Column("quantity_after", sa.Numeric(14, 3), nullable=False),
        sa.Column("unit_cost_snapshot", sa.Numeric(14, 2)),
        sa.Column("item_name", sa.String(160), nullable=False),
        sa.Column("item_sku", sa.String(64)),
        sa.Column("unit_symbol", sa.String(16), nullable=False),
        _id_column(),
        sa.CheckConstraint(
            "quantity_delta <> 0",
            name=op.f("ck_inventory_movement_lines_quantity_delta_non_zero"),
        ),
        sa.CheckConstraint(
            "quantity_before >= 0",
            name=op.f("ck_inventory_movement_lines_quantity_before_non_negative"),
        ),
        sa.CheckConstraint(
            "quantity_after >= 0",
            name=op.f("ck_inventory_movement_lines_quantity_after_non_negative"),
        ),
        sa.CheckConstraint(
            "unit_cost_snapshot IS NULL OR unit_cost_snapshot >= 0",
            name=op.f("ck_inventory_movement_lines_unit_cost_snapshot_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_inventory_movement_lines_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "movement_id"],
            ["inventory_movements.workspace_id", "inventory_movements.id"],
            name="fk_inventory_movement_lines_workspace_movement",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "item_id"],
            ["items.workspace_id", "items.id"],
            name="fk_inventory_movement_lines_workspace_item",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inventory_movement_lines")),
    )
    op.create_index(
        "ix_inventory_movement_lines_workspace_movement",
        "inventory_movement_lines",
        ["workspace_id", "movement_id"],
    )
    op.create_index(
        "ix_inventory_movement_lines_workspace_item",
        "inventory_movement_lines",
        ["workspace_id", "item_id", "movement_id"],
    )

    op.create_table(
        "asset_categories",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(48), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("normalized_name", sa.String(240), nullable=False),
        sa.Column("status", sa.String(16), server_default=sa.text("'active'"), nullable=False),
        _id_column(),
        _created_at_column(),
        _updated_at_column(),
        _version_column(),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'archived')",
            name=op.f("ck_asset_categories_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_asset_categories_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_asset_categories")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_asset_categories_workspace_id"),
        sa.UniqueConstraint("workspace_id", "code", name="uq_asset_categories_workspace_code"),
        sa.UniqueConstraint(
            "workspace_id", "normalized_name", name="uq_asset_categories_workspace_name"
        ),
    )
    op.create_index(
        "ix_asset_categories_workspace_status",
        "asset_categories",
        ["workspace_id", "status"],
    )

    op.create_table(
        "assets",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("code", sa.String(64)),
        sa.Column("acquisition_value", sa.Numeric(14, 2), nullable=False),
        sa.Column("status", sa.String(16), server_default=sa.text("'activo'"), nullable=False),
        sa.Column("location", sa.String(240)),
        sa.Column("purchase_date", sa.Date()),
        sa.Column("notes", sa.String(1000)),
        sa.Column("creation_idempotency_key", sa.String(128)),
        sa.Column("request_fingerprint", sa.String(64)),
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=False),
        _id_column(),
        _created_at_column(),
        _updated_at_column(),
        _version_column(),
        sa.CheckConstraint(
            "acquisition_value >= 0",
            name=op.f("ck_assets_acquisition_value_non_negative"),
        ),
        sa.CheckConstraint(
            "status IN ('activo', 'reparacion', 'baja')",
            name=op.f("ck_assets_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_assets_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "category_id"],
            ["asset_categories.workspace_id", "asset_categories.id"],
            name="fk_assets_workspace_category",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_assets_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"],
            ["platform_users.id"],
            name=op.f("fk_assets_created_by_platform_user_id_platform_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"],
            ["platform_users.id"],
            name=op.f("fk_assets_updated_by_platform_user_id_platform_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_assets")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_assets_workspace_id"),
    )
    op.create_index(
        "uq_assets_workspace_code",
        "assets",
        ["workspace_id", "code"],
        unique=True,
        postgresql_where=sa.text("code IS NOT NULL"),
    )
    op.create_index(
        "ix_assets_workspace_branch_status",
        "assets",
        ["workspace_id", "branch_id", "status"],
    )
    op.create_index("ix_assets_workspace_category", "assets", ["workspace_id", "category_id"])
    op.create_index(
        "uq_assets_workspace_idempotency",
        "assets",
        ["workspace_id", "creation_idempotency_key"],
        unique=True,
        postgresql_where=sa.text("creation_idempotency_key IS NOT NULL"),
    )

    _install_inventory_catalogs()
    _seed_inventory_defaults()
    _backfill_inventory_profiles()


def _install_inventory_catalogs() -> None:
    op.execute(
        """
        INSERT INTO module_definitions (code, name, kind, status, dependency_codes)
        VALUES ('inventory', 'Inventory and assets', 'optional', 'available',
                '["foundation", "catalog"]')
        ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
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
            ('inventory.read', 'inventory', 'read', 'Ver inventario',
             'View inventory summaries, items, movements, warehouses, and assets.', 10, false),
            ('inventory.manage', 'inventory', 'manage', 'Gestionar inventario y activos',
             'Create and update inventory items, asset categories, and assets.', 20, false),
            ('inventory.move', 'inventory', 'move', 'Registrar movimientos de inventario',
             'Register idempotent stock outputs and adjustments.', 30, false)
        ON CONFLICT (code) DO UPDATE SET
            module_code = EXCLUDED.module_code,
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
          AND permission.code IN ('inventory.read', 'inventory.manage', 'inventory.move')
        ON CONFLICT (workspace_id, role_id, permission_id) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO module_entitlements
            (workspace_id, module_definition_id, status, effective_from)
        SELECT workspace.id, module.id, 'enabled', now()
        FROM workspaces AS workspace
        JOIN module_definitions AS module ON module.code = 'inventory'
        ON CONFLICT (workspace_id, module_definition_id) DO NOTHING
        """
    )


def _seed_inventory_defaults() -> None:
    op.execute(
        """
        INSERT INTO inventory_warehouses
            (workspace_id, branch_id, code, name, is_default, status)
        SELECT branch.workspace_id, branch.id, 'main', 'Almacén principal', true, 'active'
        FROM branches AS branch
        WHERE branch.status = 'active'
        ON CONFLICT (workspace_id, branch_id, code) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO asset_categories (workspace_id, code, name, normalized_name, status)
        SELECT workspace.id, category.code, category.name, lower(category.name), 'active'
        FROM workspaces AS workspace
        CROSS JOIN (
            VALUES
                ('mobiliario', 'Mobiliario'),
                ('equipos', 'Equipos'),
                ('tecnologia', 'Tecnología'),
                ('vehiculos', 'Vehículos'),
                ('herramientas', 'Herramientas'),
                ('otros', 'Otros')
        ) AS category(code, name)
        ON CONFLICT (workspace_id, code) DO NOTHING
        """
    )


def _backfill_inventory_profiles() -> None:
    op.execute(
        """
        INSERT INTO inventory_item_profiles (workspace_id, item_id, sale_price, unit_cost, tax_rate)
        SELECT item.workspace_id, item.id, NULL, NULL, 0
        FROM items AS item
        WHERE item.item_type IN ('product', 'service', 'supply')
        ON CONFLICT (workspace_id, item_id) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO inventory_stock_balances
            (workspace_id, branch_id, warehouse_id, item_id, quantity, minimum_quantity)
        SELECT assignment.workspace_id, assignment.branch_id, warehouse.id, assignment.item_id, 0, 0
        FROM item_branch_assignments AS assignment
        JOIN items AS item
          ON item.workspace_id = assignment.workspace_id
         AND item.id = assignment.item_id
        JOIN inventory_warehouses AS warehouse
          ON warehouse.workspace_id = assignment.workspace_id
         AND warehouse.branch_id = assignment.branch_id
         AND warehouse.is_default
         AND warehouse.status = 'active'
        WHERE assignment.status = 'active'
          AND item.item_type IN ('product', 'supply')
        ON CONFLICT (workspace_id, warehouse_id, item_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permissions
        WHERE permission_id IN (
            SELECT id FROM permissions
            WHERE code IN ('inventory.read', 'inventory.manage', 'inventory.move')
        )
        """
    )
    op.execute(
        """
        DELETE FROM module_entitlements
        WHERE module_definition_id = (
            SELECT id FROM module_definitions WHERE code = 'inventory'
        )
        """
    )
    op.execute(
        "DELETE FROM permissions "
        "WHERE code IN ('inventory.read', 'inventory.manage', 'inventory.move')"
    )
    op.execute("UPDATE module_definitions SET status = 'planned' WHERE code = 'inventory'")

    op.drop_index("uq_assets_workspace_idempotency", table_name="assets")
    op.drop_index("ix_assets_workspace_category", table_name="assets")
    op.drop_index("ix_assets_workspace_branch_status", table_name="assets")
    op.drop_index("uq_assets_workspace_code", table_name="assets")
    op.drop_table("assets")
    op.drop_index("ix_asset_categories_workspace_status", table_name="asset_categories")
    op.drop_table("asset_categories")
    op.drop_index(
        "ix_inventory_movement_lines_workspace_item", table_name="inventory_movement_lines"
    )
    op.drop_index(
        "ix_inventory_movement_lines_workspace_movement",
        table_name="inventory_movement_lines",
    )
    op.drop_table("inventory_movement_lines")
    op.drop_index(
        "ix_inventory_movements_workspace_employee_created", table_name="inventory_movements"
    )
    op.drop_index("ix_inventory_movements_workspace_type_created", table_name="inventory_movements")
    op.drop_index(
        "ix_inventory_movements_workspace_branch_created", table_name="inventory_movements"
    )
    op.drop_table("inventory_movements")
    op.drop_index(
        "ix_inventory_stock_balances_workspace_low_stock",
        table_name="inventory_stock_balances",
    )
    op.drop_index(
        "ix_inventory_stock_balances_workspace_branch_item",
        table_name="inventory_stock_balances",
    )
    op.drop_table("inventory_stock_balances")
    op.drop_index("uq_inventory_item_profiles_idempotency", table_name="inventory_item_profiles")
    op.drop_table("inventory_item_profiles")
    op.drop_index("uq_inventory_warehouses_default_branch", table_name="inventory_warehouses")
    op.drop_index(
        "ix_inventory_warehouses_workspace_branch_status", table_name="inventory_warehouses"
    )
    op.drop_table("inventory_warehouses")

    # The previous catalog revision did not understand supplies. Preserve the
    # catalog rows during rollback by mapping them to its generic item type.
    op.execute("UPDATE items SET item_type = 'other' WHERE item_type = 'supply'")
    op.drop_constraint(op.f("ck_items_item_type_values"), "items", type_="check")
    op.create_check_constraint(
        op.f("ck_items_item_type_values"),
        "items",
        "item_type IN ('product', 'service', 'membership', 'asset_template', 'other')",
    )
