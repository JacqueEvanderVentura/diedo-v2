from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
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


class CarwashSettlement(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "carwash_settlements"
    __table_args__ = (
        UniqueConstraint("workspace_id", "branch_id", "id", name="uq_carwash_settlements_scope"),
        UniqueConstraint("workspace_id", "idempotency_key", name="uq_carwash_settlements_key"),
        UniqueConstraint("workspace_id", "reversal_key", name="uq_carwash_settlements_reverse_key"),
        UniqueConstraint("workspace_id", "movement_id", name="uq_carwash_settlements_movement"),
        UniqueConstraint(
            "workspace_id", "reversal_movement_id", name="uq_carwash_settlements_reversal"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "employee_id", "branch_id"],
            [
                "employee_branch_assignments.workspace_id",
                "employee_branch_assignments.employee_id",
                "employee_branch_assignments.branch_id",
            ],
            ondelete="RESTRICT",
            name="fk_carwash_settlements_employee",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "register_id"],
            ["cash_registers.workspace_id", "cash_registers.branch_id", "cash_registers.id"],
            ondelete="RESTRICT",
            name="fk_carwash_settlements_register",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "movement_id"],
            ["cash_movements.workspace_id", "cash_movements.branch_id", "cash_movements.id"],
            ondelete="RESTRICT",
            name="fk_carwash_settlements_movement",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "reversal_movement_id"],
            ["cash_movements.workspace_id", "cash_movements.branch_id", "cash_movements.id"],
            ondelete="RESTRICT",
            name="fk_carwash_settlements_reversal",
        ),
        CheckConstraint(
            "amount >= 0 AND (amount = 0) = (movement_id IS NULL)", name="movement_consistent"
        ),
        CheckConstraint("status IN ('posted', 'reversed')", name="status_values"),
        CheckConstraint(
            "(status = 'reversed') = (reversed_at IS NOT NULL AND reversal_reason IS NOT NULL "
            "AND reversal_key IS NOT NULL AND reversal_fingerprint IS NOT NULL)",
            name="reversal_consistent",
        ),
        CheckConstraint(
            "(status = 'reversed' AND amount > 0) = (reversal_movement_id IS NOT NULL)",
            name="reversal_movement_consistent",
        ),
        Index("ix_carwash_settlements_branch_created", "workspace_id", "branch_id", "created_at"),
    )
    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    employee_id: Mapped[UUID] = mapped_column(nullable=False)
    employee_name: Mapped[str] = mapped_column(String(201), nullable=False)
    register_id: Mapped[UUID] = mapped_column(nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="posted", server_default=text("'posted'")
    )
    movement_id: Mapped[UUID | None] = mapped_column()
    reversal_movement_id: Mapped[UUID | None] = mapped_column()
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    reversal_key: Mapped[str | None] = mapped_column(String(128))
    reversal_fingerprint: Mapped[str | None] = mapped_column(String(64))
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reversal_reason: Mapped[str | None] = mapped_column(String(1000))


class CarwashSettlementDetail(UuidPrimaryKeyMixin, Base):
    __tablename__ = "carwash_settlement_details"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "settlement_id"],
            [
                "carwash_settlements.workspace_id",
                "carwash_settlements.branch_id",
                "carwash_settlements.id",
            ],
            ondelete="RESTRICT",
            name="fk_carwash_settlement_details_header",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "commission_id"],
            [
                "carwash_commissions.workspace_id",
                "carwash_commissions.branch_id",
                "carwash_commissions.id",
            ],
            ondelete="RESTRICT",
            name="fk_carwash_settlement_details_commission",
        ),
        UniqueConstraint(
            "settlement_id", "commission_id", name="uq_carwash_settlement_details_entry"
        ),
        Index(
            "uq_carwash_settlement_details_active",
            "workspace_id",
            "commission_id",
            unique=True,
            postgresql_where=text("reversed_at IS NULL"),
        ),
        CheckConstraint("amount >= 0", name="amount_non_negative"),
    )
    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    settlement_id: Mapped[UUID] = mapped_column(nullable=False)
    commission_id: Mapped[UUID] = mapped_column(nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
