from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, PlainSerializer

from app.schemas.common import ApiModel

ReportPeriod = Literal["today", "week", "month", "quarter"]
AgendaReportPeriod = Literal["today", "week", "month", "quarter", "all"]
SortDirection = Literal["asc", "desc"]
MembershipStatus = Literal["activo", "proximo", "vencido", "inactivo"]
AppointmentStatus = Literal[
    "pending",
    "confirmed",
    "completed",
    "attended",
    "no_show",
    "cancelled",
    "delayed",
    "rescheduled",
]


def _serialize_decimal(value: Decimal) -> str:
    return format(value, "f")


DecimalString = Annotated[
    Decimal,
    PlainSerializer(_serialize_decimal, return_type=str, when_used="json"),
]


class ReportMoneyTotals(ApiModel):
    income: DecimalString
    expenses: DecimalString
    balance: DecimalString


class GeneralSeriesPoint(ApiModel):
    label: str
    income: DecimalString
    expenses: DecimalString


class DistributionPoint(ApiModel):
    name: str
    value: DecimalString
    pct: DecimalString


class GeneralReportSummaryResponse(ApiModel):
    period: ReportPeriod
    branch_id: UUID | None
    starts_at: datetime
    ends_at: datetime
    currency_code: str
    totals: ReportMoneyTotals
    series: list[GeneralSeriesPoint]
    income_distribution: list[DistributionPoint]
    generated_at: datetime


class GeneralTransactionResponse(ApiModel):
    id: str
    date: datetime
    type: Literal["ingreso", "gasto"]
    category: str
    branch_id: UUID
    branch_name: str
    amount: DecimalString


class PaginatedGeneralTransactionsResponse(ApiModel):
    items: list[GeneralTransactionResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class ExpenseCategoryResponse(ApiModel):
    name: str
    amount: DecimalString
    pct: DecimalString


class PaginatedExpenseCategoriesResponse(ApiModel):
    items: list[ExpenseCategoryResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class MembershipGrowthPoint(ApiModel):
    label: str
    value: DecimalString


class MembershipSummaryResponse(ApiModel):
    active_count: int = Field(ge=0)
    mrr: DecimalString
    avg_ticket: DecimalString
    upcoming: int = Field(ge=0)
    expired: int = Field(ge=0)
    inactive: int = Field(ge=0)
    new_this_month: int = Field(ge=0)
    growth_pct: DecimalString
    growth: list[MembershipGrowthPoint]
    plans: list[str]


class MembershipReportItemResponse(ApiModel):
    id: str
    customer_id: UUID
    client_name: str
    plan_id: UUID | None
    plan: str
    branch_id: UUID
    branch_name: str
    amount: DecimalString
    last_payment_at: datetime
    expires_on: date
    status: MembershipStatus


class PaginatedMembershipReportResponse(ApiModel):
    items: list[MembershipReportItemResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int
    summary: MembershipSummaryResponse


class CountPoint(ApiModel):
    id: str | None = None
    name: str
    value: int = Field(ge=0)


class AgendaWeeklyPoint(ApiModel):
    label: str
    completed: int = Field(ge=0)
    no_show: int = Field(ge=0)


class AgendaReportSummaryResponse(ApiModel):
    period: AgendaReportPeriod
    branch_id: UUID | None
    total_appointments: int = Field(ge=0)
    attended_count: int = Field(ge=0)
    no_show_count: int = Field(ge=0)
    cancelled_count: int = Field(ge=0)
    self_booking_count: int = Field(ge=0)
    attendance_rate: DecimalString
    status_distribution: list[CountPoint]
    weekly: list[AgendaWeeklyPoint]
    by_employee: list[CountPoint]
    by_source: list[CountPoint]


class AgendaReportItemResponse(ApiModel):
    id: UUID
    branch_id: UUID
    branch_name: str
    employee_id: UUID | None
    employee_name: str | None
    date: date
    time: str
    customer_name: str
    service_name: str
    status: AppointmentStatus
    source: Literal["staff", "self"]
    created_by: str
    updated_by: str
    created_at: datetime
    updated_at: datetime


class PaginatedAgendaReportResponse(ApiModel):
    items: list[AgendaReportItemResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class InventoryCategoryOption(ApiModel):
    id: UUID
    name: str


class InventoryValueCategory(ApiModel):
    id: UUID
    name: str
    value: DecimalString


class InventoryMarginPoint(ApiModel):
    label: str
    margin: DecimalString


class InventoryStockPoint(ApiModel):
    label: str
    value: DecimalString


class InventoryReportSummaryResponse(ApiModel):
    branch_id: UUID | None
    products_with_stock: int = Field(ge=0)
    value_at_cost: DecimalString
    value_at_sale: DecimalString
    low_stock_count: int = Field(ge=0)
    stock: list[InventoryStockPoint]
    value_by_category: list[InventoryValueCategory]
    margins: list[InventoryMarginPoint]
    categories: list[InventoryCategoryOption]


class InventoryReportItemResponse(ApiModel):
    id: UUID
    name: str
    category_id: UUID
    category_name: str
    cost: DecimalString
    price: DecimalString
    stock: DecimalString
    minimum_stock: DecimalString
    stock_value_cost: DecimalString
    stock_value_sale: DecimalString
    sold: DecimalString
    revenue: DecimalString
    profit: DecimalString
    margin_pct: DecimalString


class PaginatedInventoryReportResponse(ApiModel):
    items: list[InventoryReportItemResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class DividendSummaryResponse(ApiModel):
    partners: int = Field(ge=0)
    branches: int = Field(ge=0)
    total_dividends: DecimalString
    undistributed_profit: DecimalString


class DividendReportItemResponse(ApiModel):
    id: str
    partner_name: str
    document: str | None
    branch_id: UUID
    branch_name: str
    share: DecimalString
    dividend: DecimalString
    total_branch_profit: DecimalString


class PaginatedDividendReportResponse(ApiModel):
    items: list[DividendReportItemResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int
    summary: DividendSummaryResponse


class PersonalTotalsResponse(ApiModel):
    sales_total: DecimalString
    sales_count: int = Field(ge=0)
    appointments_attended: int = Field(ge=0)
    appointments_created: int = Field(ge=0)
    transactions: int = Field(ge=0)
    employee_incidents: int = Field(ge=0)
    vacation_days: int = Field(ge=0)
    supplies_used: DecimalString
    team_average_attended: DecimalString


class PersonalUserResponse(ApiModel):
    id: UUID
    name: str
    role: str
    sales_count: int = Field(ge=0)
    sales_total: DecimalString
    appointments_created: int = Field(ge=0)
    avg_ticket: DecimalString


class PersonalEmployeeResponse(ApiModel):
    id: UUID
    name: str
    position: str
    department: str
    appointments_attended: int = Field(ge=0)
    attendance_vs_team_pct: DecimalString
    no_shows: int = Field(ge=0)
    incident_count: int = Field(ge=0)
    supply_quantity: DecimalString
    revenue: DecimalString
    avg_ticket: DecimalString


class PersonalIncidentMetricsResponse(ApiModel):
    employee_id: UUID
    employee_name: str
    total: int = Field(ge=0)
    open_count: int = Field(ge=0)
    absences: int = Field(ge=0)
    vacations: int = Field(ge=0)
    vacation_days: int = Field(ge=0)
    warnings: int = Field(ge=0)
    lateness: int = Field(ge=0)
    medical_leave: int = Field(ge=0)
    other: int = Field(ge=0)


class PersonalSupplyUsageResponse(ApiModel):
    employee_id: UUID
    employee_name: str
    supply_id: UUID
    supply_name: str
    qty: DecimalString
    appointments_count: int = Field(ge=0)
    per_appointment: DecimalString | None
    summary: str


class PersonalReportResponse(ApiModel):
    period: ReportPeriod
    branch_id: UUID | None
    totals: PersonalTotalsResponse
    by_user: list[PersonalUserResponse]
    by_employee: list[PersonalEmployeeResponse]
    incident_metrics: list[PersonalIncidentMetricsResponse]
    incident_distribution: list[CountPoint]
    supply_usage: list[PersonalSupplyUsageResponse]
