from math import ceil
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, status

from app.api.deps import CurrentPrincipal, DatabaseSession, enforce_carwash_mutation_rate_limit
from app.repositories.carwash import CarwashCatalogRecord, CarwashServiceRecord
from app.schemas.carwash import (
    CarwashCatalogServiceResponse,
    CarwashFormOptionsResponse,
    CarwashOptionReference,
    CarwashServiceBatchResponse,
    CarwashServiceResponse,
    CreateCarwashServicesRequest,
    PaginatedCarwashOptionsResponse,
    PaginatedCarwashServicesResponse,
    UpdateCarwashServiceRequest,
)
from app.schemas.common import ErrorResponse
from app.services.authorization import AuthorizationService
from app.services.carwash import CarwashService

router = APIRouter(prefix="/api/v1/carwash", tags=["carwash"])
_RESPONSES: dict[int | str, dict[str, Any]] = {
    code: {"model": ErrorResponse} for code in (400, 401, 403, 404, 409)
}


def catalog_response(record: CarwashCatalogRecord) -> CarwashCatalogServiceResponse:
    return CarwashCatalogServiceResponse(
        item_id=record.item.id,
        name=record.item.name,
        category_id=record.category.id,
        category_name=record.category.name,
        sale_price=record.profile.sale_price if record.profile else None,
        tax_rate=record.profile.tax_rate if record.profile else None,
        catalog_version=record.item.version,
        available=record.unavailable_reason is None,
        unavailable_reason=record.unavailable_reason,
    )


def service_response(record: CarwashServiceRecord) -> CarwashServiceResponse:
    config = record.config
    return CarwashServiceResponse(
        **catalog_response(record.catalog).model_dump(),
        id=config.id,
        branch_id=config.branch_id,
        enabled=config.enabled,
        washer_rate=config.washer_rate,
        supervisor_rate=config.supervisor_rate,
        version=config.version,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


@router.get("/services", responses=_RESPONSES)
def list_services(
    database: DatabaseSession,
    principal: CurrentPrincipal,
    branch_id: Annotated[UUID, Query(alias="branchId")],
    search: Annotated[str | None, Query(max_length=100)] = None,
    enabled: bool | None = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> PaginatedCarwashServicesResponse:
    service = CarwashService(database)
    service.settings_grant(principal, branch_id)
    records, total = service.repository.list_services(
        principal.workspace_id, branch_id, search, enabled, page, page_size
    )
    return PaginatedCarwashServicesResponse(
        items=[service_response(record) for record in records],
        page=page,
        page_size=page_size,
        total_items=total,
        total_pages=ceil(total / page_size),
    )


@router.get("/service-options", responses=_RESPONSES)
def service_options(
    database: DatabaseSession,
    principal: CurrentPrincipal,
    branch_id: Annotated[UUID, Query(alias="branchId")],
    search: Annotated[str | None, Query(max_length=100)] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> PaginatedCarwashOptionsResponse:
    service = CarwashService(database)
    service.settings_grant(principal, branch_id)
    records, total = service.repository.list_options(
        principal.workspace_id, branch_id, search, page, page_size
    )
    return PaginatedCarwashOptionsResponse(
        items=[catalog_response(record) for record in records],
        page=page,
        page_size=page_size,
        total_items=total,
        total_pages=ceil(total / page_size),
    )


@router.get("/form-options", responses=_RESPONSES)
def form_options(
    database: DatabaseSession,
    principal: CurrentPrincipal,
    branch_id: Annotated[UUID, Query(alias="branchId")],
) -> CarwashFormOptionsResponse:
    service = CarwashService(database)
    service.settings_grant(principal, branch_id)
    codes = AuthorizationService(database).permission_codes_for_branches(principal, {branch_id})[
        branch_id
    ]
    can_create = "inventory.manage" in codes
    return CarwashFormOptionsResponse(
        categories=[
            CarwashOptionReference(id=item.id, name=item.name)
            for item in service.repository.categories(principal.workspace_id)
        ]
        if can_create
        else [],
        units=[
            CarwashOptionReference(id=item.id, name=item.name, code=item.code)
            for item in service.repository.units(principal.workspace_id)
        ]
        if can_create
        else [],
        can_create_services=can_create,
        employee_count=service.repository.employee_count(principal.workspace_id, branch_id)
        if "employee.read" in codes
        else None,
    )


@router.post(
    "/services/batch",
    status_code=status.HTTP_201_CREATED,
    responses=_RESPONSES,
    dependencies=[Depends(enforce_carwash_mutation_rate_limit)],
)
def create_services(
    payload: CreateCarwashServicesRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> CarwashServiceBatchResponse:
    return CarwashServiceBatchResponse(
        items=[
            service_response(record)
            for record in CarwashService(database).create_batch(principal, payload, idempotency_key)
        ]
    )


@router.get("/services/{service_id}", responses=_RESPONSES)
def get_service(
    service_id: UUID, database: DatabaseSession, principal: CurrentPrincipal
) -> CarwashServiceResponse:
    return service_response(CarwashService(database).get(principal, service_id))


@router.patch(
    "/services/{service_id}",
    responses=_RESPONSES,
    dependencies=[Depends(enforce_carwash_mutation_rate_limit)],
)
def update_service(
    service_id: UUID,
    payload: UpdateCarwashServiceRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
) -> CarwashServiceResponse:
    return service_response(CarwashService(database).update(principal, service_id, payload))
