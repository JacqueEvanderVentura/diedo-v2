from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.api.deps import CurrentPrincipal, DatabaseSession
from app.api.routers.carwash_operations import _RESPONSES, BranchQuery
from app.schemas.carwash_reports import CarwashIndicators, CarwashReportFilters, CarwashReports
from app.services.carwash_reports import CarwashReportService

router = APIRouter(prefix="/api/v1/carwash", tags=["carwash"], responses=_RESPONSES)


@router.get("/indicators")
def indicators(
    database: DatabaseSession,
    principal: CurrentPrincipal,
    branch_id: BranchQuery,
    response: Response,
) -> CarwashIndicators:
    response.headers["Cache-Control"] = "no-store"
    return CarwashReportService(database).indicators(principal, branch_id)


@router.get("/reports")
def reports(
    database: DatabaseSession,
    principal: CurrentPrincipal,
    filters: Annotated[CarwashReportFilters, Query()],
    response: Response,
) -> CarwashReports:
    response.headers["Cache-Control"] = "no-store"
    return CarwashReportService(database).reports(principal, filters)
