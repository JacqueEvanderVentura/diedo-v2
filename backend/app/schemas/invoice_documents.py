from decimal import Decimal
from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

InvoiceDocumentKind = Literal["sale", "quote", "expense"]


class InvoiceLineItemRequest(ApiModel):
    name: str = Field(min_length=1, max_length=160)
    qty: Decimal = Field(gt=0)
    price: Decimal = Field(ge=0)
    list_price: Decimal | None = Field(default=None, ge=0)
    sku: str | None = Field(default=None, max_length=64)


class InvoiceDocumentRequest(ApiModel):
    id: str = Field(min_length=1, max_length=64)
    kind: InvoiceDocumentKind = "sale"
    issued_at: str = Field(min_length=1, max_length=80)
    valid_until: str = Field(default="", max_length=80)
    branch_name: str = Field(default="", max_length=160)
    region: str = Field(default="", max_length=64)
    customer_name: str = Field(default="Cliente", max_length=200)
    customer_phone: str = Field(default="", max_length=40)
    customer_tax_line: str = Field(default="", max_length=120)
    payment_method: str = Field(default="", max_length=120)
    payment_reference: str = Field(default="", max_length=160)
    business_name: str = Field(default="", max_length=160)
    legal_name: str = Field(default="", max_length=160)
    business_rnc: str = Field(default="", max_length=32)
    business_address: str = Field(default="", max_length=500)
    business_phone: str = Field(default="", max_length=40)
    business_email: str | None = None
    logo_data_url: str = Field(default="", max_length=700_000)
    footer_note: str = Field(default="", max_length=500)
    items: list[InvoiceLineItemRequest] = Field(min_length=1, max_length=200)
    subtotal: Decimal = Field(ge=0)
    discount_amt: Decimal = Field(default=Decimal("0"), ge=0)
    discount_pct: Decimal = Field(default=Decimal("0"), ge=0)
    tax_pct: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    tax_label: str = Field(default="", max_length=80)
    tax_amt: Decimal = Field(default=Decimal("0"), ge=0)
    total: Decimal = Field(ge=0)
    paid_amount: Decimal = Field(default=Decimal("0"), ge=0)
    balance_due: Decimal | None = Field(default=None, ge=0)
