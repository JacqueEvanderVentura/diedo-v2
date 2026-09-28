from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field

from app.schemas.common import ApiModel


class CarwashReportFilters(ApiModel):
    branch_id: UUID
    date_from: date | None = Field(default=None, le=date(9999, 12, 30))
    date_to: date | None = Field(default=None, le=date(9999, 12, 30))


class CarwashIndicators(ApiModel):
    branch_id: UUID
    currency: str
    timezone: str
    today: date
    generated_at: datetime
    active_washes: int
    completed_today: int
    billed_today: Decimal
    pending_commissions: Decimal | None


class CarwashReportTotals(ApiModel):
    washes: int
    billed: Decimal
    washer_commissions: Decimal
    supervisor_commissions: Decimal
    commissions: Decimal
    service_count: int
    employee_count: int


class CarwashDailyReport(ApiModel):
    date: date
    washes: int
    billed: Decimal
    washer_commissions: Decimal
    supervisor_commissions: Decimal


class CarwashServiceReport(ApiModel):
    item_id: UUID | None
    name: str
    count: int


class CarwashEmployeeReport(ApiModel):
    employee_id: UUID
    name: str
    washes: int
    washer_commissions: Decimal
    supervisor_commissions: Decimal
    commissions: Decimal


class CarwashReports(ApiModel):
    branch_id: UUID
    currency: str
    timezone: str
    date_from: date
    date_to: date
    generated_at: datetime
    totals: CarwashReportTotals
    daily: list[CarwashDailyReport]
    services: list[CarwashServiceReport]
    employees: list[CarwashEmployeeReport]
