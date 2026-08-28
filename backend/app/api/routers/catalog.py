from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.api.deps import (
    CatalogManageGrant,
    CatalogReadGrant,
    CurrentPrincipal,
    DatabaseSession,
)
from app.repositories.catalog import CategoryRecord, ProductRecord, UnitOfMeasureRecord
from app.schemas.catalog import (
    CatalogStatus,
    CategoryResponse,
    CategorySortField,
    CreateCategoryRequest,
    CreateProductRequest,
    PaginatedCategoriesResponse,
    PaginatedProductsResponse,
    ProductBranchReference,
    ProductCategoryReference,
    ProductResponse,
    ProductSortField,
    SortDirection,
    UnitOfMeasureResponse,
    UpdateCategoryRequest,
    UpdateProductRequest,
)
from app.schemas.common import ErrorResponse
from app.services.catalog import CatalogService

router = APIRouter(prefix="/api/v1/catalog", tags=["catalog"])

_SECURITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
}


def _category_response(category: CategoryRecord) -> CategoryResponse:
    return CategoryResponse(
        id=category.id,
        name=category.name,
        description=category.description,
        status=category.status,  # type: ignore[arg-type]
        version=category.version,
        created_at=category.created_at,
        updated_at=category.updated_at,
    )


def _unit_response(unit: UnitOfMeasureRecord) -> UnitOfMeasureResponse:
    return UnitOfMeasureResponse(
        id=unit.id,
        code=unit.code,
        name=unit.name,
        symbol=unit.symbol,
    )


def _product_response(product: ProductRecord) -> ProductResponse:
    return ProductResponse(
        id=product.id,
        name=product.name,
        description=product.description,
        sku=product.sku,
        category=ProductCategoryReference(
            id=product.category.id,
            name=product.category.name,
        ),
        unit_of_measure=_unit_response(product.unit_of_measure),
        branches=[
            ProductBranchReference(id=branch.id, code=branch.code, name=branch.name)
            for branch in product.branches
        ],
        status=product.status,  # type: ignore[arg-type]
        version=product.version,
        created_at=product.created_at,
        updated_at=product.updated_at,
    )


@router.get(
    "/categories",
    summary="Listar categorías del workspace con filtros y paginación",
    responses=_SECURITY_RESPONSES,
)
def list_categories(
    database: DatabaseSession,
    grant: CatalogReadGrant,
    search: Annotated[str | None, Query(max_length=100)] = None,
    status_filter: Annotated[CatalogStatus | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
    sort_by: Annotated[CategorySortField, Query(alias="sortBy")] = "name",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "asc",
) -> PaginatedCategoriesResponse:
    result = CatalogService(database).list_categories(
        grant=grant,
        search=search,
        status=status_filter,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return PaginatedCategoriesResponse(
        items=[_category_response(category) for category in result.items],
        page=result.page,
        page_size=result.page_size,
        total_items=result.total_items,
        total_pages=result.total_pages,
    )


@router.post(
    "/categories",
    status_code=status.HTTP_201_CREATED,
    summary="Crear una categoría compartida por el workspace",
    responses={**_SECURITY_RESPONSES, 409: {"model": ErrorResponse}},
)
def create_category(
    payload: CreateCategoryRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CatalogManageGrant,
) -> CategoryResponse:
    category = CatalogService(database).create_category(
        principal=principal,
        grant=grant,
        name=payload.name,
        description=payload.description,
        status=payload.status,
    )
    return _category_response(category)


@router.get(
    "/categories/{category_id}",
    summary="Obtener una categoría del workspace",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def get_category(
    category_id: UUID,
    database: DatabaseSession,
    grant: CatalogReadGrant,
) -> CategoryResponse:
    return _category_response(CatalogService(database).get_category(grant, category_id))


@router.patch(
    "/categories/{category_id}",
    summary="Actualizar o archivar una categoría con control de versión",
    responses={
        **_SECURITY_RESPONSES,
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def update_category(
    category_id: UUID,
    payload: UpdateCategoryRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CatalogManageGrant,
) -> CategoryResponse:
    category = CatalogService(database).update_category(
        principal=principal,
        grant=grant,
        category_id=category_id,
        expected_version=payload.version,
        changes=payload.model_dump(
            exclude_unset=True,
            exclude={"version"},
            by_alias=False,
        ),
    )
    return _category_response(category)


@router.get(
    "/units-of-measure",
    summary="Listar unidades de medida activas del workspace",
    responses=_SECURITY_RESPONSES,
)
def list_units_of_measure(
    database: DatabaseSession,
    grant: CatalogReadGrant,
) -> list[UnitOfMeasureResponse]:
    return [_unit_response(unit) for unit in CatalogService(database).list_units_of_measure(grant)]


@router.get(
    "/products",
    summary="Listar productos visibles con filtros y paginación",
    responses=_SECURITY_RESPONSES,
)
def list_products(
    database: DatabaseSession,
    grant: CatalogReadGrant,
    search: Annotated[str | None, Query(max_length=100)] = None,
    status_filter: Annotated[CatalogStatus | None, Query(alias="status")] = None,
    category_id: Annotated[UUID | None, Query(alias="categoryId")] = None,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
    sort_by: Annotated[ProductSortField, Query(alias="sortBy")] = "name",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "asc",
) -> PaginatedProductsResponse:
    result = CatalogService(database).list_products(
        grant=grant,
        search=search,
        status=status_filter,
        category_id=category_id,
        branch_id=branch_id,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return PaginatedProductsResponse(
        items=[_product_response(product) for product in result.items],
        page=result.page,
        page_size=result.page_size,
        total_items=result.total_items,
        total_pages=result.total_pages,
    )


@router.post(
    "/products",
    status_code=status.HTTP_201_CREATED,
    summary="Crear un producto y asignarlo a sucursales autorizadas",
    responses={
        **_SECURITY_RESPONSES,
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def create_product(
    payload: CreateProductRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CatalogManageGrant,
) -> ProductResponse:
    product = CatalogService(database).create_product(
        principal=principal,
        grant=grant,
        name=payload.name,
        description=payload.description,
        sku=payload.sku,
        category_id=payload.category_id,
        unit_of_measure_id=payload.unit_of_measure_id,
        branch_ids=payload.branch_ids,
        status=payload.status,
    )
    return _product_response(product)


@router.get(
    "/products/{product_id}",
    summary="Obtener un producto visible",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def get_product(
    product_id: UUID,
    database: DatabaseSession,
    grant: CatalogReadGrant,
) -> ProductResponse:
    return _product_response(CatalogService(database).get_product(grant, product_id))


@router.patch(
    "/products/{product_id}",
    summary="Actualizar producto, estado o sucursales con control de versión",
    responses={
        **_SECURITY_RESPONSES,
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def update_product(
    product_id: UUID,
    payload: UpdateProductRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CatalogManageGrant,
) -> ProductResponse:
    product = CatalogService(database).update_product(
        principal=principal,
        grant=grant,
        product_id=product_id,
        expected_version=payload.version,
        changes=payload.model_dump(
            exclude_unset=True,
            exclude={"version"},
            by_alias=False,
        ),
    )
    return _product_response(product)
