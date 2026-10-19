from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.api.deps import DatabaseSession, require_invoice_document_grant
from app.api.pdf_response import pdf_inline_response
from app.schemas.common import ErrorResponse
from app.schemas.invoice_documents import InvoiceDocumentRequest
from app.services.authorization import PermissionGrant
from app.services.invoice_pdf import InvoicePdfService

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])

_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
}

InvoiceDocumentGrant = Annotated[PermissionGrant, Depends(require_invoice_document_grant)]


@router.post("/invoices/pdf", responses=_RESPONSES)
def render_invoice_pdf(
    payload: InvoiceDocumentRequest,
    database: DatabaseSession,
    grant: InvoiceDocumentGrant,
) -> Response:
    del grant
    pdf_bytes = InvoicePdfService(database).render_document(payload)
    return pdf_inline_response(pdf_bytes, f"{payload.id}.pdf")
