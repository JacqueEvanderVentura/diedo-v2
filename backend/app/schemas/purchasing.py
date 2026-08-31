from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import EmailStr, Field, StringConstraints, field_validator, model_validator

from app.schemas.common import ApiModel

SupplierSortField = Literal["name", "rnc", "contactName", "productCount", "createdAt"]
PurchaseRequestSortField = Literal[
    "createdAt", "number", "supplier", "requester", "total", "status", "priority"
]
SortDirection = Literal["asc", "desc"]
PurchaseRequestStatus = Literal["pendiente", "aprobada", "rechazada", "entregada"]
PurchaseRequestPriority = Literal["normal", "alta"]

RequiredText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


def _optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


class SupplierResponse(ApiModel):
    id: UUID
    name: str
    rnc: str | None
    contact_name: str | None
    phone: str | None
    email: str | None
    address: str | None
    branch_ids: list[UUID]
    product_count: int
    active: bool
    version: int
    created_at: datetime
    updated_at: datetime


class PaginatedSuppliersResponse(ApiModel):
    items: list[SupplierResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreateSupplierRequest(ApiModel):
    name: RequiredText = Field(max_length=200)
    rnc: str | None = Field(default=None, max_length=80)
    contact_name: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=500)
    branch_ids: list[UUID] = Field(min_length=1, max_length=100)

    _normalize_optional_fields = field_validator(
        "rnc", "contact_name", "phone", "address", mode="before"
    )(_optional_text)

    @field_validator("branch_ids")
    @classmethod
    def unique_branches(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("No repitas sucursales autorizadas.")
        return value


class UpdateSupplierRequest(ApiModel):
    version: int = Field(ge=1)
    name: RequiredText | None = Field(default=None, max_length=200)
    rnc: str | None = Field(default=None, max_length=80)
    contact_name: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=500)
    branch_ids: list[UUID] | None = Field(default=None, min_length=1, max_length=100)
    active: bool | None = None

    _normalize_optional_fields = field_validator(
        "rnc", "contact_name", "phone", "address", mode="before"
    )(_optional_text)

    @field_validator("branch_ids")
    @classmethod
    def unique_branches(cls, value: list[UUID] | None) -> list[UUID] | None:
        if value is not None and len(value) != len(set(value)):
            raise ValueError("No repitas sucursales autorizadas.")
        return value

    @model_validator(mode="after")
    def require_change(self) -> UpdateSupplierRequest:
        if not (set(self.model_fields_set) - {"version"}):
            raise ValueError("Indica al menos un campo para actualizar.")
        return self


class PurchaseQuoteFile(ApiModel):
    name: RequiredText = Field(max_length=255)


class PurchaseRequestItemInput(ApiModel):
    name: RequiredText = Field(max_length=240)
    qty: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    unit: RequiredText = Field(max_length=40)
    price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)


class PurchaseRequestItemResponse(ApiModel):
    id: UUID
    name: str
    qty: Decimal
    unit: str
    price: Decimal
    subtotal: Decimal


class PurchaseRequestResponse(ApiModel):
    id: UUID
    number: str
    supplier_id: UUID
    supplier_name: str
    branch_id: UUID
    requester_name: str
    requester_id: UUID
    items: list[PurchaseRequestItemResponse]
    status: PurchaseRequestStatus
    priority: PurchaseRequestPriority
    notes: str | None
    quote_file: PurchaseQuoteFile | None
    total: Decimal
    created_at: datetime
    reviewed_at: datetime | None
    reviewed_by: UUID | None
    delivered_at: datetime | None
    version: int
    updated_at: datetime


class PaginatedPurchaseRequestsResponse(ApiModel):
    items: list[PurchaseRequestResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class PurchaseRequestStatsResponse(ApiModel):
    total: int
    pendiente: int
    aprobada: int
    rechazada: int
    entregada: int


class CreatePurchaseRequestRequest(ApiModel):
    supplier_id: UUID
    branch_id: UUID
    items: list[PurchaseRequestItemInput] = Field(min_length=1, max_length=100)
    priority: PurchaseRequestPriority = "normal"
    notes: str | None = Field(default=None, max_length=2000)
    quote_file: PurchaseQuoteFile | None = None

    _normalize_notes = field_validator("notes", mode="before")(_optional_text)


class UpdatePurchaseRequestRequest(ApiModel):
    version: int = Field(ge=1)
    supplier_id: UUID | None = None
    branch_id: UUID | None = None
    items: list[PurchaseRequestItemInput] | None = Field(
        default=None, min_length=1, max_length=100
    )
    priority: PurchaseRequestPriority | None = None
    notes: str | None = Field(default=None, max_length=2000)
    quote_file: PurchaseQuoteFile | None = None

    _normalize_notes = field_validator("notes", mode="before")(_optional_text)

    @model_validator(mode="after")
    def require_change(self) -> UpdatePurchaseRequestRequest:
        if not (set(self.model_fields_set) - {"version"}):
            raise ValueError("Indica al menos un campo para actualizar.")
        return self


class ReviewPurchaseRequestRequest(ApiModel):
    version: int = Field(ge=1)
    status: Literal["aprobada", "rechazada"]


class DeliverPurchaseRequestRequest(ApiModel):
    version: int = Field(ge=1)


class PurchasingApproverResponse(ApiModel):
    id: UUID
    name: str


class PurchasingSettingsResponse(ApiModel):
    approver_user_id: UUID | None
    approver_user: PurchasingApproverResponse | None
    notify_on_request: bool
    version: int
    updated_at: datetime


class UpdatePurchasingSettingsRequest(ApiModel):
    version: int = Field(ge=1)
    approver_user_id: UUID | None = None
    notify_on_request: bool
