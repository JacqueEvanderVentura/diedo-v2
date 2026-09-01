from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, PlainSerializer

from app.schemas.common import ApiModel

DashboardPeriod = Literal["today", "week", "month", "quarter"]
DashboardTaskStatus = Literal["open", "in_progress", "completed", "cancelled"]
DashboardAppointmentStatus = Literal[
    "pending",
    "confirmed",
    "completed",
    "attended",
    "no_show",
    "cancelled",
    "delayed",
    "rescheduled",
]
StockAlertLevel = Literal["critical", "low"]


def _serialize_decimal(value: Decimal) -> str:
    return format(value, "f")


DecimalString = Annotated[
    Decimal,
    PlainSerializer(_serialize_decimal, return_type=str, when_used="json"),
]


class DashboardSummaryResponse(ApiModel):
    period: DashboardPeriod
    branch_id: UUID | None
    starts_at: datetime
    ends_at: datetime
    currency_code: str
    revenue: DecimalString
    appointments_today: int = Field(ge=0)
    open_tasks: int = Field(ge=0)
    generated_at: datetime


class SalesTrendPointResponse(ApiModel):
    label: str
    value: DecimalString


class DashboardSalesTrendResponse(ApiModel):
    period: DashboardPeriod
    branch_id: UUID | None
    starts_at: datetime
    ends_at: datetime
    currency_code: str
    total: DecimalString
    points: list[SalesTrendPointResponse]


class DashboardStockAlertResponse(ApiModel):
    id: UUID
    item_id: UUID
    branch_id: UUID
    branch_name: str
    name: str
    sku: str | None
    units: DecimalString
    minimum_units: DecimalString
    level: StockAlertLevel


class DashboardStockAlertsResponse(ApiModel):
    items: list[DashboardStockAlertResponse]


class DashboardAppointmentResponse(ApiModel):
    id: UUID
    branch_id: UUID
    customer_name: str
    service_name: str
    date: date
    time: str
    status: DashboardAppointmentStatus


class DashboardAppointmentsResponse(ApiModel):
    date: date
    items: list[DashboardAppointmentResponse]


class DashboardActivityResponse(ApiModel):
    id: str
    branch_id: UUID
    title: str
    occurred_at: datetime
    source: str
    icon: str
    to: str


class DashboardActivityListResponse(ApiModel):
    items: list[DashboardActivityResponse]
