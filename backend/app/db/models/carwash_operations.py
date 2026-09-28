from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
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


class CarwashWash(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "carwash_washes"
    __table_args__ = (
        UniqueConstraint("workspace_id", "branch_id", "id", name="uq_carwash_washes_scope_id"),
        UniqueConstraint("workspace_id", "creation_key", name="uq_carwash_washes_creation"),
        UniqueConstraint("workspace_id", "start_key", name="uq_carwash_washes_start"),
        UniqueConstraint("workspace_id", "cancel_key", name="uq_carwash_washes_cancel"),
        UniqueConstraint("workspace_id", "sale_id", name="uq_carwash_washes_sale"),
        UniqueConstraint("workspace_id", "completion_key", name="uq_carwash_washes_completion"),
        UniqueConstraint("workspace_id", "void_key", name="uq_carwash_washes_void"),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "sale_id"],
            ["sales.workspace_id", "sales.branch_id", "sales.id"],
            name="fk_carwash_washes_sale",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "receivable_id"],
            [
                "customer_receivables.workspace_id",
                "customer_receivables.branch_id",
                "customer_receivables.id",
            ],
            name="fk_carwash_washes_receivable",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "customer_id", "branch_id"],
            [
                "customer_branch_assignments.workspace_id",
                "customer_branch_assignments.customer_id",
                "customer_branch_assignments.branch_id",
            ],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "washer_id", "branch_id"],
            [
                "employee_branch_assignments.workspace_id",
                "employee_branch_assignments.employee_id",
                "employee_branch_assignments.branch_id",
            ],
            name="fk_carwash_washes_washer_branch",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "supervisor_id", "branch_id"],
            [
                "employee_branch_assignments.workspace_id",
                "employee_branch_assignments.employee_id",
                "employee_branch_assignments.branch_id",
            ],
            name="fk_carwash_washes_supervisor_branch",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "payment_method_id"],
            ["payment_methods.workspace_id", "payment_methods.id"],
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "status IN ('waiting', 'washing', 'cancelled', 'completed', 'voided')",
            name="status_values",
        ),
        CheckConstraint(
            "(status IN ('completed', 'voided')) = (sale_id IS NOT NULL) AND "
            "(sale_id IS NULL) = (completed_at IS NULL) AND "
            "(sale_id IS NULL) = (completion_key IS NULL) AND "
            "(sale_id IS NULL) = (completion_fingerprint IS NULL) AND "
            "(sale_id IS NULL) = (sale_number IS NULL)",
            name="completion_consistent",
        ),
        CheckConstraint(
            "(status = 'voided') = (voided_at IS NOT NULL AND void_reason IS NOT NULL)",
            name="void_consistent",
        ),
        CheckConstraint(
            "(sale_id IS NULL AND final_subtotal IS NULL AND final_discount_amount IS NULL "
            "AND final_tax_amount IS NULL AND final_total IS NULL) OR "
            "(sale_id IS NOT NULL AND final_subtotal IS NOT NULL "
            "AND final_discount_amount IS NOT NULL "
            "AND final_tax_amount IS NOT NULL AND final_total IS NOT NULL AND final_subtotal >= 0 "
            "AND final_discount_amount BETWEEN 0 AND final_subtotal AND final_tax_amount >= 0 "
            "AND final_total = final_subtotal - final_discount_amount + final_tax_amount)",
            name="final_totals_valid",
        ),
        CheckConstraint("version >= 1", name="version_positive"),
        CheckConstraint("char_length(trim(plate)) > 0", name="plate_required"),
        CheckConstraint(
            "subtotal >= 0 AND tax_amount >= 0 AND total = subtotal + tax_amount",
            name="totals_valid",
        ),
        CheckConstraint(
            "(status = 'cancelled') = (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL "
            "AND cancel_key IS NOT NULL AND cancel_fingerprint IS NOT NULL)",
            name="cancellation_required",
        ),
        CheckConstraint(
            "(started_at IS NULL) = (start_key IS NULL) "
            "AND (start_key IS NULL) = (start_fingerprint IS NULL)",
            name="start_metadata",
        ),
        CheckConstraint("status <> 'washing' OR started_at IS NOT NULL", name="washing_started"),
        Index("ix_carwash_washes_scope_created", "workspace_id", "branch_id", "created_at", "id"),
        Index("ix_carwash_washes_scope_status", "workspace_id", "branch_id", "status"),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    customer_id: Mapped[UUID] = mapped_column(nullable=False)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    plate: Mapped[str] = mapped_column(String(32), nullable=False)
    vehicle_model: Mapped[str | None] = mapped_column(String(120))
    vehicle_color: Mapped[str | None] = mapped_column(String(60))
    washer_id: Mapped[UUID] = mapped_column(nullable=False)
    washer_name: Mapped[str] = mapped_column(String(201), nullable=False)
    supervisor_id: Mapped[UUID] = mapped_column(nullable=False)
    supervisor_name: Mapped[str] = mapped_column(String(201), nullable=False)
    payment_method_id: Mapped[UUID | None] = mapped_column()
    payment_method_name: Mapped[str | None] = mapped_column(String(120))
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="waiting", server_default=text("'waiting'")
    )
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(String(500))
    creation_key: Mapped[str] = mapped_column(String(128), nullable=False)
    creation_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    start_key: Mapped[str | None] = mapped_column(String(128))
    start_fingerprint: Mapped[str | None] = mapped_column(String(64))
    cancel_key: Mapped[str | None] = mapped_column(String(128))
    cancel_fingerprint: Mapped[str | None] = mapped_column(String(64))
    sale_id: Mapped[UUID | None] = mapped_column()
    sale_number: Mapped[str | None] = mapped_column(String(32))
    receivable_id: Mapped[UUID | None] = mapped_column()
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completion_key: Mapped[str | None] = mapped_column(String(128))
    completion_fingerprint: Mapped[str | None] = mapped_column(String(64))
    final_subtotal: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    final_discount_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    final_tax_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    final_total: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    void_reason: Mapped[str | None] = mapped_column(String(1000))
    void_key: Mapped[str | None] = mapped_column(String(128))
    void_fingerprint: Mapped[str | None] = mapped_column(String(64))


class CarwashWashLine(UuidPrimaryKeyMixin, Base):
    __tablename__ = "carwash_wash_lines"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "branch_id", "wash_id", "id", name="uq_carwash_lines_scope_id"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "wash_id"],
            ["carwash_washes.workspace_id", "carwash_washes.branch_id", "carwash_washes.id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "service_config_id"],
            [
                "carwash_service_configs.workspace_id",
                "carwash_service_configs.branch_id",
                "carwash_service_configs.id",
            ],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "item_id"], ["items.workspace_id", "items.id"], ondelete="RESTRICT"
        ),
        UniqueConstraint("wash_id", "service_config_id", name="uq_carwash_lines_wash_service"),
        CheckConstraint(
            "unit_price >= 0 AND tax_rate BETWEEN 0 AND 100 AND tax_amount >= 0 "
            "AND total = unit_price + tax_amount",
            name="amounts_valid",
        ),
        CheckConstraint(
            "washer_rate BETWEEN 0 AND 100 AND supervisor_rate BETWEEN 0 AND 100 "
            "AND washer_rate + supervisor_rate <= 100",
            name="rates_valid",
        ),
        CheckConstraint(
            "config_version >= 1 AND catalog_version >= 1 AND position >= 0", name="versions_valid"
        ),
    )
    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    wash_id: Mapped[UUID] = mapped_column(nullable=False)
    service_config_id: Mapped[UUID] = mapped_column(nullable=False)
    item_id: Mapped[UUID] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    washer_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    supervisor_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    config_version: Mapped[int] = mapped_column(Integer, nullable=False)
    catalog_version: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
