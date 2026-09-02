from __future__ import annotations

from datetime import date as DateValue
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints, field_validator, model_validator

from app.schemas.common import ApiModel

ExpenseCategory = Literal[
    "alquiler",
    "servicios",
    "nomina",
    "insumos",
    "marketing",
    "mantenimiento",
    "otros",
]
PaymentStatus = Literal["pagado", "pendiente"]
BudgetGroup = Literal["marketing", "operaciones", "rh", "it"]
LiabilityType = Literal["prestamo", "tarjeta"]
AccountType = Literal["banco", "inversion", "accionistas"]
IncomeCategory = Literal["servicios", "efectivo", "tarjeta", "transferencia", "link"]
SortDirection = Literal["asc", "desc"]
ExpenseSortField = Literal["date", "category", "concept", "amount", "status"]
FixedExpenseSortField = Literal["dayOfMonth", "concept", "category", "amount", "createdAt"]
LiabilitySortField = Literal["name", "type", "initialAmount", "pendingAmount", "createdAt"]
BudgetSortField = Literal["name", "group", "monthlyLimit", "createdAt"]
AccountSortField = Literal["name", "type", "bank", "balance", "createdAt"]
IncomeSortField = Literal["date", "customer", "category", "amount", "status"]

RequiredText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


def _optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


class FinanceExpenseResponse(ApiModel):
    id: UUID
    concept: str
    amount: Decimal
    category: ExpenseCategory
    date: DateValue
    branch_id: UUID
    status: PaymentStatus
    budget_id: UUID | None
    source: Literal["finanzas", "caja"]
    editable: bool
    version: int | None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PaginatedFinanceExpensesResponse(ApiModel):
    items: list[FinanceExpenseResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreateFinanceExpenseRequest(ApiModel):
    concept: RequiredText = Field(max_length=240)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    category: ExpenseCategory = "otros"
    date: DateValue
    branch_id: UUID
    status: PaymentStatus = "pagado"
    budget_id: UUID | None = None


class UpdateFinanceExpenseRequest(ApiModel):
    version: int = Field(ge=1)
    concept: RequiredText | None = Field(default=None, max_length=240)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    category: ExpenseCategory | None = None
    date: DateValue | None = None
    branch_id: UUID | None = None
    status: PaymentStatus | None = None
    budget_id: UUID | None = None

    @model_validator(mode="after")
    def require_change(self) -> UpdateFinanceExpenseRequest:
        if not (set(self.model_fields_set) - {"version"}):
            raise ValueError("Indica al menos un campo para actualizar.")
        return self


class FinanceFixedExpensePaymentResponse(ApiModel):
    id: UUID
    period: DateValue
    amount: Decimal
    paid_on: DateValue
    created_at: datetime


class FinanceFixedExpenseResponse(ApiModel):
    id: UUID
    concept: str
    amount: Decimal
    category: ExpenseCategory
    branch_id: UUID
    day_of_month: int
    paid_periods: list[str]
    payments: list[FinanceFixedExpensePaymentResponse]
    version: int
    created_at: datetime
    updated_at: datetime


class PaginatedFinanceFixedExpensesResponse(ApiModel):
    items: list[FinanceFixedExpenseResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreateFinanceFixedExpenseRequest(ApiModel):
    concept: RequiredText = Field(max_length=240)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    category: ExpenseCategory = "otros"
    branch_id: UUID
    day_of_month: int = Field(default=1, ge=1, le=31)


class UpdateFinanceFixedExpenseRequest(ApiModel):
    version: int = Field(ge=1)
    concept: RequiredText | None = Field(default=None, max_length=240)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    category: ExpenseCategory | None = None
    branch_id: UUID | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=31)

    @model_validator(mode="after")
    def require_change(self) -> UpdateFinanceFixedExpenseRequest:
        if not (set(self.model_fields_set) - {"version"}):
            raise ValueError("Indica al menos un campo para actualizar.")
        return self


class PayFinanceFixedExpenseRequest(ApiModel):
    period: DateValue | None = None
    paid_on: DateValue | None = None

    @field_validator("period")
    @classmethod
    def require_first_day(cls, value: DateValue | None) -> DateValue | None:
        if value is not None and value.day != 1:
            raise ValueError("El período debe usar el primer día del mes.")
        return value


class FinanceLiabilityResponse(ApiModel):
    id: UUID
    name: str
    type: LiabilityType
    initial_amount: Decimal
    pending_amount: Decimal
    branch_id: UUID
    pay_day: int
    cut_day: int | None
    installment: Decimal | None
    paid_installments: int
    total_installments: int | None
    category_ids: list[ExpenseCategory]
    version: int
    created_at: datetime
    updated_at: datetime


class PaginatedFinanceLiabilitiesResponse(ApiModel):
    items: list[FinanceLiabilityResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreateFinanceLiabilityRequest(ApiModel):
    name: RequiredText = Field(max_length=200)
    type: LiabilityType = "prestamo"
    initial_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    pending_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    branch_id: UUID
    pay_day: int = Field(default=1, ge=1, le=31)
    cut_day: int | None = Field(default=None, ge=1, le=31)
    installment: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    paid_installments: int = Field(default=0, ge=0)
    total_installments: int | None = Field(default=None, gt=0)
    category_ids: list[ExpenseCategory] = Field(default_factory=list, max_length=7)

    @field_validator("category_ids")
    @classmethod
    def unique_categories(cls, value: list[ExpenseCategory]) -> list[ExpenseCategory]:
        if len(value) != len(set(value)):
            raise ValueError("No repitas categorías asociadas.")
        return value

    @model_validator(mode="after")
    def validate_amounts_and_type(self) -> CreateFinanceLiabilityRequest:
        pending = self.initial_amount if self.pending_amount is None else self.pending_amount
        if pending > self.initial_amount:
            raise ValueError("El monto pendiente no puede superar el monto inicial.")
        if self.type == "tarjeta":
            if self.cut_day is None:
                raise ValueError("Las tarjetas requieren día de corte.")
            if self.installment is not None or self.total_installments is not None:
                raise ValueError("Las tarjetas no usan cuota ni total de cuotas.")
            if self.paid_installments != 0:
                raise ValueError("Las tarjetas no usan cuotas pagadas.")
        elif self.cut_day is not None:
            raise ValueError("Los préstamos no usan día de corte.")
        if self.total_installments is not None and self.paid_installments > self.total_installments:
            raise ValueError("Las cuotas pagadas no pueden superar el total.")
        return self


class UpdateFinanceLiabilityRequest(ApiModel):
    version: int = Field(ge=1)
    name: RequiredText | None = Field(default=None, max_length=200)
    type: LiabilityType | None = None
    initial_amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    pending_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    branch_id: UUID | None = None
    pay_day: int | None = Field(default=None, ge=1, le=31)
    cut_day: int | None = Field(default=None, ge=1, le=31)
    installment: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    paid_installments: int | None = Field(default=None, ge=0)
    total_installments: int | None = Field(default=None, gt=0)
    category_ids: list[ExpenseCategory] | None = Field(default=None, max_length=7)

    @field_validator("category_ids")
    @classmethod
    def unique_categories(cls, value: list[ExpenseCategory] | None) -> list[ExpenseCategory] | None:
        if value is not None and len(value) != len(set(value)):
            raise ValueError("No repitas categorías asociadas.")
        return value

    @model_validator(mode="after")
    def require_change(self) -> UpdateFinanceLiabilityRequest:
        if not (set(self.model_fields_set) - {"version"}):
            raise ValueError("Indica al menos un campo para actualizar.")
        return self


class FinanceBudgetTransactionResponse(ApiModel):
    id: UUID
    concept: str
    amount: Decimal
    date: DateValue


class FinanceBudgetResponse(ApiModel):
    id: UUID
    name: str
    group: BudgetGroup
    monthly_limit: Decimal
    branch_id: UUID
    spent: Decimal
    remaining: Decimal
    usage_percent: Decimal
    over_budget: bool
    transactions: list[FinanceBudgetTransactionResponse]
    version: int
    created_at: datetime
    updated_at: datetime


class PaginatedFinanceBudgetsResponse(ApiModel):
    items: list[FinanceBudgetResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreateFinanceBudgetRequest(ApiModel):
    name: RequiredText = Field(max_length=160)
    group: BudgetGroup = "operaciones"
    monthly_limit: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    branch_id: UUID


class UpdateFinanceBudgetRequest(ApiModel):
    version: int = Field(ge=1)
    name: RequiredText | None = Field(default=None, max_length=160)
    group: BudgetGroup | None = None
    monthly_limit: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    branch_id: UUID | None = None

    @model_validator(mode="after")
    def require_change(self) -> UpdateFinanceBudgetRequest:
        if not (set(self.model_fields_set) - {"version"}):
            raise ValueError("Indica al menos un campo para actualizar.")
        return self


class FinanceAccountResponse(ApiModel):
    id: UUID
    name: str
    type: AccountType
    bank: str
    account_number: str
    balance: Decimal
    currency: str
    branch_id: UUID
    notes: str
    version: int
    created_at: datetime
    updated_at: datetime


class PaginatedFinanceAccountsResponse(ApiModel):
    items: list[FinanceAccountResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreateFinanceAccountRequest(ApiModel):
    name: RequiredText = Field(max_length=160)
    type: AccountType = "banco"
    bank: str = Field(default="", max_length=160)
    account_number: str = Field(default="", max_length=64)
    balance: Decimal = Field(default=Decimal("0"), max_digits=14, decimal_places=2)
    currency: str = Field(default="DOP", pattern=r"^[A-Z]{3}$")
    branch_id: UUID
    notes: str = Field(default="", max_length=1000)

    _normalize_bank = field_validator("bank", "account_number", "notes", mode="before")(
        lambda value: "" if value is None else str(value).strip()
    )


class UpdateFinanceAccountRequest(ApiModel):
    version: int = Field(ge=1)
    name: RequiredText | None = Field(default=None, max_length=160)
    type: AccountType | None = None
    bank: str | None = Field(default=None, max_length=160)
    account_number: str | None = Field(default=None, max_length=64)
    balance: Decimal | None = Field(default=None, max_digits=14, decimal_places=2)
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    branch_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def require_change(self) -> UpdateFinanceAccountRequest:
        if not (set(self.model_fields_set) - {"version"}):
            raise ValueError("Indica al menos un campo para actualizar.")
        return self


class FinanceIncomeResponse(ApiModel):
    id: UUID
    date: DateValue
    customer: str
    category: str
    branch_id: UUID
    status: PaymentStatus
    amount: Decimal
    source: str
    reference: str | None
    editable: bool
    version: int | None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PaginatedFinanceIncomesResponse(ApiModel):
    items: list[FinanceIncomeResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreateFinanceManualIncomeRequest(ApiModel):
    category: IncomeCategory = "servicios"
    branch_id: UUID
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    date: DateValue
    customer: str = Field(default="", max_length=200)
    source: RequiredText = Field(default="Formulario", max_length=48)
    status: PaymentStatus = "pagado"

    _normalize_customer = field_validator("customer", mode="before")(
        lambda value: "" if value is None else str(value).strip()
    )


class UpdateFinanceManualIncomeRequest(ApiModel):
    version: int = Field(ge=1)
    category: IncomeCategory | None = None
    branch_id: UUID | None = None
    amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    date: DateValue | None = None
    customer: str | None = Field(default=None, max_length=200)
    source: RequiredText | None = Field(default=None, max_length=48)
    status: PaymentStatus | None = None

    @model_validator(mode="after")
    def require_change(self) -> UpdateFinanceManualIncomeRequest:
        if not (set(self.model_fields_set) - {"version"}):
            raise ValueError("Indica al menos un campo para actualizar.")
        return self


class FinanceTrendPointResponse(ApiModel):
    period: str
    label: str
    value: Decimal


class FinanceOverviewResponse(ApiModel):
    period: str
    branch_id: UUID | None
    currency: str
    incomes: Decimal
    expenses: Decimal
    balance: Decimal
    alerts: int
    gross_profit_estimate: Decimal
    net_margin_percent: Decimal
    trend: list[FinanceTrendPointResponse]


class FinanceLiabilityStatsResponse(ApiModel):
    total_debt: Decimal
    cards: int
    loans: int


class FinanceBudgetStatsResponse(ApiModel):
    total_budget: Decimal
    spent: Decimal
    remaining: Decimal
    over_budget: int


class FinanceAccountStatsResponse(ApiModel):
    total: Decimal
    bank: Decimal
    investment: Decimal
    shareholders: Decimal
