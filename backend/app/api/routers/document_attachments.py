from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.attachment_response import authorized_attachment_response
from app.api.deps import (
    AttachmentStorageDep,
    CurrentPrincipal,
    DatabaseSession,
    FinanceManageGrant,
    FinanceReadGrant,
    PosReadGrant,
    PosRegisterManageGrant,
    PurchasingReadGrant,
    PurchasingRequestCreateGrant,
    PurchasingRequestReviewGrant,
    require_document_attachment_read,
)
from app.config import settings
from app.repositories.document_attachments import DocumentAttachmentRecord
from app.schemas.common import ErrorResponse
from app.schemas.document_attachments import DocumentAttachmentResponse
from app.services.authorization import PermissionGrant
from app.services.document_attachments import DocumentAttachmentService

router = APIRouter(prefix="/api/v1", tags=["document-attachments"])

_SECURITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
}


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


@router.get(
    "/document-attachments/{attachment_id}/content",
    response_class=StreamingResponse,
    responses=_SECURITY_RESPONSES,
)
def get_document_attachment_content(
    attachment_id: UUID,
    database: DatabaseSession,
    grant: Annotated[PermissionGrant, Depends(require_document_attachment_read)],
    storage: AttachmentStorageDep,
) -> StreamingResponse:
    attachment = DocumentAttachmentService(database).get_content(grant, attachment_id)
    return authorized_attachment_response(
        storage,
        storage_key=attachment.storage_key,
        content_type=attachment.content_type,
        filename=attachment.original_filename,
        size_bytes=attachment.size_bytes,
        headers={"ETag": f'"{attachment.checksum_sha256}"'},
    )


@router.get(
    "/finance/expenses/{expense_id}/attachments",
    responses=_SECURITY_RESPONSES,
)
def list_finance_expense_attachments(
    expense_id: UUID,
    database: DatabaseSession,
    grant: FinanceReadGrant,
) -> list[DocumentAttachmentResponse]:
    rows = DocumentAttachmentService(database).list_for_owner(grant, "finance_expense", expense_id)
    return [_attachment_response(row) for row in rows]


@router.post(
    "/finance/expenses/{expense_id}/attachments",
    status_code=status.HTTP_201_CREATED,
    responses=_SECURITY_RESPONSES,
)
def upload_finance_expense_attachment(
    expense_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    storage: AttachmentStorageDep,
    file: Annotated[UploadFile, File()],
) -> DocumentAttachmentResponse:
    try:
        stored = DocumentAttachmentService(database).upload(
            principal=principal,
            grant=grant,
            owner_kind="finance_expense",
            owner_id=expense_id,
            source=file.file,
            filename=file.filename,
            content_type=file.content_type,
            storage=storage,
            max_bytes=settings.attachment_max_bytes,
        )
        return _attachment_response(stored.record)
    finally:
        file.file.close()


@router.get(
    "/finance/fixed-expenses/{fixed_expense_id}/attachments",
    responses=_SECURITY_RESPONSES,
)
def list_finance_fixed_attachments(
    fixed_expense_id: UUID,
    database: DatabaseSession,
    grant: FinanceReadGrant,
) -> list[DocumentAttachmentResponse]:
    rows = DocumentAttachmentService(database).list_for_owner(
        grant, "finance_fixed_expense", fixed_expense_id
    )
    return [_attachment_response(row) for row in rows]


@router.post(
    "/finance/fixed-expenses/{fixed_expense_id}/attachments",
    status_code=status.HTTP_201_CREATED,
    responses=_SECURITY_RESPONSES,
)
def upload_finance_fixed_attachment(
    fixed_expense_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    storage: AttachmentStorageDep,
    file: Annotated[UploadFile, File()],
) -> DocumentAttachmentResponse:
    try:
        stored = DocumentAttachmentService(database).upload(
            principal=principal,
            grant=grant,
            owner_kind="finance_fixed_expense",
            owner_id=fixed_expense_id,
            source=file.file,
            filename=file.filename,
            content_type=file.content_type,
            storage=storage,
            max_bytes=settings.attachment_max_bytes,
        )
        return _attachment_response(stored.record)
    finally:
        file.file.close()


@router.get(
    "/finance/incomes/{income_id}/attachments",
    responses=_SECURITY_RESPONSES,
)
def list_finance_income_attachments(
    income_id: UUID,
    database: DatabaseSession,
    grant: FinanceReadGrant,
) -> list[DocumentAttachmentResponse]:
    rows = DocumentAttachmentService(database).list_for_owner(
        grant, "finance_manual_income", income_id
    )
    return [_attachment_response(row) for row in rows]


@router.post(
    "/finance/incomes/{income_id}/attachments",
    status_code=status.HTTP_201_CREATED,
    responses=_SECURITY_RESPONSES,
)
def upload_finance_income_attachment(
    income_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    storage: AttachmentStorageDep,
    file: Annotated[UploadFile, File()],
) -> DocumentAttachmentResponse:
    try:
        stored = DocumentAttachmentService(database).upload(
            principal=principal,
            grant=grant,
            owner_kind="finance_manual_income",
            owner_id=income_id,
            source=file.file,
            filename=file.filename,
            content_type=file.content_type,
            storage=storage,
            max_bytes=settings.attachment_max_bytes,
        )
        return _attachment_response(stored.record)
    finally:
        file.file.close()


@router.get(
    "/pos/registers/{register_id}/movements/{movement_id}/attachments",
    responses=_SECURITY_RESPONSES,
)
def list_cash_movement_attachments(
    register_id: UUID,
    movement_id: UUID,
    database: DatabaseSession,
    grant: PosReadGrant,
) -> list[DocumentAttachmentResponse]:
    _ = register_id
    rows = DocumentAttachmentService(database).list_for_owner(grant, "cash_movement", movement_id)
    return [_attachment_response(row) for row in rows]


@router.post(
    "/pos/registers/{register_id}/movements/{movement_id}/attachments",
    status_code=status.HTTP_201_CREATED,
    responses=_SECURITY_RESPONSES,
)
def upload_cash_movement_attachment(
    register_id: UUID,
    movement_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PosRegisterManageGrant,
    storage: AttachmentStorageDep,
    file: Annotated[UploadFile, File()],
) -> DocumentAttachmentResponse:
    _ = register_id
    try:
        stored = DocumentAttachmentService(database).upload(
            principal=principal,
            grant=grant,
            owner_kind="cash_movement",
            owner_id=movement_id,
            source=file.file,
            filename=file.filename,
            content_type=file.content_type,
            storage=storage,
            max_bytes=settings.attachment_max_bytes,
        )
        return _attachment_response(stored.record)
    finally:
        file.file.close()


@router.post(
    "/purchasing/requests/{request_id}/quote",
    status_code=status.HTTP_201_CREATED,
    responses=_SECURITY_RESPONSES,
)
def upload_purchase_request_quote(
    request_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PurchasingRequestCreateGrant,
    storage: AttachmentStorageDep,
    file: Annotated[UploadFile, File()],
) -> DocumentAttachmentResponse:
    try:
        stored = DocumentAttachmentService(database).upload(
            principal=principal,
            grant=grant,
            owner_kind="purchase_request",
            owner_id=request_id,
            source=file.file,
            filename=file.filename,
            content_type=file.content_type,
            storage=storage,
            max_bytes=settings.attachment_max_bytes,
            purpose="quote",
        )
        return _attachment_response(stored.record)
    finally:
        file.file.close()


@router.post(
    "/purchasing/requests/{request_id}/invoice",
    status_code=status.HTTP_201_CREATED,
    responses=_SECURITY_RESPONSES,
)
def upload_purchase_request_invoice(
    request_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PurchasingRequestReviewGrant,
    storage: AttachmentStorageDep,
    file: Annotated[UploadFile, File()],
) -> DocumentAttachmentResponse:
    try:
        stored = DocumentAttachmentService(database).upload(
            principal=principal,
            grant=grant,
            owner_kind="purchase_request",
            owner_id=request_id,
            source=file.file,
            filename=file.filename,
            content_type=file.content_type,
            storage=storage,
            max_bytes=settings.attachment_max_bytes,
            purpose="invoice",
        )
        return _attachment_response(stored.record)
    finally:
        file.file.close()


@router.post(
    "/purchasing/requests/{request_id}/payment",
    status_code=status.HTTP_201_CREATED,
    responses=_SECURITY_RESPONSES,
)
def upload_purchase_request_payment(
    request_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PurchasingRequestReviewGrant,
    storage: AttachmentStorageDep,
    file: Annotated[UploadFile, File()],
) -> DocumentAttachmentResponse:
    try:
        stored = DocumentAttachmentService(database).upload(
            principal=principal,
            grant=grant,
            owner_kind="purchase_request",
            owner_id=request_id,
            source=file.file,
            filename=file.filename,
            content_type=file.content_type,
            storage=storage,
            max_bytes=settings.attachment_max_bytes,
            purpose="payment",
        )
        return _attachment_response(stored.record)
    finally:
        file.file.close()


@router.post(
    "/purchasing/requests/{request_id}/receipt",
    status_code=status.HTTP_201_CREATED,
    responses=_SECURITY_RESPONSES,
)
def upload_purchase_request_receipt(
    request_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PurchasingRequestReviewGrant,
    storage: AttachmentStorageDep,
    file: Annotated[UploadFile, File()],
) -> DocumentAttachmentResponse:
    content_type = (file.content_type or "").casefold()
    if not content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La recepción requiere una foto (imagen).",
        )
    try:
        stored = DocumentAttachmentService(database).upload(
            principal=principal,
            grant=grant,
            owner_kind="purchase_request",
            owner_id=request_id,
            source=file.file,
            filename=file.filename,
            content_type=file.content_type,
            storage=storage,
            max_bytes=settings.attachment_max_bytes,
            purpose="receipt",
        )
        return _attachment_response(stored.record)
    finally:
        file.file.close()


@router.get(
    "/purchasing/requests/{request_id}/quote",
    responses=_SECURITY_RESPONSES,
)
def list_purchase_request_quote(
    request_id: UUID,
    database: DatabaseSession,
    grant: PurchasingReadGrant,
) -> list[DocumentAttachmentResponse]:
    rows = DocumentAttachmentService(database).list_for_owner(grant, "purchase_request", request_id)
    return [_attachment_response(row) for row in rows if row.attachment.purpose == "quote"]


@router.get(
    "/purchasing/requests/{request_id}/attachments",
    responses=_SECURITY_RESPONSES,
)
def list_purchase_request_attachments(
    request_id: UUID,
    database: DatabaseSession,
    grant: PurchasingReadGrant,
) -> list[DocumentAttachmentResponse]:
    rows = DocumentAttachmentService(database).list_for_owner(grant, "purchase_request", request_id)
    return [_attachment_response(row) for row in rows]
