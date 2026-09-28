from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentPrincipal, DatabaseSession, enforce_carwash_mutation_rate_limit
from app.api.routers.carwash_operations import (
    _RESPONSES,
    BranchQuery,
    IdempotencyKey,
    PageQuery,
    SizeQuery,
)
from app.schemas.carwash_commissions import (
    CommissionContext,
    CommissionFilters,
    CommissionPage,
    ReverseSettlementRequest,
    SettleCommissionsRequest,
    SettlementPage,
    SettlementResponse,
)
from app.services.carwash_commissions import CarwashCommissionService

router = APIRouter(prefix="/api/v1/carwash", tags=["carwash"], responses=_RESPONSES)


@router.get("/commission-context")
def commission_context(
    database: DatabaseSession, principal: CurrentPrincipal, branch_id: BranchQuery
) -> CommissionContext:
    return CarwashCommissionService(database).context(principal, branch_id)


@router.get("/commissions")
def list_commissions(
    database: DatabaseSession,
    principal: CurrentPrincipal,
    filters: Annotated[CommissionFilters, Query()],
) -> CommissionPage:
    service = CarwashCommissionService(database)
    context = service.context(principal, filters.branch_id)
    return service.repository.list_commissions(principal.workspace_id, filters, context.timezone)


@router.get("/settlements")
def list_settlements(
    database: DatabaseSession,
    principal: CurrentPrincipal,
    branch_id: BranchQuery,
    employee_id: Annotated[UUID | None, Query(alias="employeeId")] = None,
    page: PageQuery = 1,
    page_size: SizeQuery = 20,
) -> SettlementPage:
    return CarwashCommissionService(database).list_settlements(
        principal, branch_id, employee_id, page, page_size
    )


@router.post(
    "/settlements",
    status_code=201,
    dependencies=[Depends(enforce_carwash_mutation_rate_limit)],
)
def settle_commissions(
    payload: SettleCommissionsRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    idempotency_key: IdempotencyKey,
) -> SettlementResponse:
    return CarwashCommissionService(database).settle(principal, payload, idempotency_key)


@router.get("/settlements/{settlement_id}")
def get_settlement(
    settlement_id: UUID, database: DatabaseSession, principal: CurrentPrincipal
) -> SettlementResponse:
    service = CarwashCommissionService(database)
    return service.repository.response(service.get(principal, settlement_id))


@router.post(
    "/settlements/{settlement_id}/reverse",
    dependencies=[Depends(enforce_carwash_mutation_rate_limit)],
)
def reverse_settlement(
    settlement_id: UUID,
    payload: ReverseSettlementRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    idempotency_key: IdempotencyKey,
) -> SettlementResponse:
    return CarwashCommissionService(database).reverse(
        principal, settlement_id, payload, idempotency_key
    )
