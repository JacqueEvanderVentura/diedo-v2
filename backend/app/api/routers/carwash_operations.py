from math import ceil
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query

from app.api.deps import CurrentPrincipal, DatabaseSession, enforce_carwash_mutation_rate_limit
from app.db.models import Workspace
from app.schemas.carwash_checkout import (
    CompleteWashRequest,
    PreviewWashRequest,
    VoidWashRequest,
    WashBillingResponse,
    WashCheckoutContext,
    WashPricePreview,
)
from app.schemas.carwash_operations import (
    CancelWashRequest,
    CreateWashRequest,
    OptionKind,
    UpdateWashRequest,
    WashActionRequest,
    WashContextResponse,
    WashOption,
    WashOptionPage,
    WashPage,
    WashResponse,
    WashStatus,
)
from app.schemas.common import ErrorResponse
from app.services.authorization import AuthorizationService
from app.services.carwash_checkout import CarwashCheckoutService
from app.services.carwash_operations import CarwashOperationsService, wash_response

_RESPONSES: dict[int | str, dict[str, Any]] = {
    code: {"model": ErrorResponse} for code in (400, 401, 403, 404, 409)
}
router = APIRouter(prefix="/api/v1/carwash", tags=["carwash"], responses=_RESPONSES)
BranchQuery = Annotated[UUID, Query(alias="branchId")]
PageQuery = Annotated[int, Query(ge=1, le=1_000_000)]
SizeQuery = Annotated[int, Query(alias="pageSize", ge=1, le=100)]
SearchQuery = Annotated[str | None, Query(max_length=100)]
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)]
MutationLimit = [Depends(enforce_carwash_mutation_rate_limit)]


@router.get("/operation-context")
def operation_context(
    database: DatabaseSession, principal: CurrentPrincipal, branch_id: BranchQuery
) -> WashContextResponse:
    service = CarwashOperationsService(database)
    service.grant(principal, branch_id)
    codes = AuthorizationService(database).permission_codes_for_branches(principal, {branch_id})[
        branch_id
    ]
    branch = service.catalog.branch(principal.workspace_id, branch_id)
    workspace = database.get(Workspace, principal.workspace_id)
    assert branch is not None and workspace is not None
    return WashContextResponse(
        can_complete={"carwash.wash.complete", "pos.sell"} <= codes,
        can_void={"carwash.wash.void", "sales.invoice.void"} <= codes,
        can_manage="carwash.wash.manage" in codes,
        can_create_customer="customer.manage" in codes,
        can_configure_services="carwash.settings.manage" in codes,
        can_manage_employees="employee.manage" in codes,
        timezone=branch.timezone,
        currency=workspace.default_currency,
    )


@router.get("/wash-options")
def wash_options(
    database: DatabaseSession,
    principal: CurrentPrincipal,
    branch_id: BranchQuery,
    kind: OptionKind,
    search: SearchQuery = None,
    page: PageQuery = 1,
    page_size: SizeQuery = 20,
) -> WashOptionPage:
    service = CarwashOperationsService(database)
    service.grant(principal, branch_id, manage=kind != "employees")
    rows, total = service.repository.options(
        principal.workspace_id, branch_id, kind, search, page, page_size
    )
    return WashOptionPage(
        items=[WashOption(**row) for row in rows],
        page=page,
        page_size=page_size,
        total_items=total,
        total_pages=ceil(total / page_size),
    )


@router.get("/washes")
def list_washes(
    database: DatabaseSession,
    principal: CurrentPrincipal,
    branch_id: BranchQuery,
    search: SearchQuery = None,
    status: WashStatus | None = None,
    employee_id: Annotated[UUID | None, Query(alias="employeeId")] = None,
    page: PageQuery = 1,
    page_size: SizeQuery = 20,
) -> WashPage:
    service = CarwashOperationsService(database)
    service.grant(principal, branch_id)
    rows, total = service.repository.list_washes(
        principal.workspace_id, branch_id, search, status, employee_id, page, page_size
    )
    lines = service.repository.lines(principal.workspace_id, [row.id for row in rows])
    return WashPage(
        items=[wash_response(row, lines[row.id]) for row in rows],
        page=page,
        page_size=page_size,
        total_items=total,
        total_pages=ceil(total / page_size),
    )


@router.post("/washes", status_code=201, dependencies=MutationLimit)
def create_wash(
    payload: CreateWashRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    idempotency_key: IdempotencyKey,
) -> WashResponse:
    return CarwashOperationsService(database).create(principal, payload, idempotency_key)


@router.get("/washes/{wash_id}")
def get_wash(wash_id: UUID, database: DatabaseSession, principal: CurrentPrincipal) -> WashResponse:
    service = CarwashOperationsService(database)
    return service.response(service.get(principal, wash_id))


@router.patch("/washes/{wash_id}", dependencies=MutationLimit)
def update_wash(
    wash_id: UUID,
    payload: UpdateWashRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
) -> WashResponse:
    return CarwashOperationsService(database).update(principal, wash_id, payload)


@router.post("/washes/{wash_id}/start", dependencies=MutationLimit)
def start_wash(
    wash_id: UUID,
    payload: WashActionRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    idempotency_key: IdempotencyKey,
) -> WashResponse:
    return CarwashOperationsService(database).action(principal, wash_id, payload, idempotency_key)


@router.post("/washes/{wash_id}/cancel", dependencies=MutationLimit)
def cancel_wash(
    wash_id: UUID,
    payload: CancelWashRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    idempotency_key: IdempotencyKey,
) -> WashResponse:
    return CarwashOperationsService(database).action(
        principal, wash_id, payload, idempotency_key, cancel=True
    )


@router.get("/washes/{wash_id}/checkout-context")
def checkout_context(
    wash_id: UUID, database: DatabaseSession, principal: CurrentPrincipal
) -> WashCheckoutContext:
    return CarwashCheckoutService(database).context(principal, wash_id)


@router.post("/washes/{wash_id}/preview", dependencies=MutationLimit)
def preview_wash(
    wash_id: UUID,
    payload: PreviewWashRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
) -> WashPricePreview:
    return CarwashCheckoutService(database).preview(principal, wash_id, payload)


@router.post("/washes/{wash_id}/complete", dependencies=MutationLimit)
def complete_wash(
    wash_id: UUID,
    payload: CompleteWashRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    idempotency_key: IdempotencyKey,
) -> WashResponse:
    return CarwashCheckoutService(database).complete(principal, wash_id, payload, idempotency_key)


@router.post("/washes/{wash_id}/void", dependencies=MutationLimit)
def void_wash(
    wash_id: UUID,
    payload: VoidWashRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    idempotency_key: IdempotencyKey,
) -> WashResponse:
    return CarwashCheckoutService(database).void(principal, wash_id, payload, idempotency_key)


@router.get("/washes/{wash_id}/billing")
def wash_billing(
    wash_id: UUID, database: DatabaseSession, principal: CurrentPrincipal
) -> WashBillingResponse:
    return CarwashCheckoutService(database).billing(principal, wash_id)
