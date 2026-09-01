"""Persistence models for sales, customer receivables, and collections."""

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
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin, VersionMixin


class SalesDocumentCounter(Base):
    """Workspace-scoped, row-locked counters for human-readable documents."""

    __tablename__ = "sales_document_counters"
    __table_args__ = (
        CheckConstraint("last_quote_value >= 0", name="last_quote_value_non_negative"),
        CheckConstraint("last_sale_value >= 0", name="last_sale_value_non_negative"),
        CheckConstraint("last_receivable_value >= 0", name="last_receivable_value_non_negative"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), primary_key=True
    )
    last_quote_value: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    last_sale_value: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    last_receivable_value: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class SalesQuote(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    """Mutable quote or held POS cart with immutable commercial snapshots."""

    __tablename__ = "sales_quotes"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_sales_quotes_workspace_id"),
        UniqueConstraint(
            "workspace_id", "document_number", name="uq_sales_quotes_workspace_number"
        ),
        UniqueConstraint(
            "workspace_id",
            "creation_idempotency_key",
            name="uq_sales_quotes_workspace_idempotency",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_sales_quotes_workspace_branch",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            ondelete="RESTRICT",
            name="fk_sales_quotes_workspace_customer",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "payment_method_id"],
            ["payment_methods.workspace_id", "payment_methods.id"],
            ondelete="RESTRICT",
            name="fk_sales_quotes_workspace_payment_method",
        ),
        CheckConstraint("kind IN ('quote', 'held')", name="kind_values"),
        CheckConstraint("origin IN ('pos', 'crm')", name="origin_values"),
        CheckConstraint(
            "status IN ('open', 'converted', 'cancelled', 'expired')",
            name="status_values",
        ),
        CheckConstraint("char_length(currency_code) = 3", name="currency_code_length"),
        CheckConstraint("currency_code = upper(currency_code)", name="currency_code_uppercase"),
        CheckConstraint("subtotal >= 0", name="subtotal_non_negative"),
        CheckConstraint("discount_value >= 0", name="discount_value_non_negative"),
        CheckConstraint("discount_amount >= 0", name="discount_amount_non_negative"),
        CheckConstraint("discount_amount <= subtotal", name="discount_amount_within_subtotal"),
        CheckConstraint("tax_amount >= 0", name="tax_amount_non_negative"),
        CheckConstraint("total >= 0", name="total_non_negative"),
        CheckConstraint("discount_mode IN ('pct', 'amount')", name="discount_mode_values"),
        CheckConstraint(
            "discount_mode <> 'pct' OR discount_value <= 100",
            name="discount_pct_range",
        ),
        CheckConstraint("total = subtotal - discount_amount + tax_amount", name="total_reconciles"),
        CheckConstraint(
            "(payment_method_id IS NULL AND payment_method_code IS NULL AND "
            "payment_method_name IS NULL AND payment_channel IS NULL AND "
            "settlement_policy IS NULL AND affects_cash_drawer IS NULL AND "
            "requires_evidence IS NULL) OR "
            "(payment_method_id IS NOT NULL AND payment_method_code IS NOT NULL AND "
            "payment_method_name IS NOT NULL AND payment_channel IS NOT NULL AND "
            "settlement_policy IS NOT NULL AND affects_cash_drawer IS NOT NULL AND "
            "requires_evidence IS NOT NULL)",
            name="payment_snapshot_consistent",
        ),
        CheckConstraint(
            "(status = 'open' AND closed_at IS NULL) OR "
            "(status <> 'open' AND closed_at IS NOT NULL)",
            name="status_closed_at_consistent",
        ),
        CheckConstraint(
            "char_length(creation_idempotency_key) >= 8", name="idempotency_key_length"
        ),
        CheckConstraint("char_length(request_fingerprint) = 64", name="fingerprint_length"),
        Index(
            "ix_sales_quotes_workspace_branch_status_updated",
            "workspace_id",
            "branch_id",
            "status",
            "updated_at",
        ),
        Index(
            "ix_sales_quotes_workspace_customer_status",
            "workspace_id",
            "customer_id",
            "status",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    customer_id: Mapped[UUID | None] = mapped_column(nullable=True)
    document_number: Mapped[str] = mapped_column(String(32), nullable=False)
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default="quote", server_default=text("'quote'")
    )
    origin: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pos", server_default=text("'pos'")
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="open", server_default=text("'open'")
    )
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(200))
    customer_phone: Mapped[str | None] = mapped_column(String(40))
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    discount_mode: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pct", server_default=text("'pct'")
    )
    discount_value: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    total: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    payment_method_id: Mapped[UUID | None] = mapped_column(nullable=True)
    payment_method_code: Mapped[str | None] = mapped_column(String(48))
    payment_method_name: Mapped[str | None] = mapped_column(String(120))
    payment_channel: Mapped[str | None] = mapped_column(String(24))
    settlement_policy: Mapped[str | None] = mapped_column(String(24))
    affects_cash_drawer: Mapped[bool | None] = mapped_column(Boolean)
    requires_evidence: Mapped[bool | None] = mapped_column(Boolean)
    payment_reference: Mapped[str | None] = mapped_column(String(160))
    notes: Mapped[str | None] = mapped_column(String(1000))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    creation_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class SalesQuoteLine(UuidPrimaryKeyMixin, Base):
    __tablename__ = "sales_quote_lines"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_sales_quote_lines_workspace_id"),
        UniqueConstraint(
            "workspace_id", "quote_id", "position", name="uq_sales_quote_lines_position"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "quote_id"],
            ["sales_quotes.workspace_id", "sales_quotes.id"],
            ondelete="CASCADE",
            name="fk_sales_quote_lines_workspace_quote",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "item_id"],
            ["items.workspace_id", "items.id"],
            ondelete="RESTRICT",
            name="fk_sales_quote_lines_workspace_item",
        ),
        CheckConstraint("position >= 1", name="position_positive"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        CheckConstraint("list_price >= 0", name="list_price_non_negative"),
        CheckConstraint("discount_amount >= 0", name="discount_amount_non_negative"),
        CheckConstraint("tax_rate >= 0 AND tax_rate <= 100", name="tax_rate_range"),
        CheckConstraint("tax_amount >= 0", name="tax_amount_non_negative"),
        CheckConstraint("line_total >= 0", name="line_total_non_negative"),
        Index("ix_sales_quote_lines_workspace_quote", "workspace_id", "quote_id"),
        Index("ix_sales_quote_lines_workspace_item", "workspace_id", "item_id"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    quote_id: Mapped[UUID] = mapped_column(nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    item_id: Mapped[UUID | None] = mapped_column(nullable=True)
    item_name: Mapped[str] = mapped_column(String(160), nullable=False)
    item_sku: Mapped[str | None] = mapped_column(String(64))
    item_type: Mapped[str] = mapped_column(String(24), nullable=False)
    unit_symbol: Mapped[str] = mapped_column(String(16), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    list_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)


class Sale(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    """Posted, immutable sale. Only the explicit void lifecycle mutates it."""

    __tablename__ = "sales"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_sales_workspace_id"),
        UniqueConstraint("workspace_id", "branch_id", "id", name="uq_sales_workspace_branch_id"),
        UniqueConstraint("workspace_id", "sale_number", name="uq_sales_workspace_number"),
        UniqueConstraint(
            "workspace_id",
            "creation_idempotency_key",
            name="uq_sales_workspace_idempotency",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_sales_workspace_branch",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            ondelete="RESTRICT",
            name="fk_sales_workspace_customer",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "cash_register_id"],
            ["cash_registers.workspace_id", "cash_registers.branch_id", "cash_registers.id"],
            ondelete="RESTRICT",
            name="fk_sales_workspace_register",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "quote_id"],
            ["sales_quotes.workspace_id", "sales_quotes.id"],
            ondelete="RESTRICT",
            name="fk_sales_workspace_quote",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "inventory_movement_id"],
            ["inventory_movements.workspace_id", "inventory_movements.id"],
            ondelete="RESTRICT",
            name="fk_sales_workspace_inventory_movement",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "payment_method_id"],
            ["payment_methods.workspace_id", "payment_methods.id"],
            ondelete="RESTRICT",
            name="fk_sales_workspace_payment_method",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "sold_by_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_sales_workspace_seller_membership",
        ),
        CheckConstraint("status IN ('completed', 'voided')", name="status_values"),
        CheckConstraint("char_length(currency_code) = 3", name="currency_code_length"),
        CheckConstraint("currency_code = upper(currency_code)", name="currency_code_uppercase"),
        CheckConstraint("subtotal >= 0", name="subtotal_non_negative"),
        CheckConstraint("discount_value >= 0", name="discount_value_non_negative"),
        CheckConstraint("discount_amount >= 0", name="discount_amount_non_negative"),
        CheckConstraint("discount_amount <= subtotal", name="discount_amount_within_subtotal"),
        CheckConstraint("tax_amount >= 0", name="tax_amount_non_negative"),
        CheckConstraint("total >= 0", name="total_non_negative"),
        CheckConstraint("discount_mode IN ('pct', 'amount')", name="discount_mode_values"),
        CheckConstraint(
            "discount_mode <> 'pct' OR discount_value <= 100",
            name="discount_pct_range",
        ),
        CheckConstraint("total = subtotal - discount_amount + tax_amount", name="total_reconciles"),
        CheckConstraint(
            "(status = 'completed' AND voided_at IS NULL AND "
            "voided_by_platform_user_id IS NULL AND void_reason IS NULL) OR "
            "(status = 'voided' AND voided_at IS NOT NULL AND "
            "voided_by_platform_user_id IS NOT NULL AND void_reason IS NOT NULL)",
            name="void_state_consistent",
        ),
        CheckConstraint(
            "(void_idempotency_key IS NULL) = (void_request_fingerprint IS NULL)",
            name="void_idempotency_pair",
        ),
        CheckConstraint(
            "char_length(creation_idempotency_key) >= 8", name="idempotency_key_length"
        ),
        CheckConstraint("char_length(request_fingerprint) = 64", name="fingerprint_length"),
        Index(
            "uq_sales_workspace_quote",
            "workspace_id",
            "quote_id",
            unique=True,
            postgresql_where=text("quote_id IS NOT NULL"),
        ),
        Index(
            "uq_sales_workspace_inventory_movement",
            "workspace_id",
            "inventory_movement_id",
            unique=True,
            postgresql_where=text("inventory_movement_id IS NOT NULL"),
        ),
        Index(
            "uq_sales_workspace_void_idempotency",
            "workspace_id",
            "void_idempotency_key",
            unique=True,
            postgresql_where=text("void_idempotency_key IS NOT NULL"),
        ),
        Index(
            "ix_sales_workspace_branch_completed",
            "workspace_id",
            "branch_id",
            "completed_at",
        ),
        Index(
            "ix_sales_workspace_customer_completed",
            "workspace_id",
            "customer_id",
            "completed_at",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    customer_id: Mapped[UUID | None] = mapped_column(nullable=True)
    cash_register_id: Mapped[UUID] = mapped_column(nullable=False)
    quote_id: Mapped[UUID | None] = mapped_column(nullable=True)
    inventory_movement_id: Mapped[UUID | None] = mapped_column(nullable=True)
    sale_number: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="completed", server_default=text("'completed'")
    )
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(200))
    customer_phone: Mapped[str | None] = mapped_column(String(40))
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    discount_mode: Mapped[str] = mapped_column(String(16), nullable=False)
    discount_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_method_id: Mapped[UUID] = mapped_column(nullable=False)
    payment_method_code: Mapped[str] = mapped_column(String(48), nullable=False)
    payment_method_name: Mapped[str] = mapped_column(String(120), nullable=False)
    payment_channel: Mapped[str] = mapped_column(String(24), nullable=False)
    settlement_policy: Mapped[str] = mapped_column(String(24), nullable=False)
    affects_cash_drawer: Mapped[bool] = mapped_column(Boolean, nullable=False)
    requires_evidence: Mapped[bool] = mapped_column(Boolean, nullable=False)
    payment_reference: Mapped[str | None] = mapped_column(String(160))
    notes: Mapped[str | None] = mapped_column(String(1000))
    sold_by_membership_id: Mapped[UUID] = mapped_column(nullable=False)
    sold_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    sold_by_name: Mapped[str] = mapped_column(String(200), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_by_platform_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT")
    )
    void_reason: Mapped[str | None] = mapped_column(String(1000))
    creation_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    void_idempotency_key: Mapped[str | None] = mapped_column(String(128))
    void_request_fingerprint: Mapped[str | None] = mapped_column(String(64))


class SaleLine(UuidPrimaryKeyMixin, Base):
    __tablename__ = "sale_lines"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_sale_lines_workspace_id"),
        UniqueConstraint("workspace_id", "sale_id", "position", name="uq_sale_lines_position"),
        ForeignKeyConstraint(
            ["workspace_id", "sale_id"],
            ["sales.workspace_id", "sales.id"],
            ondelete="RESTRICT",
            name="fk_sale_lines_workspace_sale",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "item_id"],
            ["items.workspace_id", "items.id"],
            ondelete="RESTRICT",
            name="fk_sale_lines_workspace_item",
        ),
        CheckConstraint("position >= 1", name="position_positive"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("list_price >= 0", name="list_price_non_negative"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        CheckConstraint(
            "unit_cost_snapshot IS NULL OR unit_cost_snapshot >= 0",
            name="unit_cost_snapshot_non_negative",
        ),
        CheckConstraint("discount_amount >= 0", name="discount_amount_non_negative"),
        CheckConstraint("tax_rate >= 0 AND tax_rate <= 100", name="tax_rate_range"),
        CheckConstraint("tax_amount >= 0", name="tax_amount_non_negative"),
        CheckConstraint("line_total >= 0", name="line_total_non_negative"),
        Index("ix_sale_lines_workspace_sale", "workspace_id", "sale_id"),
        Index("ix_sale_lines_workspace_item", "workspace_id", "item_id"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    sale_id: Mapped[UUID] = mapped_column(nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    item_id: Mapped[UUID | None] = mapped_column(nullable=True)
    item_name: Mapped[str] = mapped_column(String(160), nullable=False)
    item_sku: Mapped[str | None] = mapped_column(String(64))
    item_type: Mapped[str] = mapped_column(String(24), nullable=False)
    unit_symbol: Mapped[str] = mapped_column(String(16), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    list_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    unit_cost_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)


class CustomerReceivable(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    """Customer balance sourced by exactly one sale or appointment."""

    __tablename__ = "customer_receivables"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_customer_receivables_workspace_id"),
        UniqueConstraint(
            "workspace_id",
            "branch_id",
            "id",
            name="uq_customer_receivables_workspace_branch_id",
        ),
        UniqueConstraint(
            "workspace_id",
            "receivable_number",
            name="uq_customer_receivables_workspace_number",
        ),
        UniqueConstraint(
            "workspace_id",
            "creation_idempotency_key",
            name="uq_customer_receivables_workspace_idempotency",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_customer_receivables_workspace_branch",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            ondelete="RESTRICT",
            name="fk_customer_receivables_workspace_customer",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "sale_id"],
            ["sales.workspace_id", "sales.id"],
            ondelete="RESTRICT",
            name="fk_customer_receivables_workspace_sale",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "appointment_id"],
            ["appointments.workspace_id", "appointments.id"],
            ondelete="RESTRICT",
            name="fk_customer_receivables_workspace_appointment",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "payment_method_id"],
            ["payment_methods.workspace_id", "payment_methods.id"],
            ondelete="RESTRICT",
            name="fk_customer_receivables_workspace_payment_method",
        ),
        CheckConstraint("source IN ('sale', 'appointment')", name="source_values"),
        CheckConstraint(
            "(source = 'sale' AND sale_id IS NOT NULL AND appointment_id IS NULL) OR "
            "(source = 'appointment' AND appointment_id IS NOT NULL AND sale_id IS NULL)",
            name="source_reference_consistent",
        ),
        CheckConstraint(
            "source <> 'sale' OR payment_method_id IS NOT NULL",
            name="sale_payment_snapshot_required",
        ),
        CheckConstraint(
            "status IN ('pending', 'partial', 'paid', 'cancelled')", name="status_values"
        ),
        CheckConstraint("char_length(currency_code) = 3", name="currency_code_length"),
        CheckConstraint("currency_code = upper(currency_code)", name="currency_code_uppercase"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("paid_amount >= 0", name="paid_amount_non_negative"),
        CheckConstraint("paid_amount <= amount", name="paid_amount_within_amount"),
        CheckConstraint(
            "(status = 'pending' AND paid_amount = 0 AND paid_at IS NULL AND "
            "cancelled_at IS NULL) OR "
            "(status = 'partial' AND paid_amount > 0 AND paid_amount < amount AND "
            "paid_at IS NULL AND cancelled_at IS NULL) OR "
            "(status = 'paid' AND paid_amount = amount AND paid_at IS NOT NULL AND "
            "cancelled_at IS NULL) OR "
            "(status = 'cancelled' AND paid_amount = 0 AND paid_at IS NULL AND "
            "cancelled_at IS NOT NULL)",
            name="status_amount_consistent",
        ),
        CheckConstraint(
            "status <> 'cancelled' OR cancellation_reason IS NOT NULL",
            name="cancelled_reason_required",
        ),
        CheckConstraint(
            "(payment_method_id IS NULL AND payment_method_code IS NULL AND "
            "payment_method_name IS NULL AND payment_channel IS NULL AND "
            "settlement_policy IS NULL AND affects_cash_drawer IS NULL AND "
            "requires_evidence IS NULL) OR "
            "(payment_method_id IS NOT NULL AND payment_method_code IS NOT NULL AND "
            "payment_method_name IS NOT NULL AND payment_channel IS NOT NULL AND "
            "settlement_policy IS NOT NULL AND affects_cash_drawer IS NOT NULL AND "
            "requires_evidence IS NOT NULL)",
            name="payment_snapshot_consistent",
        ),
        CheckConstraint(
            "char_length(creation_idempotency_key) >= 8", name="idempotency_key_length"
        ),
        CheckConstraint("char_length(request_fingerprint) = 64", name="fingerprint_length"),
        Index(
            "uq_customer_receivables_workspace_sale",
            "workspace_id",
            "sale_id",
            unique=True,
            postgresql_where=text("sale_id IS NOT NULL"),
        ),
        Index(
            "uq_customer_receivables_workspace_appointment",
            "workspace_id",
            "appointment_id",
            unique=True,
            postgresql_where=text("appointment_id IS NOT NULL"),
        ),
        Index(
            "ix_customer_receivables_workspace_branch_status_due",
            "workspace_id",
            "branch_id",
            "status",
            "due_date",
        ),
        Index(
            "ix_customer_receivables_workspace_customer_status_due",
            "workspace_id",
            "customer_id",
            "status",
            "due_date",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    customer_id: Mapped[UUID] = mapped_column(nullable=False)
    receivable_number: Mapped[str] = mapped_column(String(32), nullable=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    sale_id: Mapped[UUID | None] = mapped_column(nullable=True)
    appointment_id: Mapped[UUID | None] = mapped_column(nullable=True)
    payment_method_id: Mapped[UUID | None] = mapped_column(nullable=True)
    payment_method_code: Mapped[str | None] = mapped_column(String(48))
    payment_method_name: Mapped[str | None] = mapped_column(String(120))
    payment_channel: Mapped[str | None] = mapped_column(String(24))
    settlement_policy: Mapped[str | None] = mapped_column(String(24))
    affects_cash_drawer: Mapped[bool | None] = mapped_column(Boolean)
    requires_evidence: Mapped[bool | None] = mapped_column(Boolean)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    customer_phone: Mapped[str | None] = mapped_column(String(40))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", server_default=text("'pending'")
    )
    reference: Mapped[str | None] = mapped_column(String(160))
    notes: Mapped[str | None] = mapped_column(String(1000))
    due_date: Mapped[date | None] = mapped_column(Date)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(String(1000))
    creation_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class CustomerReceivableLine(UuidPrimaryKeyMixin, Base):
    __tablename__ = "customer_receivable_lines"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_customer_receivable_lines_workspace_id"),
        UniqueConstraint(
            "workspace_id",
            "receivable_id",
            "position",
            name="uq_customer_receivable_lines_position",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "receivable_id"],
            ["customer_receivables.workspace_id", "customer_receivables.id"],
            ondelete="RESTRICT",
            name="fk_customer_receivable_lines_workspace_receivable",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "sale_line_id"],
            ["sale_lines.workspace_id", "sale_lines.id"],
            ondelete="RESTRICT",
            name="fk_customer_receivable_lines_workspace_sale_line",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "item_id"],
            ["items.workspace_id", "items.id"],
            ondelete="RESTRICT",
            name="fk_customer_receivable_lines_workspace_item",
        ),
        CheckConstraint("position >= 1", name="position_positive"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        CheckConstraint("line_total >= 0", name="line_total_non_negative"),
        Index(
            "ix_customer_receivable_lines_workspace_receivable",
            "workspace_id",
            "receivable_id",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    receivable_id: Mapped[UUID] = mapped_column(nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    sale_line_id: Mapped[UUID | None] = mapped_column(nullable=True)
    item_id: Mapped[UUID | None] = mapped_column(nullable=True)
    item_name: Mapped[str] = mapped_column(String(160), nullable=False)
    item_sku: Mapped[str | None] = mapped_column(String(64))
    unit_symbol: Mapped[str] = mapped_column(String(16), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)


class CustomerPayment(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    """Append-oriented receivable payment with an explicit reversal lifecycle."""

    __tablename__ = "customer_payments"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_customer_payments_workspace_id"),
        UniqueConstraint(
            "workspace_id", "branch_id", "id", name="uq_customer_payments_workspace_branch_id"
        ),
        UniqueConstraint(
            "workspace_id", "idempotency_key", name="uq_customer_payments_idempotency"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_customer_payments_workspace_branch",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "receivable_id"],
            [
                "customer_receivables.workspace_id",
                "customer_receivables.branch_id",
                "customer_receivables.id",
            ],
            ondelete="RESTRICT",
            name="fk_customer_payments_workspace_receivable",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "cash_register_id"],
            ["cash_registers.workspace_id", "cash_registers.branch_id", "cash_registers.id"],
            ondelete="RESTRICT",
            name="fk_customer_payments_workspace_register",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "payment_method_id"],
            ["payment_methods.workspace_id", "payment_methods.id"],
            ondelete="RESTRICT",
            name="fk_customer_payments_workspace_payment_method",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "received_by_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_customer_payments_workspace_receiver_membership",
        ),
        CheckConstraint("status IN ('posted', 'reversed')", name="status_values"),
        CheckConstraint("char_length(currency_code) = 3", name="currency_code_length"),
        CheckConstraint("currency_code = upper(currency_code)", name="currency_code_uppercase"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint(
            "NOT affects_cash_drawer OR cash_register_id IS NOT NULL",
            name="cash_payment_requires_register",
        ),
        CheckConstraint(
            "(status = 'posted' AND reversed_at IS NULL AND "
            "reversed_by_platform_user_id IS NULL AND reversal_reason IS NULL) OR "
            "(status = 'reversed' AND reversed_at IS NOT NULL AND "
            "reversed_by_platform_user_id IS NOT NULL AND reversal_reason IS NOT NULL)",
            name="reversal_state_consistent",
        ),
        CheckConstraint(
            "(reversal_idempotency_key IS NULL) = (reversal_request_fingerprint IS NULL)",
            name="reversal_idempotency_pair",
        ),
        CheckConstraint("char_length(idempotency_key) >= 8", name="idempotency_key_length"),
        CheckConstraint("char_length(request_fingerprint) = 64", name="fingerprint_length"),
        Index(
            "uq_customer_payments_reversal_idempotency",
            "workspace_id",
            "reversal_idempotency_key",
            unique=True,
            postgresql_where=text("reversal_idempotency_key IS NOT NULL"),
        ),
        Index(
            "ix_customer_payments_workspace_receivable_posted",
            "workspace_id",
            "receivable_id",
            "posted_at",
        ),
        Index(
            "ix_customer_payments_workspace_branch_posted",
            "workspace_id",
            "branch_id",
            "posted_at",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    receivable_id: Mapped[UUID] = mapped_column(nullable=False)
    payment_method_id: Mapped[UUID] = mapped_column(nullable=False)
    cash_register_id: Mapped[UUID | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="posted", server_default=text("'posted'")
    )
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_method_code: Mapped[str] = mapped_column(String(48), nullable=False)
    payment_method_name: Mapped[str] = mapped_column(String(120), nullable=False)
    payment_channel: Mapped[str] = mapped_column(String(24), nullable=False)
    settlement_policy: Mapped[str] = mapped_column(String(24), nullable=False)
    affects_cash_drawer: Mapped[bool] = mapped_column(Boolean, nullable=False)
    requires_evidence: Mapped[bool] = mapped_column(Boolean, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(160))
    note: Mapped[str | None] = mapped_column(String(1000))
    received_by_membership_id: Mapped[UUID] = mapped_column(nullable=False)
    received_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    received_by_name: Mapped[str] = mapped_column(String(200), nullable=False)
    posted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reversed_by_platform_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT")
    )
    reversal_reason: Mapped[str | None] = mapped_column(String(1000))
    reversal_idempotency_key: Mapped[str | None] = mapped_column(String(128))
    reversal_request_fingerprint: Mapped[str | None] = mapped_column(String(64))


class PaymentProof(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Evidence owned by exactly one receivable or posted payment."""

    __tablename__ = "payment_proofs"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_payment_proofs_workspace_id"),
        UniqueConstraint("workspace_id", "storage_key", name="uq_payment_proofs_storage_key"),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_payment_proofs_workspace_branch",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "receivable_id"],
            [
                "customer_receivables.workspace_id",
                "customer_receivables.branch_id",
                "customer_receivables.id",
            ],
            ondelete="RESTRICT",
            name="fk_payment_proofs_workspace_receivable",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "customer_payment_id"],
            [
                "customer_payments.workspace_id",
                "customer_payments.branch_id",
                "customer_payments.id",
            ],
            ondelete="RESTRICT",
            name="fk_payment_proofs_workspace_payment",
        ),
        CheckConstraint(
            "(receivable_id IS NOT NULL AND customer_payment_id IS NULL) OR "
            "(receivable_id IS NULL AND customer_payment_id IS NOT NULL)",
            name="single_owner",
        ),
        CheckConstraint("size_bytes > 0 AND size_bytes <= 10485760", name="size_bytes_range"),
        CheckConstraint("char_length(checksum_sha256) = 64", name="checksum_length"),
        CheckConstraint(
            "content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')",
            name="content_type_values",
        ),
        Index(
            "uq_payment_proofs_receivable_checksum",
            "workspace_id",
            "receivable_id",
            "checksum_sha256",
            unique=True,
            postgresql_where=text("receivable_id IS NOT NULL"),
        ),
        Index(
            "ix_payment_proofs_workspace_receivable",
            "workspace_id",
            "receivable_id",
        ),
        Index(
            "ix_payment_proofs_workspace_payment",
            "workspace_id",
            "customer_payment_id",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    receivable_id: Mapped[UUID | None] = mapped_column(nullable=True)
    customer_payment_id: Mapped[UUID | None] = mapped_column(nullable=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    uploaded_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
