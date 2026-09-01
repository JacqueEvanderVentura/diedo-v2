from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.api.deps import DashboardReadGrant, DatabaseSession
from app.schemas.common import ErrorResponse
from app.schemas.dashboard import (
    DashboardActivityListResponse,
    DashboardActivityResponse,
    DashboardAppointmentResponse,
    DashboardAppointmentsResponse,
    DashboardPeriod,
    DashboardSalesTrendResponse,
    DashboardStockAlertResponse,
    DashboardStockAlertsResponse,
    DashboardSummaryResponse,
    SalesTrendPointResponse,
)
from app.services.dashboard import DashboardService

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])

_SECURITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
}


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


@router.get(
    "/summary",
    summary="Obtener KPIs principales del dashboard",
    responses=_SECURITY_RESPONSES,
)
def get_dashboard_summary(
    database: DatabaseSession,
    grant: DashboardReadGrant,
    response: Response,
    period: Annotated[DashboardPeriod, Query()] = "week",
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> DashboardSummaryResponse:
    result = DashboardService(database).summary(grant, period=period, branch_id=branch_id)
    _no_store(response)
    return DashboardSummaryResponse(
        period=result.context.period,
        branch_id=result.context.branch_id,
        starts_at=result.context.starts_at,
        ends_at=result.context.ends_at,
        currency_code=result.context.currency_code,
        revenue=result.revenue,
        appointments_today=result.appointments_today,
        open_tasks=result.open_tasks,
        generated_at=result.context.generated_at,
    )


@router.get(
    "/sales-trend",
    summary="Obtener tendencia de ventas del período",
    responses=_SECURITY_RESPONSES,
)
def get_dashboard_sales_trend(
    database: DatabaseSession,
    grant: DashboardReadGrant,
    response: Response,
    period: Annotated[DashboardPeriod, Query()] = "week",
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> DashboardSalesTrendResponse:
    result = DashboardService(database).sales_trend(grant, period=period, branch_id=branch_id)
    _no_store(response)
    return DashboardSalesTrendResponse(
        period=result.context.period,
        branch_id=result.context.branch_id,
        starts_at=result.context.starts_at,
        ends_at=result.context.ends_at,
        currency_code=result.context.currency_code,
        total=result.total,
        points=[
            SalesTrendPointResponse(label=item.label, value=item.value) for item in result.points
        ],
    )


@router.get(
    "/stock-alerts",
    summary="Obtener balances con stock bajo o agotado",
    responses=_SECURITY_RESPONSES,
)
def get_dashboard_stock_alerts(
    database: DatabaseSession,
    grant: DashboardReadGrant,
    response: Response,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> DashboardStockAlertsResponse:
    records = DashboardService(database).stock_alerts(grant, branch_id=branch_id, limit=limit)
    _no_store(response)
    return DashboardStockAlertsResponse(
        items=[
            DashboardStockAlertResponse(
                id=record.balance.id,
                item_id=record.item.id,
                branch_id=record.branch.id,
                branch_name=record.branch.name,
                name=record.item.name,
                sku=record.item.sku,
                units=record.balance.quantity,
                minimum_units=record.balance.minimum_quantity,
                level="critical" if record.balance.quantity <= 0 else "low",
            )
            for record in records
        ]
    )


@router.get(
    "/appointments",
    summary="Obtener las citas de hoy",
    responses=_SECURITY_RESPONSES,
)
def get_dashboard_appointments(
    database: DatabaseSession,
    grant: DashboardReadGrant,
    response: Response,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> DashboardAppointmentsResponse:
    scheduled_date, appointments = DashboardService(database).appointments_today(
        grant, branch_id=branch_id, limit=limit
    )
    _no_store(response)
    return DashboardAppointmentsResponse(
        date=scheduled_date,
        items=[
            DashboardAppointmentResponse(
                id=item.id,
                branch_id=item.branch_id,
                customer_name=item.customer_name,
                service_name=item.service_name,
                date=item.scheduled_date,
                time=item.scheduled_time.strftime("%H:%M"),
                status=item.status,  # type: ignore[arg-type]
            )
            for item in appointments
        ],
    )


@router.get(
    "/activity",
    summary="Obtener actividad operativa reciente",
    responses=_SECURITY_RESPONSES,
)
def get_dashboard_activity(
    database: DatabaseSession,
    grant: DashboardReadGrant,
    response: Response,
    period: Annotated[DashboardPeriod, Query()] = "week",
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> DashboardActivityListResponse:
    records = DashboardService(database).recent_activity(
        grant,
        period=period,
        branch_id=branch_id,
        limit=limit,
    )
    _no_store(response)
    return DashboardActivityListResponse(
        items=[
            DashboardActivityResponse(
                id=item.id,
                branch_id=item.branch_id,
                title=item.title,
                occurred_at=item.occurred_at,
                source=item.source,
                icon=item.icon,
                to=item.to,
            )
            for item in records
        ]
    )
