from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin, VersionMixin


class ItemCategory(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "item_categories"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_item_categories_workspace_id_id"),
        UniqueConstraint(
            "workspace_id",
            "normalized_name",
            name="uq_item_categories_workspace_normalized_name",
        ),
        CheckConstraint("status IN ('active', 'inactive', 'archived')", name="status_values"),
        Index("ix_item_categories_workspace_status", "workspace_id", "status"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(320), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )


class UnitOfMeasure(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "units_of_measure"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_units_of_measure_workspace_id_id"),
        UniqueConstraint("workspace_id", "code", name="uq_units_of_measure_workspace_code"),
        CheckConstraint("status IN ('active', 'inactive', 'archived')", name="status_values"),
        Index("ix_units_of_measure_workspace_status", "workspace_id", "status"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    symbol: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )


class Item(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "items"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_items_workspace_id_id"),
        ForeignKeyConstraint(
            ["workspace_id", "category_id"],
            ["item_categories.workspace_id", "item_categories.id"],
            ondelete="RESTRICT",
            name="fk_items_workspace_category",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "unit_of_measure_id"],
            ["units_of_measure.workspace_id", "units_of_measure.id"],
            ondelete="RESTRICT",
            name="fk_items_workspace_unit",
        ),
        CheckConstraint(
            "item_type IN ('product', 'service', 'supply', 'membership', "
            "'asset_template', 'other')",
            name="item_type_values",
        ),
        CheckConstraint("status IN ('active', 'inactive', 'archived')", name="status_values"),
        Index(
            "uq_items_workspace_sku",
            "workspace_id",
            "sku",
            unique=True,
            postgresql_where=text("sku IS NOT NULL"),
        ),
        Index("ix_items_workspace_category", "workspace_id", "category_id"),
        Index(
            "ix_items_workspace_type_status",
            "workspace_id",
            "item_type",
            "status",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    category_id: Mapped[UUID] = mapped_column(nullable=False)
    unit_of_measure_id: Mapped[UUID] = mapped_column(nullable=False)
    item_type: Mapped[str] = mapped_column(String(24), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000))
    sku: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )


class ItemBranchAssignment(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "item_branch_assignments"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_item_branch_assignments_workspace_id_id"),
        UniqueConstraint(
            "workspace_id",
            "item_id",
            "branch_id",
            name="uq_item_branch_assignments_workspace_item_branch",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "item_id"],
            ["items.workspace_id", "items.id"],
            ondelete="RESTRICT",
            name="fk_item_branch_assignments_workspace_item",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_item_branch_assignments_workspace_branch",
        ),
        CheckConstraint("status IN ('active', 'inactive')", name="status_values"),
        Index(
            "ix_item_branch_assignments_workspace_branch_status",
            "workspace_id",
            "branch_id",
            "status",
        ),
        Index(
            "ix_item_branch_assignments_workspace_item_status",
            "workspace_id",
            "item_id",
            "status",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    item_id: Mapped[UUID] = mapped_column(nullable=False)
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )
