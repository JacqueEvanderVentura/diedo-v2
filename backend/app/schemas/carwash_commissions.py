from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Self
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.carwash_checkout import VoidWashRequest
from app.schemas.common import ApiModel, SimpleOptionResponse


class CommissionFilters(ApiModel):
    branch_id: UUID
    employee_id: UUID | None = None
    status: Literal["pending", "settled", "voided"] | None = None
    role: Literal["washer", "supervisor"] | None = None
    date_from: date | None = None
    date_to: date | None = None
    page: int = Field(default=1, ge=1, le=1000000)
    page_size: int = Field(default=20, ge=1, le=100)

    @model_validator(mode="after")
    def dates(self) -> Self:
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("La fecha hasta debe ser igual o posterior a la fecha desde.")
        return self


class CommissionResponse(ApiModel):
    id: UUID
    version: int
    wash_id: UUID
    employee_id: UUID
    employee_name: str
    role: str
    plate: str
    service: str
    sale_number: str
    base_amount: Decimal
    rate: Decimal
    amount: Decimal
    currency: str
    accrued_at: datetime
    status: str
    settlement_id: UUID | None


class CommissionSummary(ApiModel):
    washes: int
    billed: Decimal
    commissions: Decimal
    pending: Decimal


class CommissionPage(ApiModel):
    items: list[CommissionResponse]
    summary: CommissionSummary
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CommissionContext(ApiModel):
    can_settle: bool
    can_reverse: bool
    register_id: UUID | None
    currency: str
    timezone: str
    payment_methods: list[SimpleOptionResponse]
    employees: list[SimpleOptionResponse]


class CommissionSelection(ApiModel):
    id: UUID
    version: int = Field(ge=1)


class SettleCommissionsRequest(ApiModel):
    branch_id: UUID
    employee_id: UUID
    register_id: UUID
    payment_method_id: UUID
    commissions: list[CommissionSelection] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def distinct_entries(self) -> Self:
        if len({row.id for row in self.commissions}) != len(self.commissions):
            raise ValueError("No repitas comisiones en la selección.")
        return self


class ReverseSettlementRequest(VoidWashRequest):
    pass


class SettlementResponse(ApiModel):
    id: UUID
    version: int
    branch_id: UUID
    employee_id: UUID
    employee_name: str
    register_id: UUID
    currency: str
    amount: Decimal
    status: str
    movement_id: UUID | None
    reversal_movement_id: UUID | None
    created_at: datetime
    reversed_at: datetime | None
    reversal_reason: str | None
    commissions: list[CommissionResponse]


class SettlementPage(ApiModel):
    items: list[SettlementResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int
