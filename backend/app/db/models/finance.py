from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin, VersionMixin

_EXPENSE_CATEGORY_CHECK = (
    "category IN ('alquiler', 'servicios', 'nomina', 'insumos', "
    "'marketing', 'mantenimiento', 'otros')"
)


class FinanceBudget(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "finance_budgets"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_finance_budgets_workspace_id"),
        UniqueConstraint("workspace_id", "branch_id", "id", name="uq_finance_budgets_scope_id"),
        UniqueConstraint(
            "workspace_id",
            "branch_id",
            "normalized_name",
            name="uq_finance_budgets_scope_name",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_finance_budgets_workspace_branch",
        ),
        CheckConstraint(
            "budget_group IN ('marketing', 'operaciones', 'rh', 'it')",
            name="group_values",
        ),
        CheckConstraint("monthly_limit > 0", name="monthly_limit_positive"),
        CheckConstraint("status IN ('active', 'archived')", name="status_values"),
        Index(
            "ix_finance_budgets_workspace_branch_status",
            "workspace_id",
            "branch_id",
            "status",
        ),
        Index(
            "uq_finance_budgets_workspace_idempotency",
            "workspace_id",
            "creation_idempotency_key",
            unique=True,
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(160), nullable=False)
    budget_group: Mapped[str] = mapped_column(String(24), nullable=False)
    monthly_limit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )
    creation_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class FinanceExpense(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "finance_expenses"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_finance_expenses_workspace_id"),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_finance_expenses_workspace_branch",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "budget_id"],
            [
                "finance_budgets.workspace_id",
                "finance_budgets.branch_id",
                "finance_budgets.id",
            ],
            ondelete="RESTRICT",
            name="fk_finance_expenses_scope_budget",
        ),
        CheckConstraint(_EXPENSE_CATEGORY_CHECK, name="category_values"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("payment_status IN ('pagado', 'pendiente')", name="payment_status_values"),
        CheckConstraint("record_status IN ('active', 'voided')", name="record_status_values"),
        Index(
            "ix_finance_expenses_workspace_branch_date",
            "workspace_id",
            "branch_id",
            "expense_date",
        ),
        Index(
            "ix_finance_expenses_workspace_budget_date",
            "workspace_id",
            "budget_id",
            "expense_date",
        ),
        Index(
            "uq_finance_expenses_workspace_idempotency",
            "workspace_id",
            "creation_idempotency_key",
            unique=True,
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    concept: Mapped[str] = mapped_column(String(240), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    category: Mapped[str] = mapped_column(String(24), nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    payment_status: Mapped[str] = mapped_column(String(16), nullable=False)
    budget_id: Mapped[UUID | None] = mapped_column(nullable=True)
    record_status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_by_platform_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT")
    )
    creation_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class FinanceFixedExpense(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "finance_fixed_expenses"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_finance_fixed_expenses_workspace_id"),
        UniqueConstraint(
            "workspace_id",
            "branch_id",
            "id",
            name="uq_finance_fixed_expenses_scope_id",
        ),
        UniqueConstraint(
            "workspace_id",
            "branch_id",
            "normalized_concept",
            name="uq_finance_fixed_expenses_scope_concept",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_finance_fixed_expenses_workspace_branch",
        ),
        CheckConstraint(_EXPENSE_CATEGORY_CHECK, name="category_values"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("day_of_month BETWEEN 1 AND 31", name="day_of_month_range"),
        CheckConstraint("status IN ('active', 'archived')", name="status_values"),
        Index(
            "ix_finance_fixed_expenses_workspace_branch_status",
            "workspace_id",
            "branch_id",
            "status",
        ),
        Index(
            "uq_finance_fixed_expenses_workspace_idempotency",
            "workspace_id",
            "creation_idempotency_key",
            unique=True,
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    concept: Mapped[str] = mapped_column(String(240), nullable=False)
    normalized_concept: Mapped[str] = mapped_column(String(240), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    category: Mapped[str] = mapped_column(String(24), nullable=False)
    day_of_month: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )
    creation_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class FinanceFixedExpensePayment(UuidPrimaryKeyMixin, Base):
    __tablename__ = "finance_fixed_expense_payments"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "id", name="uq_finance_fixed_expense_payments_workspace_id"
        ),
        UniqueConstraint(
            "workspace_id",
            "fixed_expense_id",
            "period",
            name="uq_finance_fixed_expense_payments_period",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_finance_fixed_expense_payments_workspace_branch",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "fixed_expense_id"],
            [
                "finance_fixed_expenses.workspace_id",
                "finance_fixed_expenses.branch_id",
                "finance_fixed_expenses.id",
            ],
            ondelete="RESTRICT",
            name="fk_finance_fixed_expense_payments_workspace_expense",
        ),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("period = date_trunc('month', period)::date", name="period_first_day"),
        Index(
            "ix_finance_fixed_expense_payments_workspace_branch_period",
            "workspace_id",
            "branch_id",
            "period",
        ),
        Index(
            "uq_finance_fixed_expense_payments_workspace_idempotency",
            "workspace_id",
            "idempotency_key",
            unique=True,
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    fixed_expense_id: Mapped[UUID] = mapped_column(nullable=False)
    period: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class FinanceLiability(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "finance_liabilities"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_finance_liabilities_workspace_id"),
        UniqueConstraint(
            "workspace_id",
            "branch_id",
            "normalized_name",
            name="uq_finance_liabilities_scope_name",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_finance_liabilities_workspace_branch",
        ),
        CheckConstraint("liability_type IN ('prestamo', 'tarjeta')", name="type_values"),
        CheckConstraint("initial_amount > 0", name="initial_amount_positive"),
        CheckConstraint(
            "pending_amount >= 0 AND pending_amount <= initial_amount",
            name="pending_amount_range",
        ),
        CheckConstraint("pay_day BETWEEN 1 AND 31", name="pay_day_range"),
        CheckConstraint("cut_day IS NULL OR cut_day BETWEEN 1 AND 31", name="cut_day_range"),
        CheckConstraint("installment IS NULL OR installment > 0", name="installment_positive"),
        CheckConstraint("paid_installments >= 0", name="paid_installments_non_negative"),
        CheckConstraint(
            "total_installments IS NULL OR total_installments > 0",
            name="total_installments_positive",
        ),
        CheckConstraint(
            "total_installments IS NULL OR paid_installments <= total_installments",
            name="installment_progress_range",
        ),
        CheckConstraint(
            "(liability_type = 'prestamo' AND cut_day IS NULL) OR "
            "(liability_type = 'tarjeta' AND cut_day IS NOT NULL AND installment IS NULL "
            "AND total_installments IS NULL AND paid_installments = 0)",
            name="type_fields_consistent",
        ),
        CheckConstraint("status IN ('active', 'archived')", name="status_values"),
        Index(
            "ix_finance_liabilities_workspace_branch_status",
            "workspace_id",
            "branch_id",
            "status",
        ),
        Index(
            "uq_finance_liabilities_workspace_idempotency",
            "workspace_id",
            "creation_idempotency_key",
            unique=True,
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(200), nullable=False)
    liability_type: Mapped[str] = mapped_column(String(16), nullable=False)
    initial_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    pending_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    pay_day: Mapped[int] = mapped_column(Integer, nullable=False)
    cut_day: Mapped[int | None] = mapped_column(Integer)
    installment: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    paid_installments: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    total_installments: Mapped[int | None] = mapped_column(Integer)
    category_ids: Mapped[list[str]] = mapped_column(
        ARRAY(String(24)), nullable=False, default=list, server_default=text("'{}'")
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )
    creation_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class FinanceAccount(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "finance_accounts"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_finance_accounts_workspace_id"),
        UniqueConstraint(
            "workspace_id", "branch_id", "normalized_name", name="uq_finance_accounts_scope_name"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_finance_accounts_workspace_branch",
        ),
        CheckConstraint(
            "account_type IN ('banco', 'inversion', 'accionistas')", name="type_values"
        ),
        CheckConstraint("char_length(currency_code) = 3", name="currency_code_length"),
        CheckConstraint("currency_code = upper(currency_code)", name="currency_code_uppercase"),
        CheckConstraint("status IN ('active', 'archived')", name="status_values"),
        Index(
            "ix_finance_accounts_workspace_branch_status",
            "workspace_id",
            "branch_id",
            "status",
        ),
        Index(
            "uq_finance_accounts_workspace_idempotency",
            "workspace_id",
            "creation_idempotency_key",
            unique=True,
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(160), nullable=False)
    account_type: Mapped[str] = mapped_column(String(24), nullable=False)
    bank: Mapped[str] = mapped_column(String(160), nullable=False, default="", server_default="")
    account_number_masked: Mapped[str] = mapped_column(
        String(32), nullable=False, default="", server_default=""
    )
    balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )
    creation_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class FinanceManualIncome(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "finance_manual_incomes"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_finance_manual_incomes_workspace_id"),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_finance_manual_incomes_workspace_branch",
        ),
        CheckConstraint(
            "category IN ('servicios', 'efectivo', 'tarjeta', 'transferencia', 'link')",
            name="category_values",
        ),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("payment_status IN ('pagado', 'pendiente')", name="payment_status_values"),
        CheckConstraint("record_status IN ('active', 'voided')", name="record_status_values"),
        Index(
            "ix_finance_manual_incomes_workspace_branch_date",
            "workspace_id",
            "branch_id",
            "income_date",
        ),
        Index(
            "uq_finance_manual_incomes_workspace_idempotency",
            "workspace_id",
            "creation_idempotency_key",
            unique=True,
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    category: Mapped[str] = mapped_column(String(24), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    income_date: Mapped[date] = mapped_column(Date, nullable=False)
    customer: Mapped[str] = mapped_column(
        String(200), nullable=False, default="", server_default=""
    )
    source: Mapped[str] = mapped_column(String(48), nullable=False)
    payment_status: Mapped[str] = mapped_column(String(16), nullable=False)
    record_status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_by_platform_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT")
    )
    creation_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
