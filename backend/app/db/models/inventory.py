from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin, VersionMixin

DEFAULT_ASSET_CATEGORIES = (
    ("mobiliario", "Mobiliario"),
    ("equipos", "Equipos"),
    ("tecnologia", "Tecnología"),
    ("vehiculos", "Vehículos"),
    ("herramientas", "Herramientas"),
    ("otros", "Otros"),
)


class InventoryWarehouse(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "inventory_warehouses"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_inventory_warehouses_workspace_id"),
        UniqueConstraint(
            "workspace_id",
            "branch_id",
            "id",
            name="uq_inventory_warehouses_scope_id",
        ),
        UniqueConstraint(
            "workspace_id",
            "branch_id",
            "code",
            name="uq_inventory_warehouses_scope_code",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_inventory_warehouses_workspace_branch",
        ),
        CheckConstraint("status IN ('active', 'inactive', 'archived')", name="status_values"),
        Index(
            "ix_inventory_warehouses_workspace_branch_status",
            "workspace_id",
            "branch_id",
            "status",
        ),
        Index(
            "uq_inventory_warehouses_default_branch",
            "workspace_id",
            "branch_id",
            unique=True,
            postgresql_where=text("is_default AND status = 'active'"),
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    code: Mapped[str] = mapped_column(String(48), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )


class InventoryItemProfile(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "inventory_item_profiles"
    __table_args__ = (
        UniqueConstraint("workspace_id", "item_id", name="uq_inventory_item_profiles_item"),
        ForeignKeyConstraint(
            ["workspace_id", "item_id"],
            ["items.workspace_id", "items.id"],
            ondelete="RESTRICT",
            name="fk_inventory_item_profiles_workspace_item",
        ),
        CheckConstraint(
            "sale_price IS NULL OR sale_price >= 0",
            name="sale_price_non_negative",
        ),
        CheckConstraint(
            "unit_cost IS NULL OR unit_cost >= 0",
            name="unit_cost_non_negative",
        ),
        CheckConstraint("tax_rate >= 0 AND tax_rate <= 100", name="tax_rate_range"),
        Index(
            "uq_inventory_item_profiles_idempotency",
            "workspace_id",
            "creation_idempotency_key",
            unique=True,
            postgresql_where=text("creation_idempotency_key IS NOT NULL"),
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    item_id: Mapped[UUID] = mapped_column(nullable=False)
    sale_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    unit_cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    creation_idempotency_key: Mapped[str | None] = mapped_column(String(128))
    request_fingerprint: Mapped[str | None] = mapped_column(String(64))


class InventoryStockBalance(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "inventory_stock_balances"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "warehouse_id",
            "item_id",
            name="uq_inventory_stock_balances_warehouse_item",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "warehouse_id"],
            [
                "inventory_warehouses.workspace_id",
                "inventory_warehouses.branch_id",
                "inventory_warehouses.id",
            ],
            ondelete="RESTRICT",
            name="fk_inventory_stock_balances_workspace_warehouse",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "item_id", "branch_id"],
            [
                "item_branch_assignments.workspace_id",
                "item_branch_assignments.item_id",
                "item_branch_assignments.branch_id",
            ],
            ondelete="RESTRICT",
            name="fk_inventory_stock_balances_workspace_item_branch",
        ),
        CheckConstraint("quantity >= 0", name="quantity_non_negative"),
        CheckConstraint("minimum_quantity >= 0", name="minimum_quantity_non_negative"),
        Index(
            "ix_inventory_stock_balances_workspace_branch_item",
            "workspace_id",
            "branch_id",
            "item_id",
        ),
        Index(
            "ix_inventory_stock_balances_workspace_low_stock",
            "workspace_id",
            "branch_id",
            "quantity",
            "minimum_quantity",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    warehouse_id: Mapped[UUID] = mapped_column(nullable=False)
    item_id: Mapped[UUID] = mapped_column(nullable=False)
    quantity: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    minimum_quantity: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), nullable=False, default=Decimal("0"), server_default=text("0")
    )


class InventoryMovement(UuidPrimaryKeyMixin, Base):
    __tablename__ = "inventory_movements"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_inventory_movements_workspace_id"),
        UniqueConstraint(
            "workspace_id",
            "idempotency_key",
            name="uq_inventory_movements_idempotency",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "warehouse_id"],
            [
                "inventory_warehouses.workspace_id",
                "inventory_warehouses.branch_id",
                "inventory_warehouses.id",
            ],
            ondelete="RESTRICT",
            name="fk_inventory_movements_workspace_warehouse",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_inventory_movements_workspace_employee",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "appointment_id"],
            ["appointments.workspace_id", "appointments.id"],
            ondelete="RESTRICT",
            name="fk_inventory_movements_workspace_appointment",
        ),
        CheckConstraint(
            "movement_type IN ('opening', 'outbound', 'adjustment', 'inbound')",
            name="movement_type_values",
        ),
        CheckConstraint("char_length(idempotency_key) >= 8", name="idempotency_key_length"),
        Index(
            "ix_inventory_movements_workspace_branch_created",
            "workspace_id",
            "branch_id",
            "created_at",
        ),
        Index(
            "ix_inventory_movements_workspace_type_created",
            "workspace_id",
            "movement_type",
            "created_at",
        ),
        Index(
            "ix_inventory_movements_workspace_employee_created",
            "workspace_id",
            "employee_id",
            "created_at",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    warehouse_id: Mapped[UUID] = mapped_column(nullable=False)
    movement_type: Mapped[str] = mapped_column(String(16), nullable=False)
    employee_id: Mapped[UUID | None] = mapped_column(nullable=True)
    appointment_id: Mapped[UUID | None] = mapped_column(nullable=True)
    comment: Mapped[str | None] = mapped_column(String(1000))
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


class InventoryMovementLine(UuidPrimaryKeyMixin, Base):
    __tablename__ = "inventory_movement_lines"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "movement_id"],
            ["inventory_movements.workspace_id", "inventory_movements.id"],
            ondelete="RESTRICT",
            name="fk_inventory_movement_lines_workspace_movement",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "item_id"],
            ["items.workspace_id", "items.id"],
            ondelete="RESTRICT",
            name="fk_inventory_movement_lines_workspace_item",
        ),
        CheckConstraint("quantity_delta <> 0", name="quantity_delta_non_zero"),
        CheckConstraint("quantity_before >= 0", name="quantity_before_non_negative"),
        CheckConstraint("quantity_after >= 0", name="quantity_after_non_negative"),
        CheckConstraint(
            "unit_cost_snapshot IS NULL OR unit_cost_snapshot >= 0",
            name="unit_cost_snapshot_non_negative",
        ),
        Index(
            "ix_inventory_movement_lines_workspace_movement",
            "workspace_id",
            "movement_id",
        ),
        Index(
            "ix_inventory_movement_lines_workspace_item",
            "workspace_id",
            "item_id",
            "movement_id",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    movement_id: Mapped[UUID] = mapped_column(nullable=False)
    item_id: Mapped[UUID] = mapped_column(nullable=False)
    quantity_delta: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    quantity_before: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    quantity_after: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit_cost_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    item_name: Mapped[str] = mapped_column(String(160), nullable=False)
    item_sku: Mapped[str | None] = mapped_column(String(64))
    unit_symbol: Mapped[str] = mapped_column(String(16), nullable=False)


class AssetCategory(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "asset_categories"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_asset_categories_workspace_id"),
        UniqueConstraint("workspace_id", "code", name="uq_asset_categories_workspace_code"),
        UniqueConstraint(
            "workspace_id",
            "normalized_name",
            name="uq_asset_categories_workspace_name",
        ),
        CheckConstraint("status IN ('active', 'inactive', 'archived')", name="status_values"),
        Index("ix_asset_categories_workspace_status", "workspace_id", "status"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(48), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(240), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )


class Asset(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "assets"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_assets_workspace_id"),
        ForeignKeyConstraint(
            ["workspace_id", "category_id"],
            ["asset_categories.workspace_id", "asset_categories.id"],
            ondelete="RESTRICT",
            name="fk_assets_workspace_category",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_assets_workspace_branch",
        ),
        CheckConstraint("acquisition_value >= 0", name="acquisition_value_non_negative"),
        CheckConstraint("status IN ('activo', 'reparacion', 'baja')", name="status_values"),
        Index(
            "uq_assets_workspace_code",
            "workspace_id",
            "code",
            unique=True,
            postgresql_where=text("code IS NOT NULL"),
        ),
        Index("ix_assets_workspace_branch_status", "workspace_id", "branch_id", "status"),
        Index("ix_assets_workspace_category", "workspace_id", "category_id"),
        Index(
            "uq_assets_workspace_idempotency",
            "workspace_id",
            "creation_idempotency_key",
            unique=True,
            postgresql_where=text("creation_idempotency_key IS NOT NULL"),
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    category_id: Mapped[UUID] = mapped_column(nullable=False)
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    code: Mapped[str | None] = mapped_column(String(64))
    acquisition_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="activo", server_default=text("'activo'")
    )
    location: Mapped[str | None] = mapped_column(String(240))
    purchase_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(String(1000))
    creation_idempotency_key: Mapped[str | None] = mapped_column(String(128))
    request_fingerprint: Mapped[str | None] = mapped_column(String(64))
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
