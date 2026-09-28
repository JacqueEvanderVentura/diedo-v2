from datetime import datetime
from decimal import Decimal
from typing import Literal, Self
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.schemas.common import ApiModel

WashStatus = Literal["waiting", "washing", "cancelled", "completed", "voided"]
OptionKind = Literal["services", "customers", "employees", "paymentMethods"]


class WashFields(ApiModel):
    model_config = ConfigDict(extra="forbid")
    customer_id: UUID
    plate: str = Field(min_length=1, max_length=32)
    vehicle_model: str | None = Field(default=None, max_length=120)
    vehicle_color: str | None = Field(default=None, max_length=60)
    service_ids: list[UUID] = Field(min_length=1, max_length=20)
    washer_id: UUID
    supervisor_id: UUID
    payment_method_id: UUID | None = None

    @field_validator("plate")
    @classmethod
    def normalize_plate(cls, value: str) -> str:
        value = " ".join(value.split()).upper()
        if not value:
            raise ValueError("La placa es obligatoria.")
        if len(value) > 32:
            raise ValueError("La placa normalizada no puede superar 32 caracteres.")
        return value

    @field_validator("vehicle_model", "vehicle_color")
    @classmethod
    def normalize_vehicle(cls, value: str | None) -> str | None:
        return " ".join(value.split()) or None if value is not None else None

    @model_validator(mode="after")
    def unique_services(self) -> Self:
        if len(set(self.service_ids)) != len(self.service_ids):
            raise ValueError("No repitas servicios en el lavado.")
        return self


class CreateWashRequest(WashFields):
    branch_id: UUID


class UpdateWashRequest(WashFields):
    version: int = Field(ge=1)


class WashActionRequest(ApiModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=1)


class CancelWashRequest(WashActionRequest):
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("reason")
    @classmethod
    def required_reason(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Indica un motivo de cancelación de al menos tres caracteres.")
        return value


class WashLineResponse(ApiModel):
    id: UUID
    service_config_id: UUID
    item_id: UUID
    name: str
    unit_price: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    total: Decimal
    washer_rate: Decimal
    supervisor_rate: Decimal
    config_version: int
    catalog_version: int


class WashResponse(ApiModel):
    id: UUID
    branch_id: UUID
    version: int
    customer_id: UUID
    customer_name: str
    plate: str
    vehicle_model: str | None
    vehicle_color: str | None
    washer_id: UUID
    washer_name: str
    supervisor_id: UUID
    supervisor_name: str
    payment_method_id: UUID | None
    payment_method_name: str | None
    currency: str
    timezone: str
    status: WashStatus
    subtotal: Decimal
    tax_amount: Decimal
    total: Decimal
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None
    cancelled_at: datetime | None
    cancel_reason: str | None
    sale_id: UUID | None
    sale_number: str | None
    receivable_id: UUID | None
    completed_at: datetime | None
    final_subtotal: Decimal | None
    final_discount_amount: Decimal | None
    final_tax_amount: Decimal | None
    final_total: Decimal | None
    voided_at: datetime | None
    void_reason: str | None
    lines: list[WashLineResponse]


class WashPage(ApiModel):
    items: list[WashResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class WashOption(ApiModel):
    id: UUID
    name: str
    sale_price: Decimal | None = None
    tax_rate: Decimal | None = None
    washer_rate: Decimal | None = None
    supervisor_rate: Decimal | None = None


class WashOptionPage(ApiModel):
    items: list[WashOption]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class WashContextResponse(ApiModel):
    can_complete: bool
    can_void: bool
    can_manage: bool
    can_create_customer: bool
    can_configure_services: bool
    can_manage_employees: bool
    timezone: str
    currency: str
