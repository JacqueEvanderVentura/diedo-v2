from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin, VersionMixin


class Supplier(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "suppliers"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_suppliers_workspace_id"),
        UniqueConstraint(
            "workspace_id", "normalized_name", name="uq_suppliers_workspace_name"
        ),
        CheckConstraint("status IN ('active', 'inactive', 'archived')", name="status_values"),
        CheckConstraint("product_count >= 0", name="product_count_non_negative"),
        Index("ix_suppliers_workspace_status_name", "workspace_id", "status", "normalized_name"),
        Index(
            "uq_suppliers_workspace_tax_identifier",
            "workspace_id",
            "tax_identifier",
            unique=True,
            postgresql_where=text("tax_identifier IS NOT NULL AND status <> 'archived'"),
        ),
        Index(
            "uq_suppliers_workspace_idempotency",
            "workspace_id",
            "creation_idempotency_key",
            unique=True,
            postgresql_where=text("creation_idempotency_key IS NOT NULL"),
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(240), nullable=False)
    tax_identifier: Mapped[str | None] = mapped_column(String(80))
    contact_name: Mapped[str | None] = mapped_column(String(160))
    phone: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(254))
    address: Mapped[str | None] = mapped_column(String(500))
    product_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )
    creation_idempotency_key: Mapped[str | None] = mapped_column(String(128))
    request_fingerprint: Mapped[str | None] = mapped_column(String(64))
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class SupplierBranchAssignment(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "supplier_branch_assignments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "supplier_id"],
            ["suppliers.workspace_id", "suppliers.id"],
            ondelete="CASCADE",
            name="fk_supplier_branch_assignments_workspace_supplier",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_supplier_branch_assignments_workspace_branch",
        ),
        UniqueConstraint(
            "workspace_id",
            "supplier_id",
            "branch_id",
            name="uq_supplier_branch_assignments_supplier_branch",
        ),
        Index(
            "ix_supplier_branch_assignments_workspace_branch",
            "workspace_id",
            "branch_id",
            "supplier_id",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    supplier_id: Mapped[UUID] = mapped_column(nullable=False)
    branch_id: Mapped[UUID] = mapped_column(nullable=False)


class PurchaseRequest(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "purchase_requests"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_purchase_requests_workspace_id"),
        UniqueConstraint(
            "workspace_id", "request_number", name="uq_purchase_requests_workspace_number"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "supplier_id"],
            ["suppliers.workspace_id", "suppliers.id"],
            ondelete="RESTRICT",
            name="fk_purchase_requests_workspace_supplier",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_purchase_requests_workspace_branch",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "requester_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_purchase_requests_workspace_requester",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "reviewer_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_purchase_requests_workspace_reviewer",
        ),
        CheckConstraint(
            "status IN ('pendiente', 'aprobada', 'rechazada', 'entregada')",
            name="status_values",
        ),
        CheckConstraint("priority IN ('normal', 'alta')", name="priority_values"),
        CheckConstraint(
            "(status = 'pendiente' AND reviewer_membership_id IS NULL AND reviewed_at IS NULL "
            "AND delivered_at IS NULL) OR "
            "(status IN ('aprobada', 'rechazada') AND reviewer_membership_id IS NOT NULL "
            "AND reviewed_at IS NOT NULL AND delivered_at IS NULL) OR "
            "(status = 'entregada' AND reviewer_membership_id IS NOT NULL "
            "AND reviewed_at IS NOT NULL AND delivered_at IS NOT NULL)",
            name="status_timestamps_consistent",
        ),
        Index(
            "ix_purchase_requests_workspace_branch_status_created",
            "workspace_id",
            "branch_id",
            "status",
            "created_at",
        ),
        Index(
            "ix_purchase_requests_workspace_supplier_created",
            "workspace_id",
            "supplier_id",
            "created_at",
        ),
        Index(
            "uq_purchase_requests_workspace_idempotency",
            "workspace_id",
            "creation_idempotency_key",
            unique=True,
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    request_number: Mapped[str] = mapped_column(String(32), nullable=False)
    supplier_id: Mapped[UUID] = mapped_column(nullable=False)
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    requester_membership_id: Mapped[UUID] = mapped_column(nullable=False)
    requester_name: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pendiente", server_default=text("'pendiente'")
    )
    priority: Mapped[str] = mapped_column(
        String(16), nullable=False, default="normal", server_default=text("'normal'")
    )
    notes: Mapped[str | None] = mapped_column(String(2000))
    quote_file_name: Mapped[str | None] = mapped_column(String(255))
    reviewer_membership_id: Mapped[UUID | None] = mapped_column()
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    creation_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class PurchaseRequestItem(UuidPrimaryKeyMixin, Base):
    __tablename__ = "purchase_request_items"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "purchase_request_id"],
            ["purchase_requests.workspace_id", "purchase_requests.id"],
            ondelete="CASCADE",
            name="fk_purchase_request_items_workspace_request",
        ),
        UniqueConstraint(
            "workspace_id",
            "purchase_request_id",
            "position",
            name="uq_purchase_request_items_request_position",
        ),
        CheckConstraint("position >= 1", name="position_positive"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        Index(
            "ix_purchase_request_items_workspace_request",
            "workspace_id",
            "purchase_request_id",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    purchase_request_id: Mapped[UUID] = mapped_column(nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(240), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit: Mapped[str] = mapped_column(String(40), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)


class PurchasingSettings(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "purchasing_settings"
    __table_args__ = (
        UniqueConstraint("workspace_id", name="uq_purchasing_settings_workspace"),
        ForeignKeyConstraint(
            ["workspace_id", "approver_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_purchasing_settings_workspace_approver",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    approver_membership_id: Mapped[UUID | None] = mapped_column()
    notify_on_request: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    updated_by_platform_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT")
    )
