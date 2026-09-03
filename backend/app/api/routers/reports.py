from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.api.deps import DatabaseSession, ReportReadGrant
from app.schemas.common import ErrorResponse
from app.schemas.reports import (
    AgendaReportPeriod,
    AgendaReportSummaryResponse,
    AppointmentStatus,
    GeneralReportSummaryResponse,
    InventoryReportSummaryResponse,
    MembershipStatus,
    PaginatedAgendaReportResponse,
    PaginatedDividendReportResponse,
    PaginatedExpenseCategoriesResponse,
    PaginatedGeneralTransactionsResponse,
    PaginatedInventoryReportResponse,
    PaginatedMembershipReportResponse,
    PersonalReportResponse,
    ReportPeriod,
    SortDirection,
)
from app.services.reports import ReportsService

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

_SECURITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
}


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


@router.get(
    "/general/summary",
    summary="Obtener el resumen financiero general",
    responses=_SECURITY_RESPONSES,
)
def get_general_summary(
    database: DatabaseSession,
    grant: ReportReadGrant,
    response: Response,
    period: Annotated[ReportPeriod, Query()] = "month",
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> GeneralReportSummaryResponse:
    result = ReportsService(database).general_summary(grant, period=period, branch_id=branch_id)
    _no_store(response)
    return result


@router.get(
    "/general/transactions",
    summary="Listar movimientos del reporte general",
    responses=_SECURITY_RESPONSES,
)
def list_general_transactions(
    database: DatabaseSession,
    grant: ReportReadGrant,
    response: Response,
    period: Annotated[ReportPeriod, Query()] = "month",
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    transaction_type: Annotated[Literal["ingreso", "gasto"] | None, Query(alias="type")] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 10,
    sort_key: Annotated[
        Literal["date", "category", "branchId", "type", "amount"],
        Query(alias="sortKey"),
    ] = "date",
    sort_direction: Annotated[SortDirection, Query(alias="sortDir")] = "desc",
) -> PaginatedGeneralTransactionsResponse:
    result = ReportsService(database).general_transactions(
        grant,
        period=period,
        branch_id=branch_id,
        transaction_type=transaction_type,
        search=search,
        page=page,
        page_size=page_size,
        sort_key=sort_key,
        sort_direction=sort_direction,
    )
    _no_store(response)
    return result


@router.get(
    "/general/expense-categories",
    summary="Listar gastos agrupados por categoría",
    responses=_SECURITY_RESPONSES,
)
def list_expense_categories(
    database: DatabaseSession,
    grant: ReportReadGrant,
    response: Response,
    period: Annotated[ReportPeriod, Query()] = "month",
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 10,
    sort_key: Annotated[Literal["name", "amount", "pct"], Query(alias="sortKey")] = "amount",
    sort_direction: Annotated[SortDirection, Query(alias="sortDir")] = "desc",
) -> PaginatedExpenseCategoriesResponse:
    result = ReportsService(database).expense_categories(
        grant,
        period=period,
        branch_id=branch_id,
        search=search,
        page=page,
        page_size=page_size,
        sort_key=sort_key,
        sort_direction=sort_direction,
    )
    _no_store(response)
    return result


@router.get(
    "/memberships",
    summary="Listar membresías comerciales de clientes",
    responses=_SECURITY_RESPONSES,
)
def list_memberships(
    database: DatabaseSession,
    grant: ReportReadGrant,
    response: Response,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    status: Annotated[MembershipStatus | None, Query()] = None,
    plan: Annotated[str | None, Query(max_length=160)] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 10,
    sort_key: Annotated[
        Literal["clientName", "plan", "branchId", "amount", "status", "lastPayment"],
        Query(alias="sortKey"),
    ] = "clientName",
    sort_direction: Annotated[SortDirection, Query(alias="sortDir")] = "asc",
) -> PaginatedMembershipReportResponse:
    result = ReportsService(database).memberships(
        grant,
        branch_id=branch_id,
        status=status,
        plan=plan,
        search=search,
        page=page,
        page_size=page_size,
        sort_key=sort_key,
        sort_direction=sort_direction,
    )
    _no_store(response)
    return result


@router.get(
    "/agenda/summary",
    summary="Obtener KPIs del reporte de agenda",
    responses=_SECURITY_RESPONSES,
)
def get_agenda_summary(
    database: DatabaseSession,
    grant: ReportReadGrant,
    response: Response,
    period: Annotated[AgendaReportPeriod, Query()] = "month",
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    status: Annotated[AppointmentStatus | None, Query()] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
) -> AgendaReportSummaryResponse:
    result = ReportsService(database).agenda_summary(
        grant,
        period=period,
        branch_id=branch_id,
        status=status,
        search=search,
    )
    _no_store(response)
    return result


@router.get(
    "/agenda/appointments",
    summary="Listar citas para el reporte de agenda",
    responses=_SECURITY_RESPONSES,
)
def list_agenda_appointments(
    database: DatabaseSession,
    grant: ReportReadGrant,
    response: Response,
    period: Annotated[AgendaReportPeriod, Query()] = "month",
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    status: Annotated[AppointmentStatus | None, Query()] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 10,
    sort_key: Annotated[
        Literal[
            "date",
            "time",
            "customerName",
            "employeeName",
            "serviceName",
            "branchId",
            "status",
            "createdBy",
            "updatedBy",
        ],
        Query(alias="sortKey"),
    ] = "date",
    sort_direction: Annotated[SortDirection, Query(alias="sortDir")] = "desc",
) -> PaginatedAgendaReportResponse:
    result = ReportsService(database).agenda_items(
        grant,
        period=period,
        branch_id=branch_id,
        status=status,
        search=search,
        page=page,
        page_size=page_size,
        sort_key=sort_key,
        sort_direction=sort_direction,
    )
    _no_store(response)
    return result


@router.get(
    "/inventory/summary",
    summary="Obtener KPIs del reporte de inventario",
    responses=_SECURITY_RESPONSES,
)
def get_inventory_summary(
    database: DatabaseSession,
    grant: ReportReadGrant,
    response: Response,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    category_id: Annotated[UUID | None, Query(alias="categoryId")] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
) -> InventoryReportSummaryResponse:
    result = ReportsService(database).inventory_summary(
        grant, branch_id=branch_id, category_id=category_id, search=search
    )
    _no_store(response)
    return result


@router.get(
    "/inventory/items",
    summary="Listar productos para el reporte de inventario",
    responses=_SECURITY_RESPONSES,
)
def list_inventory_items(
    database: DatabaseSession,
    grant: ReportReadGrant,
    response: Response,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    category_id: Annotated[UUID | None, Query(alias="categoryId")] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 10,
    sort_key: Annotated[
        Literal[
            "name",
            "category",
            "cost",
            "price",
            "stock",
            "stockValueCost",
            "stockValueSale",
            "sold",
            "revenue",
            "profit",
            "marginPct",
        ],
        Query(alias="sortKey"),
    ] = "name",
    sort_direction: Annotated[SortDirection, Query(alias="sortDir")] = "asc",
) -> PaginatedInventoryReportResponse:
    result = ReportsService(database).inventory_items(
        grant,
        branch_id=branch_id,
        category_id=category_id,
        search=search,
        page=page,
        page_size=page_size,
        sort_key=sort_key,
        sort_direction=sort_direction,
    )
    _no_store(response)
    return result


@router.get(
    "/dividends",
    summary="Listar distribución de utilidades entre socios",
    responses=_SECURITY_RESPONSES,
)
def list_dividends(
    database: DatabaseSession,
    grant: ReportReadGrant,
    response: Response,
    period: Annotated[ReportPeriod, Query()] = "month",
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 10,
    sort_key: Annotated[
        Literal["partnerName", "branchName", "share", "dividend"],
        Query(alias="sortKey"),
    ] = "dividend",
    sort_direction: Annotated[SortDirection, Query(alias="sortDir")] = "desc",
) -> PaginatedDividendReportResponse:
    result = ReportsService(database).dividends(
        grant,
        period=period,
        branch_id=branch_id,
        search=search,
        page=page,
        page_size=page_size,
        sort_key=sort_key,
        sort_direction=sort_direction,
    )
    _no_store(response)
    return result


@router.get(
    "/personal",
    summary="Obtener desempeño de usuarios y empleados",
    responses=_SECURITY_RESPONSES,
)
def get_personal_report(
    database: DatabaseSession,
    grant: ReportReadGrant,
    response: Response,
    period: Annotated[ReportPeriod, Query()] = "month",
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
) -> PersonalReportResponse:
    result = ReportsService(database).personal(
        grant,
        period=period,
        branch_id=branch_id,
        search=search,
    )
    _no_store(response)
    return result
