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


class CarwashCommission(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "carwash_commissions"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "wash_line_id", "role", name="uq_carwash_commissions_line_role"
        ),
        UniqueConstraint("workspace_id", "branch_id", "id", name="uq_carwash_commissions_scope_id"),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "wash_id", "wash_line_id"],
            [
                "carwash_wash_lines.workspace_id",
                "carwash_wash_lines.branch_id",
                "carwash_wash_lines.wash_id",
                "carwash_wash_lines.id",
            ],
            name="fk_carwash_commissions_line",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "employee_id", "branch_id"],
            [
                "employee_branch_assignments.workspace_id",
                "employee_branch_assignments.employee_id",
                "employee_branch_assignments.branch_id",
            ],
            name="fk_carwash_commissions_employee",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "sale_line_id"],
            ["sale_lines.workspace_id", "sale_lines.id"],
            name="fk_carwash_commissions_sale_line",
            ondelete="RESTRICT",
        ),
        CheckConstraint("role IN ('washer', 'supervisor')", name="role_values"),
        CheckConstraint("status IN ('pending', 'settled', 'voided')", name="status_values"),
        CheckConstraint(
            "base_amount >= 0 AND rate BETWEEN 0 AND 100 "
            "AND amount = round(base_amount * rate / 100, 2)",
            name="amount_valid",
        ),
        CheckConstraint(
            "(status = 'voided') = (voided_at IS NOT NULL AND void_reason IS NOT NULL)",
            name="void_consistent",
        ),
        Index(
            "ix_carwash_commissions_branch_employee_status",
            "workspace_id",
            "branch_id",
            "employee_id",
            "status",
        ),
    )
    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    wash_id: Mapped[UUID] = mapped_column(nullable=False)
    wash_line_id: Mapped[UUID] = mapped_column(nullable=False)
    sale_line_id: Mapped[UUID] = mapped_column(nullable=False)
    employee_id: Mapped[UUID] = mapped_column(nullable=False)
    employee_name: Mapped[str] = mapped_column(String(201), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    base_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", server_default=text("'pending'")
    )
    accrued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    void_reason: Mapped[str | None] = mapped_column(String(1000))
