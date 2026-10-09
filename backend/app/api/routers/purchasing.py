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
from app.repositories.document_attachments import DocumentAttachmentRecord
from app.repositories.purchasing import (
    CatalogCompareRow,
    PurchaseRequestRecord,
    PurchasingSettingsRecord,
    SupplierCatalogItemRecord,
    SupplierRecord,
)
from app.schemas.common import ErrorResponse
from app.schemas.document_attachments import DocumentAttachmentResponse
from app.schemas.purchasing import (
    CatalogCompareRowResponse,
    CatalogCompareSupplierPrice,
    CreatePurchaseRequestRequest,
    CreateSupplierCatalogItemRequest,
    CreateSupplierRequest,
    DeliverPurchaseRequestRequest,
    PaginatedPurchaseRequestsResponse,
    PaginatedSuppliersResponse,
    PayPurchaseRequestRequest,
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
    SupplierCatalogItemResponse,
    SupplierResponse,
    SupplierSortField,
    UpdatePurchaseRequestRequest,
    UpdatePurchasingSettingsRequest,
    UpdateSupplierCatalogItemRequest,
    UpdateSupplierRequest,
)
from app.services.authorization import PermissionGrant
from app.services.document_attachments import DocumentAttachmentService
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


def _attachment_response(record: DocumentAttachmentRecord) -> DocumentAttachmentResponse:
    attachment = record.attachment
    return DocumentAttachmentResponse(
        id=attachment.id,
        original_filename=attachment.original_filename,
        content_type=attachment.content_type,
        size_bytes=attachment.size_bytes,
        checksum_sha256=attachment.checksum_sha256,
        preview_url=record.preview_url,
        purpose=attachment.purpose,
        created_at=attachment.created_at,
    )


def _quote_file(
    request: Any,
    attachments: tuple[DocumentAttachmentRecord, ...],
) -> PurchaseQuoteFile | None:
    quotes = [row for row in attachments if row.attachment.purpose == "quote"]
    if quotes:
        latest = quotes[-1]
        return PurchaseQuoteFile(
            name=latest.attachment.original_filename,
            id=latest.attachment.id,
            content_type=latest.attachment.content_type,
            preview_url=latest.preview_url,
        )
    if request.quote_file_name:
        return PurchaseQuoteFile(name=request.quote_file_name)
    return None


def _purchase_request_response(
    record: PurchaseRequestRecord,
    attachments: tuple[DocumentAttachmentRecord, ...] = (),
) -> PurchaseRequestResponse:
    request = record.request
    items = [
        PurchaseRequestItemResponse(
            id=item.id,
            name=item.name,
            qty=item.quantity,
            unit=item.unit,
            price=item.unit_price,
            subtotal=item.quantity * item.unit_price,
            catalog_item_id=item.supplier_catalog_item_id,
            category_id=item.category_id,
            inventory_item_id=item.inventory_item_id,
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
        quote_file=_quote_file(request, attachments),
        attachments=[_attachment_response(row) for row in attachments],
        total=sum((item.subtotal for item in items), Decimal("0")),
        created_at=request.created_at,
        reviewed_at=request.reviewed_at,
        reviewed_by=request.reviewer_membership_id,
        paid_at=request.paid_at,
        delivered_at=request.delivered_at,
        finance_expense_id=request.finance_expense_id,
        version=request.version,
        updated_at=request.updated_at,
    )


def _request_attachments(
    database: DatabaseSession,
    grant: PermissionGrant,
    records: list[PurchaseRequestRecord] | tuple[PurchaseRequestRecord, ...],
) -> dict[Any, tuple[DocumentAttachmentRecord, ...]]:
    ids = {item.request.id for item in records}
    return DocumentAttachmentService(database).attachments_by_owners(
        grant.workspace_id, "purchase_request", ids
    )


def _respond_request(
    database: DatabaseSession,
    grant: PermissionGrant,
    record: PurchaseRequestRecord,
) -> PurchaseRequestResponse:
    attachments = _request_attachments(database, grant, (record,)).get(record.request.id, ())
    return _purchase_request_response(record, attachments)


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
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
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
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        )
    )


@router.get(
    "/catalog/compare",
    responses=_SECURITY_RESPONSES,
)
def compare_supplier_catalog(
    response: Response,
    database: DatabaseSession,
    grant: PurchasingReadGrant,
    category_id: Annotated[UUID | None, Query(alias="categoryId")] = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
) -> list[CatalogCompareRowResponse]:
    response.headers["Cache-Control"] = "no-store"
    rows = PurchasingService(database).compare_supplier_catalog(
        grant,
        category_id=category_id,
        search=search,
    )
    return [_compare_row_response(row) for row in rows]


@router.get(
    "/suppliers/{supplier_id}/catalog",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def list_supplier_catalog(
    supplier_id: UUID,
    database: DatabaseSession,
    grant: PurchasingReadGrant,
    active_only: Annotated[bool, Query(alias="activeOnly")] = True,
) -> list[SupplierCatalogItemResponse]:
    rows = PurchasingService(database).list_supplier_catalog(
        grant, supplier_id, active_only=active_only
    )
    return [_catalog_item_response(row) for row in rows]


@router.post(
    "/suppliers/{supplier_id}/catalog",
    status_code=status.HTTP_201_CREATED,
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def create_supplier_catalog_item(
    supplier_id: UUID,
    payload: CreateSupplierCatalogItemRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PurchasingSupplierManageGrant,
) -> SupplierCatalogItemResponse:
    return _catalog_item_response(
        PurchasingService(database).create_supplier_catalog_item(
            principal=principal,
            grant=grant,
            supplier_id=supplier_id,
            values=payload.model_dump(by_alias=False),
        )
    )


@router.patch(
    "/suppliers/{supplier_id}/catalog/{item_id}",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def update_supplier_catalog_item(
    supplier_id: UUID,
    item_id: UUID,
    payload: UpdateSupplierCatalogItemRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PurchasingSupplierManageGrant,
) -> SupplierCatalogItemResponse:
    return _catalog_item_response(
        PurchasingService(database).update_supplier_catalog_item(
            principal=principal,
            grant=grant,
            supplier_id=supplier_id,
            item_id=item_id,
            expected_version=payload.version,
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        )
    )


@router.delete(
    "/suppliers/{supplier_id}/catalog/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def archive_supplier_catalog_item(
    supplier_id: UUID,
    item_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PurchasingSupplierManageGrant,
) -> Response:
    PurchasingService(database).archive_supplier_catalog_item(
        principal=principal,
        grant=grant,
        supplier_id=supplier_id,
        item_id=item_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
        pagada=result.pagada,
        rechazada=result.rechazada,
        entregada=result.entregada,
    )


def _catalog_item_response(record: SupplierCatalogItemRecord) -> SupplierCatalogItemResponse:
    item = record.item
    return SupplierCatalogItemResponse(
        id=item.id,
        supplier_id=item.supplier_id,
        name=item.name,
        unit=item.unit,
        unit_price=item.unit_price,
        category_id=item.category_id,
        category_name=record.category_name,
        active=item.active,
        version=item.version,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _compare_row_response(row: CatalogCompareRow) -> CatalogCompareRowResponse:
    prices = [offer[3] for offer in row.offers]
    min_price = min(prices)
    max_price = max(prices)
    cheapest = min(row.offers, key=lambda offer: offer[3])
    return CatalogCompareRowResponse(
        product_key=row.product_key,
        name=row.name,
        category_id=row.category_id,
        category_name=row.category_name,
        min_price=min_price,
        max_price=max_price,
        spread=max_price - min_price,
        cheapest_supplier_id=cheapest[0],
        suppliers=[
            CatalogCompareSupplierPrice(
                supplier_id=offer[0],
                supplier_name=offer[1],
                catalog_item_id=offer[2],
                unit_price=offer[3],
                unit=offer[4],
            )
            for offer in row.offers
        ],
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
    attachments_map = _request_attachments(database, grant, result.items)
    return PaginatedPurchaseRequestsResponse(
        items=[
            _purchase_request_response(item, attachments_map.get(item.request.id, ()))
            for item in result.items
        ],
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
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> PurchaseRequestResponse:
    return _respond_request(
        database,
        grant,
        PurchasingService(database).create_purchase_request(
            principal=principal,
            grant=grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        ),
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
    return _respond_request(
        database,
        grant,
        PurchasingService(database).get_purchase_request(grant, request_id),
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
    return _respond_request(
        database,
        grant,
        PurchasingService(database).update_purchase_request(
            principal=principal,
            grant=grant,
            request_id=request_id,
            expected_version=payload.version,
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        ),
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
    return _respond_request(
        database,
        grant,
        PurchasingService(database).review_purchase_request(
            principal=principal,
            grant=grant,
            request_id=request_id,
            expected_version=payload.version,
            status=payload.status,
        ),
    )


@router.post(
    "/requests/{request_id}/pay",
    responses={
        **_SECURITY_RESPONSES,
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def pay_purchase_request(
    request_id: UUID,
    payload: PayPurchaseRequestRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PurchasingRequestReviewGrant,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> PurchaseRequestResponse:
    return _respond_request(
        database,
        grant,
        PurchasingService(database).pay_purchase_request(
            principal=principal,
            grant=grant,
            request_id=request_id,
            expected_version=payload.version,
            idempotency_key=idempotency_key,
        ),
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
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> PurchaseRequestResponse:
    return _respond_request(
        database,
        grant,
        PurchasingService(database).deliver_purchase_request(
            principal=principal,
            grant=grant,
            request_id=request_id,
            expected_version=payload.version,
            lines=[line.model_dump(by_alias=False) for line in payload.lines],
            idempotency_key=idempotency_key,
        ),
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
