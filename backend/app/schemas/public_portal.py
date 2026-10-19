from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from app.schemas.common import ApiModel
from app.schemas.public_booking import PublicAppointmentSummary, PublicCustomerProfileResponse


class PublicPortalMeResponse(PublicCustomerProfileResponse):
    pass


class PublicPortalAppointmentsResponse(ApiModel):
    items: list[PublicAppointmentSummary]


class PublicPortalReceivableItem(ApiModel):
    id: UUID
    branch_id: UUID
    receivable_number: str
    status: str
    amount: Decimal
    paid_amount: Decimal
    balance: Decimal
    due_date: date | None
    currency_code: str


class PublicPortalReceivablesResponse(ApiModel):
    items: list[PublicPortalReceivableItem]


class PublicPortalPaymentItem(ApiModel):
    id: UUID
    branch_id: UUID
    receivable_id: UUID
    amount: Decimal
    currency_code: str
    payment_method_name: str
    reference: str | None
    posted_at: datetime
    status: str


class PublicPortalPaymentsResponse(ApiModel):
    items: list[PublicPortalPaymentItem]


class PublicPortalInvoiceItem(ApiModel):
    id: UUID
    branch_id: UUID
    sale_number: str
    total: Decimal
    currency_code: str
    completed_at: datetime
    status: str


class PublicPortalInvoicesResponse(ApiModel):
    items: list[PublicPortalInvoiceItem]
