from decimal import Decimal
from typing import Literal, Self
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.schemas.administration import PaymentMethodResponse
from app.schemas.carwash_operations import WashActionRequest, WashResponse
from app.schemas.common import ApiModel
from app.schemas.pos import _validate_discount


class WashPriceOverride(ApiModel):
    model_config = ConfigDict(extra="forbid")
    wash_line_id: UUID
    unit_price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)


class PreviewWashRequest(WashActionRequest):
    discount_type: Literal["percent", "fixed"] | None = None
    discount_value: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    price_overrides: list[WashPriceOverride] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def valid_prices(self) -> Self:
        _validate_discount(self.discount_type, self.discount_value)
        if len({row.wash_line_id for row in self.price_overrides}) != len(self.price_overrides):
            raise ValueError("No repitas líneas en los cambios de precio.")
        return self


class CompleteWashRequest(PreviewWashRequest):
    register_id: UUID
    payment_method_id: UUID
    reference: str | None = Field(default=None, max_length=160)


class VoidWashRequest(WashActionRequest):
    reason: str = Field(min_length=3, max_length=1000)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Indica un motivo de al menos tres caracteres.")
        return value


class WashPricePreview(ApiModel):
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    total: Decimal


class WashCheckoutContext(ApiModel):
    wash: WashResponse
    register_id: UUID | None
    payment_methods: list[PaymentMethodResponse]
    can_discount: bool
    can_upload_proof: bool


class WashBillingResponse(ApiModel):
    sale_id: UUID
    sale_number: str
    status: str
    total: Decimal
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    payment_method_name: str
    receivable_id: UUID | None
    receivable_status: str | None
    paid_amount: Decimal
    pending_amount: Decimal
    can_upload_proof: bool
