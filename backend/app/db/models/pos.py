"""Persistence models for POS cash registers and append-only drawer movements."""

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
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin, VersionMixin


class CashRegister(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    """A branch cash session; at most one session can be open per branch."""

    __tablename__ = "cash_registers"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_cash_registers_workspace_id"),
        UniqueConstraint(
            "workspace_id", "branch_id", "id", name="uq_cash_registers_workspace_branch_id"
        ),
        UniqueConstraint(
            "workspace_id",
            "open_idempotency_key",
            name="uq_cash_registers_open_idempotency",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_cash_registers_workspace_branch",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "opened_by_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_cash_registers_workspace_opener_membership",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "closed_by_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_cash_registers_workspace_closer_membership",
        ),
        CheckConstraint("status IN ('open', 'closed')", name="status_values"),
        CheckConstraint("char_length(currency_code) = 3", name="currency_code_length"),
        CheckConstraint("currency_code = upper(currency_code)", name="currency_code_uppercase"),
        CheckConstraint("opening_cash >= 0", name="opening_cash_non_negative"),
        CheckConstraint("cash_sales_amount >= 0", name="cash_sales_amount_non_negative"),
        CheckConstraint(
            "receivable_payments_amount >= 0", name="receivable_payments_amount_non_negative"
        ),
        CheckConstraint("cash_income_amount >= 0", name="cash_income_amount_non_negative"),
        CheckConstraint("cash_expense_amount >= 0", name="cash_expense_amount_non_negative"),
        CheckConstraint(
            "(status = 'open' AND closed_at IS NULL AND closed_by_membership_id IS NULL "
            "AND closed_by_platform_user_id IS NULL AND closed_by_name IS NULL "
            "AND expected_cash IS NULL AND actual_cash IS NULL AND difference IS NULL "
            "AND close_idempotency_key IS NULL AND close_request_fingerprint IS NULL) OR "
            "(status = 'closed' AND closed_at IS NOT NULL AND "
            "closed_by_membership_id IS NOT NULL AND closed_by_platform_user_id IS NOT NULL "
            "AND closed_by_name IS NOT NULL AND expected_cash IS NOT NULL "
            "AND actual_cash IS NOT NULL AND difference IS NOT NULL "
            "AND close_idempotency_key IS NOT NULL AND close_request_fingerprint IS NOT NULL)",
            name="close_state_consistent",
        ),
        CheckConstraint(
            "expected_cash IS NULL OR expected_cash = opening_cash + cash_sales_amount + "
            "receivable_payments_amount + cash_income_amount - cash_expense_amount",
            name="expected_cash_reconciles",
        ),
        CheckConstraint(
            "difference IS NULL OR difference = actual_cash - expected_cash",
            name="difference_reconciles",
        ),
        CheckConstraint(
            "char_length(open_idempotency_key) >= 8", name="open_idempotency_key_length"
        ),
        CheckConstraint(
            "char_length(open_request_fingerprint) = 64", name="open_fingerprint_length"
        ),
        Index(
            "uq_cash_registers_open_branch",
            "workspace_id",
            "branch_id",
            unique=True,
            postgresql_where=text("status = 'open'"),
        ),
        Index(
            "uq_cash_registers_close_idempotency",
            "workspace_id",
            "close_idempotency_key",
            unique=True,
            postgresql_where=text("close_idempotency_key IS NOT NULL"),
        ),
        Index(
            "ix_cash_registers_workspace_branch_opened",
            "workspace_id",
            "branch_id",
            "opened_at",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="open", server_default=text("'open'")
    )
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    opening_cash: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    cash_sales_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    receivable_payments_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    cash_income_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    cash_expense_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    expected_cash: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    actual_cash: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    difference: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    notes: Mapped[str | None] = mapped_column(String(1000))
    opened_by_membership_id: Mapped[UUID] = mapped_column(nullable=False)
    opened_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    opened_by_name: Mapped[str] = mapped_column(String(200), nullable=False)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    closed_by_membership_id: Mapped[UUID | None] = mapped_column(nullable=True)
    closed_by_platform_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT")
    )
    closed_by_name: Mapped[str | None] = mapped_column(String(200))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    open_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    open_request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    close_idempotency_key: Mapped[str | None] = mapped_column(String(128))
    close_request_fingerprint: Mapped[str | None] = mapped_column(String(64))


class CashMovement(UuidPrimaryKeyMixin, Base):
    """Append-only event carrying the signed effect on a cash drawer."""

    __tablename__ = "cash_movements"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_cash_movements_workspace_id"),
        UniqueConstraint("workspace_id", "idempotency_key", name="uq_cash_movements_idempotency"),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_cash_movements_workspace_branch",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "cash_register_id"],
            ["cash_registers.workspace_id", "cash_registers.branch_id", "cash_registers.id"],
            ondelete="RESTRICT",
            name="fk_cash_movements_workspace_register",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "sale_id"],
            ["sales.workspace_id", "sales.branch_id", "sales.id"],
            ondelete="RESTRICT",
            name="fk_cash_movements_workspace_sale",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "customer_payment_id"],
            [
                "customer_payments.workspace_id",
                "customer_payments.branch_id",
                "customer_payments.id",
            ],
            ondelete="RESTRICT",
            name="fk_cash_movements_workspace_customer_payment",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "reversal_of_movement_id"],
            ["cash_movements.workspace_id", "cash_movements.id"],
            ondelete="RESTRICT",
            name="fk_cash_movements_workspace_reversal_of",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "inventory_movement_id"],
            ["inventory_movements.workspace_id", "inventory_movements.id"],
            ondelete="RESTRICT",
            name="fk_cash_movements_workspace_inventory_movement",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "payment_method_id"],
            ["payment_methods.workspace_id", "payment_methods.id"],
            ondelete="RESTRICT",
            name="fk_cash_movements_workspace_payment_method",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "created_by_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_cash_movements_workspace_creator_membership",
        ),
        CheckConstraint(
            "movement_type IN ('sale', 'receivable_payment', 'income', 'expense', 'reversal')",
            name="movement_type_values",
        ),
        CheckConstraint("char_length(currency_code) = 3", name="currency_code_length"),
        CheckConstraint("currency_code = upper(currency_code)", name="currency_code_uppercase"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("cash_delta <> 0", name="cash_delta_non_zero"),
        CheckConstraint("amount = abs(cash_delta)", name="amount_matches_cash_delta"),
        CheckConstraint(
            "(movement_type = 'sale' AND sale_id IS NOT NULL AND "
            "customer_payment_id IS NULL AND reversal_of_movement_id IS NULL) OR "
            "(movement_type = 'receivable_payment' AND customer_payment_id IS NOT NULL "
            "AND sale_id IS NULL AND reversal_of_movement_id IS NULL) OR "
            "(movement_type IN ('income', 'expense') AND sale_id IS NULL AND "
            "customer_payment_id IS NULL AND reversal_of_movement_id IS NULL) OR "
            "(movement_type = 'reversal' AND reversal_of_movement_id IS NOT NULL "
            "AND sale_id IS NULL AND customer_payment_id IS NULL)",
            name="source_reference_consistent",
        ),
        CheckConstraint(
            "(movement_type IN ('sale', 'receivable_payment') AND "
            "payment_method_id IS NOT NULL AND payment_method_code IS NOT NULL "
            "AND payment_method_name IS NOT NULL AND payment_channel IS NOT NULL "
            "AND settlement_policy IS NOT NULL AND affects_cash_drawer IS NOT NULL "
            "AND requires_evidence IS NOT NULL) OR "
            "(movement_type NOT IN ('sale', 'receivable_payment'))",
            name="payment_snapshot_required",
        ),
        CheckConstraint(
            "(movement_type IN ('sale', 'receivable_payment', 'income') AND cash_delta > 0) OR "
            "(movement_type = 'expense' AND cash_delta < 0) OR movement_type = 'reversal'",
            name="cash_delta_direction",
        ),
        CheckConstraint("char_length(idempotency_key) >= 8", name="idempotency_key_length"),
        CheckConstraint("char_length(request_fingerprint) = 64", name="fingerprint_length"),
        Index(
            "uq_cash_movements_workspace_sale",
            "workspace_id",
            "sale_id",
            unique=True,
            postgresql_where=text("sale_id IS NOT NULL"),
        ),
        Index(
            "uq_cash_movements_workspace_customer_payment",
            "workspace_id",
            "customer_payment_id",
            unique=True,
            postgresql_where=text("customer_payment_id IS NOT NULL"),
        ),
        Index(
            "uq_cash_movements_workspace_reversal_of",
            "workspace_id",
            "reversal_of_movement_id",
            unique=True,
            postgresql_where=text("reversal_of_movement_id IS NOT NULL"),
        ),
        Index(
            "ix_cash_movements_workspace_register_created",
            "workspace_id",
            "cash_register_id",
            "created_at",
        ),
        Index(
            "ix_cash_movements_workspace_branch_type_created",
            "workspace_id",
            "branch_id",
            "movement_type",
            "created_at",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    cash_register_id: Mapped[UUID] = mapped_column(nullable=False)
    movement_type: Mapped[str] = mapped_column(String(24), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    cash_delta: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_method_id: Mapped[UUID | None] = mapped_column(nullable=True)
    payment_method_code: Mapped[str | None] = mapped_column(String(48))
    payment_method_name: Mapped[str | None] = mapped_column(String(120))
    payment_channel: Mapped[str | None] = mapped_column(String(24))
    settlement_policy: Mapped[str | None] = mapped_column(String(24))
    affects_cash_drawer: Mapped[bool | None] = mapped_column(Boolean)
    requires_evidence: Mapped[bool | None] = mapped_column(Boolean)
    sale_id: Mapped[UUID | None] = mapped_column(nullable=True)
    customer_payment_id: Mapped[UUID | None] = mapped_column(nullable=True)
    reversal_of_movement_id: Mapped[UUID | None] = mapped_column(nullable=True)
    inventory_movement_id: Mapped[UUID | None] = mapped_column(nullable=True)
    concept: Mapped[str] = mapped_column(String(240), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(160))
    notes: Mapped[str | None] = mapped_column(String(1000))
    created_by_membership_id: Mapped[UUID] = mapped_column(nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    created_by_name: Mapped[str] = mapped_column(String(200), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class CashMovementLine(UuidPrimaryKeyMixin, Base):
    """Optional expense/income detail retained as immutable snapshots."""

    __tablename__ = "cash_movement_lines"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_cash_movement_lines_workspace_id"),
        UniqueConstraint(
            "workspace_id",
            "cash_movement_id",
            "position",
            name="uq_cash_movement_lines_position",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "cash_movement_id"],
            ["cash_movements.workspace_id", "cash_movements.id"],
            ondelete="RESTRICT",
            name="fk_cash_movement_lines_workspace_movement",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "item_id"],
            ["items.workspace_id", "items.id"],
            ondelete="RESTRICT",
            name="fk_cash_movement_lines_workspace_item",
        ),
        CheckConstraint("position >= 1", name="position_positive"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_amount >= 0", name="unit_amount_non_negative"),
        CheckConstraint("line_total >= 0", name="line_total_non_negative"),
        Index(
            "ix_cash_movement_lines_workspace_movement",
            "workspace_id",
            "cash_movement_id",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    cash_movement_id: Mapped[UUID] = mapped_column(nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    item_id: Mapped[UUID | None] = mapped_column(nullable=True)
    item_name: Mapped[str] = mapped_column(String(160), nullable=False)
    item_sku: Mapped[str | None] = mapped_column(String(64))
    unit_symbol: Mapped[str] = mapped_column(String(16), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
