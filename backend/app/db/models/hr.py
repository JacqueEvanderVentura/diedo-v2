from datetime import date, datetime
from decimal import Decimal
from typing import Any
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
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin, VersionMixin


class EmployeeHrProfile(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "employee_hr_profiles"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_employee_hr_profiles_workspace_employee",
        ),
        UniqueConstraint("workspace_id", "employee_id", name="uq_employee_hr_profiles_employee"),
        CheckConstraint("initial_salary >= 0 AND current_salary >= 0", name="salary_non_negative"),
        CheckConstraint("vacation_days >= 0 AND vacation_days <= 365", name="vacation_days_range"),
        CheckConstraint(
            "bank_account_type IS NULL OR bank_account_type IN ('ahorro', 'corriente')",
            name="bank_account_type_values",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    employee_id: Mapped[UUID] = mapped_column(nullable=False)
    initial_salary: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    current_salary: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    vacation_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    bank_name: Mapped[str | None] = mapped_column(String(120))
    bank_account_type: Mapped[str | None] = mapped_column(String(16))
    bank_account_number: Mapped[str | None] = mapped_column(String(128))
    bank_document: Mapped[str | None] = mapped_column(String(64))
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class HrLeaveRequest(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "hr_leave_requests"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_hr_leave_requests_workspace_id"),
        ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_hr_leave_requests_workspace_employee",
        ),
        CheckConstraint("end_date >= start_date", name="date_order"),
        CheckConstraint(
            "status IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')",
            name="status_values",
        ),
        CheckConstraint(
            "(status IN ('aprobada', 'rechazada') AND reviewed_at IS NOT NULL "
            "AND reviewed_by_platform_user_id IS NOT NULL) OR "
            "(status IN ('pendiente', 'cancelada') AND reviewed_at IS NULL "
            "AND reviewed_by_platform_user_id IS NULL)",
            name="review_metadata",
        ),
        Index(
            "ix_hr_leave_requests_workspace_status_created",
            "workspace_id",
            "status",
            "created_at",
        ),
        Index(
            "ix_hr_leave_requests_employee_dates",
            "workspace_id",
            "employee_id",
            "start_date",
            "end_date",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    employee_id: Mapped[UUID] = mapped_column(nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pendiente", server_default=text("'pendiente'")
    )
    requested_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    reviewed_by_platform_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EmployeeDebt(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "employee_debts"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_employee_debts_workspace_id"),
        UniqueConstraint(
            "workspace_id", "idempotency_key", name="uq_employee_debts_idempotency_key"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_employee_debts_workspace_employee",
        ),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("char_length(currency_code) = 3", name="currency_code_length"),
        Index(
            "ix_employee_debts_workspace_employee_created",
            "workspace_id",
            "employee_id",
            "created_at",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    employee_id: Mapped[UUID] = mapped_column(nullable=False)
    concept: Mapped[str] = mapped_column(String(240), nullable=False)
    client_name: Mapped[str | None] = mapped_column(String(200))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency_code: Mapped[str] = mapped_column(
        String(3), nullable=False, default="DOP", server_default=text("'DOP'")
    )
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class EmployeeDebtPayment(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "employee_debt_payments"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "idempotency_key", name="uq_employee_debt_payments_idempotency_key"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "debt_id"],
            ["employee_debts.workspace_id", "employee_debts.id"],
            ondelete="RESTRICT",
            name="fk_employee_debt_payments_workspace_debt",
        ),
        CheckConstraint("amount > 0", name="amount_positive"),
        Index(
            "ix_employee_debt_payments_debt_created",
            "workspace_id",
            "debt_id",
            "created_at",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    debt_id: Mapped[UUID] = mapped_column(nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    received_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class HrDocumentRecord(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "hr_document_records"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_hr_document_records_workspace_id"),
        UniqueConstraint(
            "workspace_id", "reference_code", name="uq_hr_document_records_reference_code"
        ),
        UniqueConstraint(
            "workspace_id", "idempotency_key", name="uq_hr_document_records_idempotency_key"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_hr_document_records_workspace_employee",
        ),
        CheckConstraint(
            "template_id IN ('certificado', 'bancaria', 'recomendacion', 'vacaciones')",
            name="template_values",
        ),
        CheckConstraint(
            "NOT include_salary OR template_id = 'bancaria'",
            name="salary_only_for_bank_letter",
        ),
        CheckConstraint("jsonb_typeof(snapshot) = 'object'", name="snapshot_object"),
        Index(
            "ix_hr_document_records_workspace_created",
            "workspace_id",
            "created_at",
        ),
        Index(
            "ix_hr_document_records_employee_created",
            "workspace_id",
            "employee_id",
            "created_at",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    employee_id: Mapped[UUID] = mapped_column(nullable=False)
    template_id: Mapped[str] = mapped_column(String(24), nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    include_salary: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    reference_code: Mapped[str] = mapped_column(String(64), nullable=False)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
