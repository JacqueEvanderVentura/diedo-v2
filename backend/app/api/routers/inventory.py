from datetime import date
from decimal import Decimal
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Header, Query, Response, status

from app.api.deps import (
    CurrentPrincipal,
    DatabaseSession,
    InventoryManageGrant,
    InventoryMoveGrant,
    InventoryReadGrant,
)
from app.db.models import AssetCategory
from app.repositories.inventory import (
    AssetRecord,
    BranchRecord,
    InventoryItemRecord,
    MovementRecord,
    WarehouseRecord,
)
from app.schemas.common import ErrorResponse
from app.schemas.inventory import (
    AssetCategoryResponse,
    AssetResponse,
    AssetSortField,
    AssetStatus,
    AssetSummaryResponse,
    CreateAdjustmentMovementRequest,
    CreateAssetCategoryRequest,
    CreateAssetRequest,
    CreateInventoryProductRequest,
    CreateInventoryServiceRequest,
    CreateInventorySupplyRequest,
    CreateOutboundMovementRequest,
    InventoryAppointmentReference,
    InventoryBranchReference,
    InventoryCategoryReference,
    InventoryEmployeeReference,
    InventoryItemResponse,
    InventoryItemSortField,
    InventoryItemStatus,
    InventoryItemType,
    InventoryMovementLineResponse,
    InventoryMovementResponse,
    InventoryMovementType,
    InventoryStockFilter,
    InventoryStockLocationResponse,
    InventorySummaryResponse,
    InventoryUnitReference,
    InventoryWarehouseResponse,
    MovementSortField,
    PaginatedAssetsResponse,
    PaginatedInventoryItemsResponse,
    PaginatedInventoryMovementsResponse,
    SortDirection,
    SupplyUsageResponse,
    UpdateAssetRequest,
    UpdateInventoryItemRequest,
)
from app.services.inventory import InventoryService, page_count

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])

_SECURITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
}


def _branch_response(branch: BranchRecord) -> InventoryBranchReference:
    return InventoryBranchReference(id=branch.id, code=branch.code, name=branch.name)


def _warehouse_response(record: WarehouseRecord) -> InventoryWarehouseResponse:
    warehouse = record.warehouse
    return InventoryWarehouseResponse(
        id=warehouse.id,
        branch=_branch_response(record.branch),
        code=warehouse.code,
        name=warehouse.name,
        is_default=warehouse.is_default,
        status=cast(Any, warehouse.status),
        version=warehouse.version,
    )


def _stock_status(quantity: Decimal, minimum: Decimal) -> str:
    if quantity == 0:
        return "out"
    if quantity <= minimum:
        return "low"
    return "available"


def _item_response(record: InventoryItemRecord) -> InventoryItemResponse:
    item = record.item
    if record.stock_quantity is None or record.minimum_stock is None:
        aggregate_status = "not_tracked"
    else:
        aggregate_status = _stock_status(record.stock_quantity, record.minimum_stock)
    profile = record.profile
    return InventoryItemResponse(
        id=item.id,
        item_type=cast(Any, item.item_type),
        name=item.name,
        description=item.description,
        sku=item.sku,
        category=InventoryCategoryReference(id=record.category.id, name=record.category.name),
        unit_of_measure=InventoryUnitReference(
            id=record.unit.id,
            code=record.unit.code,
            name=record.unit.name,
            symbol=record.unit.symbol,
        ),
        branches=[_branch_response(branch) for branch in record.branches],
        stock_locations=[
            InventoryStockLocationResponse(
                branch=_branch_response(location.branch),
                warehouse_id=location.balance.warehouse_id,
                warehouse_name=location.warehouse_name,
                quantity=location.balance.quantity,
                minimum_stock=location.balance.minimum_quantity,
                stock_status=cast(
                    Any,
                    _stock_status(
                        location.balance.quantity,
                        location.balance.minimum_quantity,
                    ),
                ),
                version=location.balance.version,
            )
            for location in record.stock_locations
        ],
        sale_price=profile.sale_price if profile else None,
        unit_cost=profile.unit_cost if profile else None,
        tax_rate=profile.tax_rate if profile else Decimal("0"),
        stock_quantity=record.stock_quantity,
        minimum_stock=record.minimum_stock,
        stock_status=cast(Any, aggregate_status),
        status=cast(Any, item.status),
        version=item.version,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _asset_category_response(category: AssetCategory) -> AssetCategoryResponse:
    return AssetCategoryResponse(
        id=category.id,
        code=category.code,
        name=category.name,
        status=cast(Any, category.status),
        version=category.version,
    )


def _asset_response(record: AssetRecord) -> AssetResponse:
    asset = record.asset
    return AssetResponse(
        id=asset.id,
        name=asset.name,
        code=asset.code,
        category=_asset_category_response(record.category),
        branch=_branch_response(record.branch),
        acquisition_value=asset.acquisition_value,
        status=cast(Any, asset.status),
        location=asset.location,
        purchase_date=asset.purchase_date,
        notes=asset.notes,
        version=asset.version,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
    )


def _movement_response(record: MovementRecord) -> InventoryMovementResponse:
    movement = record.movement
    warehouse = _warehouse_response(
        WarehouseRecord(warehouse=record.warehouse, branch=record.branch)
    )
    return InventoryMovementResponse(
        id=movement.id,
        movement_type=cast(Any, movement.movement_type),
        branch=_branch_response(record.branch),
        warehouse=warehouse,
        employee=(
            InventoryEmployeeReference(
                id=movement.employee_id,
                name=record.employee_name or "Empleado",
            )
            if movement.employee_id is not None
            else None
        ),
        appointment=(
            InventoryAppointmentReference(
                id=movement.appointment_id,
                label=record.appointment_label or "Cita",
            )
            if movement.appointment_id is not None
            else None
        ),
        comment=movement.comment,
        items=[
            InventoryMovementLineResponse(
                id=line.id,
                item_id=line.item_id,
                item_name=line.item_name,
                item_sku=line.item_sku,
                unit_symbol=line.unit_symbol,
                quantity_delta=line.quantity_delta,
                quantity_before=line.quantity_before,
                quantity_after=line.quantity_after,
                unit_cost=line.unit_cost_snapshot,
            )
            for line in record.lines
        ],
        created_by=record.created_by_name,
        created_at=movement.created_at,
    )


@router.get("/summary", responses=_SECURITY_RESPONSES)
def get_inventory_summary(
    response: Response,
    database: DatabaseSession,
    grant: InventoryReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> InventorySummaryResponse:
    response.headers["Cache-Control"] = "no-store"
    summary = InventoryService(database).summary(grant, branch_id)
    return InventorySummaryResponse(
        total_products=summary.total_products,
        total_supplies=summary.total_supplies,
        low_stock=summary.low_stock,
        out_of_stock=summary.out_of_stock,
        total_value=summary.total_value,
    )


@router.get("/warehouses", responses=_SECURITY_RESPONSES)
def list_warehouses(
    database: DatabaseSession,
    grant: InventoryReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> list[InventoryWarehouseResponse]:
    return [
        _warehouse_response(record)
        for record in InventoryService(database).list_warehouses(grant, branch_id)
    ]


@router.get("/items", responses=_SECURITY_RESPONSES)
def list_inventory_items(
    response: Response,
    database: DatabaseSession,
    grant: InventoryReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
    item_type: Annotated[InventoryItemType | None, Query(alias="itemType")] = None,
    category_id: Annotated[UUID | None, Query(alias="categoryId")] = None,
    status_filter: Annotated[InventoryItemStatus | None, Query(alias="status")] = None,
    stock_status: Annotated[InventoryStockFilter | None, Query(alias="stockStatus")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
    sort_by: Annotated[InventoryItemSortField, Query(alias="sortBy")] = "name",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "asc",
) -> PaginatedInventoryItemsResponse:
    response.headers["Cache-Control"] = "no-store"
    result = InventoryService(database).list_items(
        grant=grant,
        branch_id=branch_id,
        search=search,
        item_type=item_type,
        category_id=category_id,
        status=status_filter,
        stock_status=stock_status,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return PaginatedInventoryItemsResponse(
        items=[_item_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=page_count(result.total_items, page_size),
    )


@router.post(
    "/products",
    status_code=status.HTTP_201_CREATED,
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def create_inventory_product(
    payload: CreateInventoryProductRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: InventoryManageGrant,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> InventoryItemResponse:
    return _item_response(
        InventoryService(database).create_item(
            principal=principal,
            grant=grant,
            item_type="product",
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.post(
    "/supplies",
    status_code=status.HTTP_201_CREATED,
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def create_inventory_supply(
    payload: CreateInventorySupplyRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: InventoryManageGrant,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> InventoryItemResponse:
    values = payload.model_dump(by_alias=False)
    values.update({"sale_price": None, "tax_rate": Decimal("0")})
    return _item_response(
        InventoryService(database).create_item(
            principal=principal,
            grant=grant,
            item_type="supply",
            values=values,
            idempotency_key=idempotency_key,
        )
    )


@router.post(
    "/services",
    status_code=status.HTTP_201_CREATED,
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def create_inventory_service(
    payload: CreateInventoryServiceRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: InventoryManageGrant,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> InventoryItemResponse:
    values = payload.model_dump(by_alias=False)
    values.update({"unit_cost": None, "stock": None, "minimum_stock": None})
    return _item_response(
        InventoryService(database).create_item(
            principal=principal,
            grant=grant,
            item_type="service",
            values=values,
            idempotency_key=idempotency_key,
        )
    )


@router.get("/items/{item_id}", responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}})
def get_inventory_item(
    item_id: UUID,
    database: DatabaseSession,
    grant: InventoryReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> InventoryItemResponse:
    return _item_response(InventoryService(database).get_item(grant, item_id, branch_id))


@router.patch(
    "/items/{item_id}",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def update_inventory_item(
    item_id: UUID,
    payload: UpdateInventoryItemRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: InventoryManageGrant,
) -> InventoryItemResponse:
    return _item_response(
        InventoryService(database).update_item(
            principal=principal,
            grant=grant,
            item_id=item_id,
            expected_version=payload.version,
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        )
    )


@router.get("/asset-categories", responses=_SECURITY_RESPONSES)
def list_asset_categories(
    database: DatabaseSession,
    grant: InventoryReadGrant,
) -> list[AssetCategoryResponse]:
    return [
        _asset_category_response(category)
        for category in InventoryService(database).list_asset_categories(grant)
    ]


@router.post(
    "/asset-categories",
    status_code=status.HTTP_201_CREATED,
    responses={**_SECURITY_RESPONSES, 409: {"model": ErrorResponse}},
)
def create_asset_category(
    payload: CreateAssetCategoryRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: InventoryManageGrant,
) -> AssetCategoryResponse:
    return _asset_category_response(
        InventoryService(database).create_asset_category(
            principal=principal,
            grant=grant,
            code=payload.code,
            name=payload.name,
        )
    )


@router.get("/assets/summary", responses=_SECURITY_RESPONSES)
def get_asset_summary(
    response: Response,
    database: DatabaseSession,
    grant: InventoryReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> AssetSummaryResponse:
    response.headers["Cache-Control"] = "no-store"
    summary = InventoryService(database).asset_summary(grant, branch_id)
    return AssetSummaryResponse(
        total_value=summary.total_value,
        operational=summary.operational,
        in_repair=summary.in_repair,
        retired=summary.retired,
    )


@router.get("/assets", responses=_SECURITY_RESPONSES)
def list_assets(
    response: Response,
    database: DatabaseSession,
    grant: InventoryReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
    category_id: Annotated[UUID | None, Query(alias="categoryId")] = None,
    status_filter: Annotated[AssetStatus | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
    sort_by: Annotated[AssetSortField, Query(alias="sortBy")] = "name",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "asc",
) -> PaginatedAssetsResponse:
    response.headers["Cache-Control"] = "no-store"
    result = InventoryService(database).list_assets(
        grant=grant,
        branch_id=branch_id,
        search=search,
        category_id=category_id,
        status=status_filter,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return PaginatedAssetsResponse(
        items=[_asset_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=page_count(result.total_items, page_size),
    )


@router.post(
    "/assets",
    status_code=status.HTTP_201_CREATED,
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def create_asset(
    payload: CreateAssetRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: InventoryManageGrant,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> AssetResponse:
    return _asset_response(
        InventoryService(database).create_asset(
            principal=principal,
            grant=grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.get("/assets/{asset_id}", responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}})
def get_asset(
    asset_id: UUID,
    database: DatabaseSession,
    grant: InventoryReadGrant,
) -> AssetResponse:
    return _asset_response(InventoryService(database).get_asset(grant, asset_id))


@router.patch(
    "/assets/{asset_id}",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def update_asset(
    asset_id: UUID,
    payload: UpdateAssetRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: InventoryManageGrant,
) -> AssetResponse:
    return _asset_response(
        InventoryService(database).update_asset(
            principal=principal,
            grant=grant,
            asset_id=asset_id,
            expected_version=payload.version,
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        )
    )


@router.get("/movements", responses={**_SECURITY_RESPONSES, 400: {"model": ErrorResponse}})
def list_inventory_movements(
    response: Response,
    database: DatabaseSession,
    grant: InventoryReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
    movement_type: Annotated[InventoryMovementType | None, Query(alias="type")] = None,
    item_id: Annotated[UUID | None, Query(alias="itemId")] = None,
    employee_id: Annotated[UUID | None, Query(alias="employeeId")] = None,
    date_from: Annotated[date | None, Query(alias="dateFrom")] = None,
    date_to: Annotated[date | None, Query(alias="dateTo")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
    sort_by: Annotated[MovementSortField, Query(alias="sortBy")] = "createdAt",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "desc",
) -> PaginatedInventoryMovementsResponse:
    response.headers["Cache-Control"] = "no-store"
    result = InventoryService(database).list_movements(
        grant=grant,
        branch_id=branch_id,
        search=search,
        movement_type=movement_type,
        item_id=item_id,
        employee_id=employee_id,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return PaginatedInventoryMovementsResponse(
        items=[_movement_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=page_count(result.total_items, page_size),
    )


@router.post(
    "/movements/outbound",
    status_code=status.HTTP_201_CREATED,
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def create_outbound_movement(
    payload: CreateOutboundMovementRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: InventoryMoveGrant,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> InventoryMovementResponse:
    return _movement_response(
        InventoryService(database).create_outbound_movement(
            principal=principal,
            grant=grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.post(
    "/movements/adjustments",
    status_code=status.HTTP_201_CREATED,
    responses={
        **_SECURITY_RESPONSES,
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def create_adjustment_movement(
    payload: CreateAdjustmentMovementRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: InventoryMoveGrant,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> InventoryMovementResponse:
    return _movement_response(
        InventoryService(database).create_adjustment_movement(
            principal=principal,
            grant=grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.get(
    "/movements/{movement_id}", responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}}
)
def get_inventory_movement(
    movement_id: UUID,
    response: Response,
    database: DatabaseSession,
    grant: InventoryReadGrant,
) -> InventoryMovementResponse:
    response.headers["Cache-Control"] = "no-store"
    return _movement_response(InventoryService(database).get_movement(grant, movement_id))


@router.get("/supply-usage", responses=_SECURITY_RESPONSES)
def get_supply_usage(
    response: Response,
    database: DatabaseSession,
    grant: InventoryReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> list[SupplyUsageResponse]:
    response.headers["Cache-Control"] = "no-store"
    records = InventoryService(database).supply_usage(grant, branch_id)
    return [
        SupplyUsageResponse(
            employee_id=record.employee_id,
            employee_name=record.employee_name,
            supply_id=record.supply_id,
            supply_name=record.supply_name,
            quantity=record.quantity,
            appointments_count=record.appointments_count,
            per_appointment=(
                record.quantity / record.appointments_count if record.appointments_count else None
            ),
        )
        for record in records
    ]
