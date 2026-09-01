from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import Field, PlainSerializer, field_validator, model_validator

from app.schemas.administration import PaymentChannel, PaymentSettlementPolicy
from app.schemas.common import ApiModel


def _serialize_decimal(value: Decimal) -> str:
    return format(value, "f")


DecimalString = Annotated[
    Decimal,
    PlainSerializer(_serialize_decimal, return_type=str, when_used="json"),
]
Money = DecimalString
Quantity = DecimalString

DiscountType = Literal["percent", "fixed"]
RegisterStatus = Literal["open", "closed"]
ManualCashMovementType = Literal["income", "expense"]
CashMovementType = Literal[
    "sale",
    "receivable_payment",
    "income",
    "expense",
    "reversal",
]
QuoteKind = Literal["quote", "held"]
QuoteStatus = Literal["open", "converted", "cancelled", "expired"]
SaleStatus = Literal["completed", "voided"]
ReceivableStatus = Literal["pending", "partial", "paid", "cancelled"]
CustomerPaymentStatus = Literal["posted", "reversed"]
ReceivableSource = Literal["sale", "appointment"]
PosCatalogItemType = Literal["product", "service", "supply", "membership", "other"]
PosStockStatus = Literal["available", "low", "out", "not_tracked"]


def _normalize_required_text(value: str) -> str:
    return " ".join(value.split())


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = " ".join(value.split())
    return normalized or None


def _validate_discount(
    discount_type: DiscountType | None,
    discount_value: Decimal | None,
) -> None:
    if (discount_type is None) != (discount_value is None):
        raise ValueError("Envía discountType y discountValue juntos.")
    if discount_type == "percent" and discount_value is not None and discount_value > 100:
        raise ValueError("El descuento porcentual no puede superar 100%.")


class OpenRegisterRequest(ApiModel):
    branch_id: UUID
    opening_cash: Money = Field(ge=0, max_digits=14, decimal_places=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None

    @field_validator("notes")
    @classmethod
    def normalize_notes(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class CloseRegisterRequest(ApiModel):
    counted_cash: Money = Field(ge=0, max_digits=14, decimal_places=2)
    notes: str | None = Field(default=None, max_length=1000)
    version: int = Field(ge=1)

    @field_validator("notes")
    @classmethod
    def normalize_notes(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class ManualCashMovementLineRequest(ApiModel):
    item_id: UUID | None = None
    description: str = Field(min_length=1, max_length=160)
    quantity: Quantity = Field(gt=0, max_digits=14, decimal_places=3)
    unit_cost: Money = Field(ge=0, max_digits=14, decimal_places=2)

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return _normalize_required_text(value)


class CreateManualCashMovementRequest(ApiModel):
    type: ManualCashMovementType
    concept: str = Field(min_length=2, max_length=240)
    amount: Money = Field(gt=0, max_digits=14, decimal_places=2)
    payment_method_id: UUID
    reference: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=1000)
    lines: list[ManualCashMovementLineRequest] = Field(default_factory=list, max_length=100)

    @field_validator("concept")
    @classmethod
    def normalize_concept(cls, value: str) -> str:
        return _normalize_required_text(value)

    @field_validator("reference", "notes")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class CheckoutLineRequest(ApiModel):
    item_id: UUID
    quantity: Quantity = Field(gt=0, max_digits=14, decimal_places=3)
    unit_price: Money | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)


class CheckoutRequest(ApiModel):
    branch_id: UUID
    register_id: UUID
    customer_id: UUID | None = None
    payment_method_id: UUID
    reference: str | None = Field(default=None, max_length=160)
    quote_id: UUID | None = None
    quote_version: int | None = Field(default=None, ge=1)
    discount_type: DiscountType | None = None
    discount_value: Money | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    lines: list[CheckoutLineRequest] = Field(min_length=1, max_length=100)
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("reference", "notes")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @field_validator("lines")
    @classmethod
    def reject_duplicate_items(cls, value: list[CheckoutLineRequest]) -> list[CheckoutLineRequest]:
        item_ids = [line.item_id for line in value]
        if len(item_ids) != len(set(item_ids)):
            raise ValueError("No repitas ítems en la venta.")
        return value

    @model_validator(mode="after")
    def validate_discount(self) -> Self:
        _validate_discount(self.discount_type, self.discount_value)
        if (self.quote_id is None) != (self.quote_version is None):
            raise ValueError("quoteId y quoteVersion deben enviarse juntos.")
        return self


class QuoteLineRequest(CheckoutLineRequest):
    pass


class CreateQuoteRequest(ApiModel):
    kind: QuoteKind
    branch_id: UUID
    customer_id: UUID | None = None
    payment_method_id: UUID | None = None
    reference: str | None = Field(default=None, max_length=160)
    discount_type: DiscountType | None = None
    discount_value: Money | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    lines: list[QuoteLineRequest] = Field(min_length=1, max_length=100)
    notes: str | None = Field(default=None, max_length=1000)
    due_at: datetime | None = None

    @field_validator("notes", "reference")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @field_validator("lines")
    @classmethod
    def reject_duplicate_items(cls, value: list[QuoteLineRequest]) -> list[QuoteLineRequest]:
        item_ids = [line.item_id for line in value]
        if len(item_ids) != len(set(item_ids)):
            raise ValueError("No repitas ítems en la cotización.")
        return value

    @model_validator(mode="after")
    def validate_discount(self) -> Self:
        _validate_discount(self.discount_type, self.discount_value)
        return self


class UpdateQuoteRequest(ApiModel):
    kind: QuoteKind | None = None
    branch_id: UUID | None = None
    customer_id: UUID | None = None
    payment_method_id: UUID | None = None
    reference: str | None = Field(default=None, max_length=160)
    discount_type: DiscountType | None = None
    discount_value: Money | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    lines: list[QuoteLineRequest] | None = Field(default=None, min_length=1, max_length=100)
    notes: str | None = Field(default=None, max_length=1000)
    due_at: datetime | None = None
    version: int = Field(ge=1)

    @field_validator("notes", "reference")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @field_validator("lines")
    @classmethod
    def reject_duplicate_items(
        cls,
        value: list[QuoteLineRequest] | None,
    ) -> list[QuoteLineRequest] | None:
        if value is None:
            return None
        item_ids = [line.item_id for line in value]
        if len(item_ids) != len(set(item_ids)):
            raise ValueError("No repitas ítems en la cotización.")
        return value

    @model_validator(mode="after")
    def validate_changes(self) -> Self:
        changed = self.model_fields_set - {"version"}
        if not changed:
            raise ValueError("Debes enviar al menos un cambio.")
        if "kind" in changed and self.kind is None:
            raise ValueError("kind no puede ser nulo.")
        if "branch_id" in changed and self.branch_id is None:
            raise ValueError("branchId no puede ser nulo.")
        if "lines" in changed and self.lines is None:
            raise ValueError("lines no puede ser nulo.")
        discount_type_set = "discount_type" in changed
        discount_value_set = "discount_value" in changed
        if discount_type_set != discount_value_set:
            raise ValueError("Actualiza discountType y discountValue juntos.")
        if discount_type_set:
            _validate_discount(self.discount_type, self.discount_value)
        return self


class UpdateReceivableRequest(ApiModel):
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=1000)
    version: int = Field(ge=1)

    @field_validator("notes")
    @classmethod
    def normalize_notes(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @model_validator(mode="after")
    def require_change(self) -> Self:
        if not self.model_fields_set - {"version"}:
            raise ValueError("Debes enviar dueDate o notes.")
        return self


class CreateReceivablePaymentRequest(ApiModel):
    amount: Money = Field(gt=0, max_digits=14, decimal_places=2)
    payment_method_id: UUID
    reference: str | None = Field(default=None, max_length=160)
    note: str | None = Field(default=None, max_length=1000)
    register_id: UUID | None = None
    version: int = Field(ge=1)

    @field_validator("reference", "note")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class VoidRequest(ApiModel):
    reason: str = Field(min_length=2, max_length=1000)
    version: int = Field(ge=1)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        return _normalize_required_text(value)


class ReverseRequest(VoidRequest):
    pass


class PosBranchReferenceResponse(ApiModel):
    id: UUID
    name: str


class PosCustomerReferenceResponse(ApiModel):
    id: UUID | None
    name: str


class PosItemReferenceResponse(ApiModel):
    id: UUID | None
    name: str
    sku: str | None


class PosPaymentMethodReferenceResponse(ApiModel):
    id: UUID
    code: str
    name: str
    icon: str
    channel: PaymentChannel
    settlement_policy: PaymentSettlementPolicy
    affects_cash_drawer: bool
    requires_evidence: bool


class PosCatalogItemResponse(ApiModel):
    id: UUID
    name: str
    sku: str | None
    item_type: PosCatalogItemType
    unit_symbol: str
    sale_price: Money
    tax_rate: Money
    stock_quantity: Quantity | None
    stock_status: PosStockStatus


class RegisterPaymentMethodSummaryResponse(ApiModel):
    payment_method: PosPaymentMethodReferenceResponse
    sales_total: Money
    sales_count: int


class RegisterSummaryResponse(ApiModel):
    opening_cash: Money
    cash_sales: Money
    cash_receivable_payments: Money
    manual_income: Money
    cash_expenses: Money
    expected_cash: Money
    total_sales: Money
    sales_count: int
    voided_sales_count: int
    sales_by_payment_method: list[RegisterPaymentMethodSummaryResponse]


class RegisterStateResponse(ApiModel):
    id: UUID
    branch: PosBranchReferenceResponse
    status: RegisterStatus
    currency: str
    opening_cash: Money
    expected_cash: Money
    counted_cash: Money | None
    difference: Money | None
    notes: str | None
    opened_by_platform_user_id: UUID
    opened_by_name: str
    opened_at: datetime
    closed_by_platform_user_id: UUID | None
    closed_by_name: str | None
    closed_at: datetime | None
    version: int


class RegisterOverviewResponse(RegisterStateResponse):
    summary: RegisterSummaryResponse


class RegisterListItemResponse(RegisterStateResponse):
    summary: RegisterSummaryResponse
    sales_count: int
    movements_count: int


class PaginatedRegistersResponse(ApiModel):
    items: list[RegisterListItemResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CashMovementLineResponse(ApiModel):
    id: UUID
    item: PosItemReferenceResponse | None
    description: str
    quantity: Quantity
    unit_cost: Money
    line_total: Money


class CashMovementResponse(ApiModel):
    id: UUID
    register_id: UUID
    type: CashMovementType
    concept: str
    currency: str
    amount: Money
    cash_delta: Money
    payment_method: PosPaymentMethodReferenceResponse | None
    reference: str | None
    notes: str | None
    lines: list[CashMovementLineResponse]
    sale_id: UUID | None
    customer_payment_id: UUID | None
    reversal_of_id: UUID | None
    inventory_movement_id: UUID | None
    created_by_platform_user_id: UUID
    created_at: datetime


class PaginatedCashMovementsResponse(ApiModel):
    items: list[CashMovementResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class RegisterDetailResponse(RegisterStateResponse):
    summary: RegisterSummaryResponse
    movements: list[CashMovementResponse]
    movements_total: int


class SaleLineResponse(ApiModel):
    id: UUID
    item: PosItemReferenceResponse
    quantity: Quantity
    unit_price: Money
    subtotal: Money
    discount_amount: Money
    tax_rate: Money
    tax_amount: Money
    total: Money


class PaymentProofResponse(ApiModel):
    id: UUID
    owner_type: str
    owner_id: UUID
    filename: str
    content_type: str
    size: int
    checksum: str
    created_at: datetime
    content_url: str


class SalePaymentResponse(ApiModel):
    payment_method: PosPaymentMethodReferenceResponse
    amount: Money
    reference: str | None
    proofs: list[PaymentProofResponse]


class SaleListItemResponse(ApiModel):
    id: UUID
    number: str
    branch: PosBranchReferenceResponse
    register_id: UUID
    customer: PosCustomerReferenceResponse | None
    status: SaleStatus
    currency: str
    subtotal: Money
    discount_amount: Money
    tax_amount: Money
    total: Money
    payment_method: PosPaymentMethodReferenceResponse
    reference: str | None
    sold_by_name: str
    created_at: datetime
    version: int


class SaleDetailResponse(SaleListItemResponse):
    quote_id: UUID | None
    lines: list[SaleLineResponse]
    payment: SalePaymentResponse | None
    notes: str | None
    void_reason: str | None
    voided_by_platform_user_id: UUID | None
    voided_at: datetime | None
    version: int


class CheckoutResponse(SaleDetailResponse):
    receivable_id: UUID | None
    inventory_movement_id: UUID | None


class PaginatedSalesResponse(ApiModel):
    items: list[SaleListItemResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class SalesSummaryResponse(ApiModel):
    gross_sales: Money
    discounts: Money
    taxes: Money
    net_sales: Money
    average_ticket: Money
    sales_count: int
    voided_count: int


class SaleStateResponse(ApiModel):
    id: UUID
    status: SaleStatus
    void_reason: str | None
    voided_at: datetime | None
    version: int


class QuoteLineResponse(ApiModel):
    id: UUID
    item: PosItemReferenceResponse
    quantity: Quantity
    unit_price: Money
    subtotal: Money
    discount_amount: Money
    tax_rate: Money
    tax_amount: Money
    total: Money


class QuoteListItemResponse(ApiModel):
    id: UUID
    number: str
    kind: QuoteKind
    status: QuoteStatus
    branch: PosBranchReferenceResponse
    customer: PosCustomerReferenceResponse | None
    payment_method: PosPaymentMethodReferenceResponse | None
    reference: str | None
    currency: str
    subtotal: Money
    discount_amount: Money
    tax_amount: Money
    total: Money
    due_at: datetime | None
    created_at: datetime
    updated_at: datetime
    version: int


class QuoteDetailResponse(QuoteListItemResponse):
    lines: list[QuoteLineResponse]
    notes: str | None
    converted_sale_id: UUID | None


class PaginatedQuotesResponse(ApiModel):
    items: list[QuoteListItemResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class QuotesSummaryResponse(ApiModel):
    open_count: int
    held_count: int
    converted_count: int
    open_total: Money
    held_total: Money


class QuoteStateResponse(ApiModel):
    id: UUID
    kind: QuoteKind
    status: QuoteStatus
    converted_sale_id: UUID | None
    version: int


class ReceivablePaymentResponse(ApiModel):
    id: UUID
    amount: Money
    payment_method: PosPaymentMethodReferenceResponse
    reference: str | None
    note: str | None
    register_id: UUID | None
    status: CustomerPaymentStatus
    proofs: list[PaymentProofResponse]
    received_by_platform_user_id: UUID
    paid_at: datetime
    reversed_at: datetime | None
    reversal_reason: str | None
    version: int


class ReceivableLineResponse(ApiModel):
    id: UUID
    item: PosItemReferenceResponse | None
    description: str
    quantity: Quantity
    unit_price: Money
    total: Money


class ReceivableListItemResponse(ApiModel):
    id: UUID
    number: str
    source: ReceivableSource
    sale_id: UUID | None
    appointment_id: UUID | None
    branch: PosBranchReferenceResponse
    customer: PosCustomerReferenceResponse
    payment_method: PosPaymentMethodReferenceResponse | None
    status: ReceivableStatus
    overdue: bool
    currency: str
    original_amount: Money
    paid_total: Money
    balance: Money
    reference: str | None
    due_date: date | None
    created_at: datetime
    updated_at: datetime
    version: int


class ReceivableDetailResponse(ReceivableListItemResponse):
    notes: str | None
    lines: list[ReceivableLineResponse]
    payments: list[ReceivablePaymentResponse]
    proofs: list[PaymentProofResponse]


class PaginatedReceivablesResponse(ApiModel):
    items: list[ReceivableListItemResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class ReceivablesSummaryResponse(ApiModel):
    original_total: Money
    paid_total: Money
    pending_total: Money
    overdue_total: Money
    pending_count: int
    partial_count: int
    overdue_count: int


class ReceivableStateResponse(ApiModel):
    id: UUID
    status: ReceivableStatus
    paid_total: Money
    balance: Money
    version: int


class PosStateResponse(ApiModel):
    branch_id: UUID
    current_register: RegisterDetailResponse | None = Field(alias="register")
    catalog: list[PosCatalogItemResponse]
    quotes: list[QuoteDetailResponse]
    sales: list[SaleDetailResponse]
    receivables: list[ReceivableDetailResponse]
    receivable_summary: ReceivablesSummaryResponse
    payment_methods: list[PosPaymentMethodReferenceResponse]
