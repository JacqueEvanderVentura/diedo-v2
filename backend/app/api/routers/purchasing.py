from decimal import Decimal
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Header, Query, Response, status

from app.api.deps import (
    CurrentPrincipal,
    DatabaseSession,
    PurchasingReadGrant,
    PurchasingRequestCreateGrant,
    PurchasingRequestReviewGrant,
    PurchasingSettingsManageGrant,
    PurchasingSupplierManageGrant,
)
from app.repositories.purchasing import (
    PurchaseRequestRecord,
    PurchasingSettingsRecord,
    SupplierRecord,
)
from app.schemas.common import ErrorResponse
from app.schemas.purchasing import (
    CreatePurchaseRequestRequest,
    CreateSupplierRequest,
    DeliverPurchaseRequestRequest,
    PaginatedPurchaseRequestsResponse,
    PaginatedSuppliersResponse,
    PurchaseQuoteFile,
    PurchaseRequestItemResponse,
    PurchaseRequestPriority,
    PurchaseRequestResponse,
    PurchaseRequestSortField,
    PurchaseRequestStatsResponse,
    PurchaseRequestStatus,
    PurchasingApproverResponse,
    PurchasingSettingsResponse,
    ReviewPurchaseRequestRequest,
    SortDirection,
    SupplierResponse,
    SupplierSortField,
    UpdatePurchaseRequestRequest,
    UpdatePurchasingSettingsRequest,
    UpdateSupplierRequest,
)
from app.services.purchasing import PurchasingService, page_count

router = APIRouter(prefix="/api/v1/purchasing", tags=["purchasing"])

_SECURITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
}


def _supplier_response(record: SupplierRecord) -> SupplierResponse:
    supplier = record.supplier
    return SupplierResponse(
        id=supplier.id,
        name=supplier.name,
        rnc=supplier.tax_identifier,
        contact_name=supplier.contact_name,
        phone=supplier.phone,
        email=supplier.email,
        address=supplier.address,
        branch_ids=list(record.branch_ids),
        product_count=supplier.product_count,
        active=supplier.status == "active",
        version=supplier.version,
        created_at=supplier.created_at,
        updated_at=supplier.updated_at,
    )


def _purchase_request_response(record: PurchaseRequestRecord) -> PurchaseRequestResponse:
    request = record.request
    items = [
        PurchaseRequestItemResponse(
            id=item.id,
            name=item.name,
            qty=item.quantity,
            unit=item.unit,
            price=item.unit_price,
            subtotal=item.quantity * item.unit_price,
        )
        for item in record.items
    ]
    return PurchaseRequestResponse(
        id=request.id,
        number=request.request_number,
        supplier_id=request.supplier_id,
        supplier_name=record.supplier_name,
        branch_id=request.branch_id,
        requester_name=request.requester_name,
        requester_id=request.requester_membership_id,
        items=items,
        status=cast(PurchaseRequestStatus, request.status),
        priority=cast(PurchaseRequestPriority, request.priority),
        notes=request.notes,
        quote_file=(
            PurchaseQuoteFile(name=request.quote_file_name) if request.quote_file_name else None
        ),
        total=sum((item.subtotal for item in items), Decimal("0")),
        created_at=request.created_at,
        reviewed_at=request.reviewed_at,
        reviewed_by=request.reviewer_membership_id,
        delivered_at=request.delivered_at,
        version=request.version,
        updated_at=request.updated_at,
    )


def _settings_response(record: PurchasingSettingsRecord) -> PurchasingSettingsResponse:
    settings = record.settings
    approver = (
        PurchasingApproverResponse(
            id=settings.approver_membership_id,
            name=record.approver_name,
        )
        if settings.approver_membership_id is not None and record.approver_name is not None
        else None
    )
    return PurchasingSettingsResponse(
        approver_user_id=settings.approver_membership_id,
        approver_user=approver,
        notify_on_request=settings.notify_on_request,
        version=settings.version,
        updated_at=settings.updated_at,
    )


@router.get("/suppliers", responses=_SECURITY_RESPONSES)
def list_suppliers(
    response: Response,
    database: DatabaseSession,
    grant: PurchasingReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
    active: bool | None = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
    sort_by: Annotated[SupplierSortField, Query(alias="sortBy")] = "name",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "asc",
) -> PaginatedSuppliersResponse:
    response.headers["Cache-Control"] = "no-store"
    result = PurchasingService(database).list_suppliers(
        grant=grant,
        branch_id=branch_id,
        search=search,
        active=active,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return PaginatedSuppliersResponse(
        items=[_supplier_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=page_count(result.total_items, page_size),
    )


@router.post(
    "/suppliers",
    status_code=status.HTTP_201_CREATED,
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def create_supplier(
    payload: CreateSupplierRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PurchasingSupplierManageGrant,
    idempotency_key: Annotated[
        str, Header(alias="Idempotency-Key", min_length=8, max_length=128)
    ],
) -> SupplierResponse:
    return _supplier_response(
        PurchasingService(database).create_supplier(
            principal=principal,
            grant=grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.get(
    "/suppliers/{supplier_id}",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def get_supplier(
    supplier_id: UUID,
    database: DatabaseSession,
    grant: PurchasingReadGrant,
) -> SupplierResponse:
    return _supplier_response(PurchasingService(database).get_supplier(grant, supplier_id))


@router.patch(
    "/suppliers/{supplier_id}",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def update_supplier(
    supplier_id: UUID,
    payload: UpdateSupplierRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PurchasingSupplierManageGrant,
) -> SupplierResponse:
    return _supplier_response(
        PurchasingService(database).update_supplier(
            principal=principal,
            grant=grant,
            supplier_id=supplier_id,
            expected_version=payload.version,
            changes=payload.model_dump(
                exclude_unset=True, exclude={"version"}, by_alias=False
            ),
        )
    )


@router.delete(
    "/suppliers/{supplier_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def archive_supplier(
    supplier_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PurchasingSupplierManageGrant,
) -> Response:
    PurchasingService(database).archive_supplier(
        principal=principal, grant=grant, supplier_id=supplier_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/requests/stats", responses=_SECURITY_RESPONSES)
def purchase_request_stats(
    response: Response,
    database: DatabaseSession,
    grant: PurchasingReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> PurchaseRequestStatsResponse:
    response.headers["Cache-Control"] = "no-store"
    result = PurchasingService(database).purchase_request_stats(grant, branch_id)
    return PurchaseRequestStatsResponse(
        total=result.total,
        pendiente=result.pendiente,
        aprobada=result.aprobada,
        rechazada=result.rechazada,
        entregada=result.entregada,
    )


@router.get("/requests", responses=_SECURITY_RESPONSES)
def list_purchase_requests(
    response: Response,
    database: DatabaseSession,
    grant: PurchasingReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    supplier_id: Annotated[UUID | None, Query(alias="supplierId")] = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
    status_filter: Annotated[PurchaseRequestStatus | None, Query(alias="status")] = None,
    priority: PurchaseRequestPriority | None = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
    sort_by: Annotated[PurchaseRequestSortField, Query(alias="sortBy")] = "createdAt",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "desc",
) -> PaginatedPurchaseRequestsResponse:
    response.headers["Cache-Control"] = "no-store"
    result = PurchasingService(database).list_purchase_requests(
        grant=grant,
        branch_id=branch_id,
        supplier_id=supplier_id,
        search=search,
        status=status_filter,
        priority=priority,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return PaginatedPurchaseRequestsResponse(
        items=[_purchase_request_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=page_count(result.total_items, page_size),
    )


@router.post(
    "/requests",
    status_code=status.HTTP_201_CREATED,
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def create_purchase_request(
    payload: CreatePurchaseRequestRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PurchasingRequestCreateGrant,
    idempotency_key: Annotated[
        str, Header(alias="Idempotency-Key", min_length=8, max_length=128)
    ],
) -> PurchaseRequestResponse:
    return _purchase_request_response(
        PurchasingService(database).create_purchase_request(
            principal=principal,
            grant=grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.get(
    "/requests/{request_id}",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def get_purchase_request(
    request_id: UUID,
    database: DatabaseSession,
    grant: PurchasingReadGrant,
) -> PurchaseRequestResponse:
    return _purchase_request_response(
        PurchasingService(database).get_purchase_request(grant, request_id)
    )


@router.patch(
    "/requests/{request_id}",
    responses={
        **_SECURITY_RESPONSES,
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def update_purchase_request(
    request_id: UUID,
    payload: UpdatePurchaseRequestRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PurchasingRequestCreateGrant,
) -> PurchaseRequestResponse:
    return _purchase_request_response(
        PurchasingService(database).update_purchase_request(
            principal=principal,
            grant=grant,
            request_id=request_id,
            expected_version=payload.version,
            changes=payload.model_dump(
                exclude_unset=True, exclude={"version"}, by_alias=False
            ),
        )
    )


@router.post(
    "/requests/{request_id}/review",
    responses={
        **_SECURITY_RESPONSES,
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def review_purchase_request(
    request_id: UUID,
    payload: ReviewPurchaseRequestRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PurchasingRequestReviewGrant,
) -> PurchaseRequestResponse:
    return _purchase_request_response(
        PurchasingService(database).review_purchase_request(
            principal=principal,
            grant=grant,
            request_id=request_id,
            expected_version=payload.version,
            status=payload.status,
        )
    )


@router.post(
    "/requests/{request_id}/deliver",
    responses={
        **_SECURITY_RESPONSES,
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def deliver_purchase_request(
    request_id: UUID,
    payload: DeliverPurchaseRequestRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PurchasingRequestReviewGrant,
) -> PurchaseRequestResponse:
    return _purchase_request_response(
        PurchasingService(database).deliver_purchase_request(
            principal=principal,
            grant=grant,
            request_id=request_id,
            expected_version=payload.version,
        )
    )


@router.get("/settings", responses=_SECURITY_RESPONSES)
def get_purchasing_settings(
    response: Response,
    database: DatabaseSession,
    grant: PurchasingReadGrant,
) -> PurchasingSettingsResponse:
    response.headers["Cache-Control"] = "no-store"
    return _settings_response(PurchasingService(database).get_settings(grant))


@router.get("/settings/approvers", responses=_SECURITY_RESPONSES)
def list_purchasing_approvers(
    response: Response,
    database: DatabaseSession,
    grant: PurchasingReadGrant,
) -> list[PurchasingApproverResponse]:
    response.headers["Cache-Control"] = "no-store"
    return [
        PurchasingApproverResponse(id=item.membership_id, name=item.display_name)
        for item in PurchasingService(database).list_approvers(grant)
    ]


@router.put(
    "/settings",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def update_purchasing_settings(
    payload: UpdatePurchasingSettingsRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PurchasingSettingsManageGrant,
) -> PurchasingSettingsResponse:
    return _settings_response(
        PurchasingService(database).update_settings(
            principal=principal,
            grant=grant,
            expected_version=payload.version,
            approver_membership_id=payload.approver_user_id,
            notify_on_request=payload.notify_on_request,
        )
    )
