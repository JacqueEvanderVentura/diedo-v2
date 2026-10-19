from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.api.deps import DatabaseSession
from app.api.pdf_response import pdf_inline_response
from app.api.routers.public_booking import _no_store
from app.core.errors import raise_api_error
from app.schemas.public_booking import PublicCustomerProfileResponse, PublicRegisterRequest
from app.schemas.public_portal import (
    PublicPortalAppointmentsResponse,
    PublicPortalInvoicesResponse,
    PublicPortalMeResponse,
    PublicPortalPaymentsResponse,
    PublicPortalReceivablesResponse,
)
from app.services.errors import (
    AuthorizationError,
    InvalidOperationError,
    ResourceNotFoundError,
    ServiceUnavailableError,
)
from app.services.public_portal import PublicPortalService

router = APIRouter(
    prefix="/api/v1/public/portal",
    tags=["public-portal"],
    dependencies=[Depends(_no_store)],
)


@router.get(
    "/branches/{branch_id}/me",
    summary="Perfil del cliente en el portal público",
)
def portal_me(
    branch_id: UUID,
    database: DatabaseSession,
    document_type: Annotated[str, Query(alias="documentType")],
    document_id: Annotated[str, Query(alias="documentId", max_length=64)],
) -> PublicPortalMeResponse:
    result = PublicPortalService(database).me(branch_id, document_type, document_id)
    return PublicPortalMeResponse.model_validate(result)


@router.post(
    "/branches/{branch_id}/register",
    summary="Registro público del cliente",
)
def portal_register(
    branch_id: UUID,
    payload: PublicRegisterRequest,
    database: DatabaseSession,
) -> PublicCustomerProfileResponse:
    result = PublicPortalService(database).register(branch_id, payload.model_dump(by_alias=False))
    return PublicCustomerProfileResponse.model_validate(result)


@router.get(
    "/branches/{branch_id}/appointments",
    summary="Citas del cliente en todo el comercio",
)
def portal_appointments(
    branch_id: UUID,
    database: DatabaseSession,
    document_type: Annotated[str, Query(alias="documentType")],
    document_id: Annotated[str, Query(alias="documentId", max_length=64)],
) -> PublicPortalAppointmentsResponse:
    items = PublicPortalService(database).list_appointments(branch_id, document_type, document_id)
    from app.schemas.public_booking import PublicAppointmentSummary

    return PublicPortalAppointmentsResponse(
        items=[PublicAppointmentSummary.model_validate(item) for item in items]
    )


@router.get(
    "/branches/{branch_id}/receivables",
    summary="Cuentas por cobrar del cliente",
)
def portal_receivables(
    branch_id: UUID,
    database: DatabaseSession,
    document_type: Annotated[str, Query(alias="documentType")],
    document_id: Annotated[str, Query(alias="documentId", max_length=64)],
) -> PublicPortalReceivablesResponse:
    items = PublicPortalService(database).list_receivables(branch_id, document_type, document_id)
    return PublicPortalReceivablesResponse.model_validate({"items": items})


@router.get(
    "/branches/{branch_id}/payments",
    summary="Pagos del cliente",
)
def portal_payments(
    branch_id: UUID,
    database: DatabaseSession,
    document_type: Annotated[str, Query(alias="documentType")],
    document_id: Annotated[str, Query(alias="documentId", max_length=64)],
) -> PublicPortalPaymentsResponse:
    items = PublicPortalService(database).list_payments(branch_id, document_type, document_id)
    return PublicPortalPaymentsResponse.model_validate({"items": items})


@router.get(
    "/branches/{branch_id}/invoices",
    summary="Facturas del cliente",
)
def portal_invoices(
    branch_id: UUID,
    database: DatabaseSession,
    document_type: Annotated[str, Query(alias="documentType")],
    document_id: Annotated[str, Query(alias="documentId", max_length=64)],
) -> PublicPortalInvoicesResponse:
    items = PublicPortalService(database).list_invoices(branch_id, document_type, document_id)
    return PublicPortalInvoicesResponse.model_validate({"items": items})


def _portal_invoice_pdf(
    branch_id: UUID,
    sale_id: UUID,
    database: DatabaseSession,
    document_type: str,
    document_id: str,
) -> Response:
    try:
        pdf_bytes, filename = PublicPortalService(database).invoice_pdf(
            branch_id, sale_id, document_type, document_id
        )
    except AuthorizationError as exc:
        raise_api_error(403, str(exc), getattr(exc, "parameter", None))
    except ResourceNotFoundError as exc:
        raise_api_error(404, str(exc), getattr(exc, "parameter", None))
    except InvalidOperationError as exc:
        raise_api_error(400, str(exc), getattr(exc, "parameter", None))
    except ServiceUnavailableError as exc:
        raise_api_error(503, str(exc), getattr(exc, "parameter", None))
    return pdf_inline_response(pdf_bytes, filename)


@router.get(
    "/branches/{branch_id}/invoices/{sale_id}/pdf",
    summary="Descargar factura en PDF",
)
@router.get(
    "/branches/{branch_id}/invoices/{sale_id}.pdf",
    summary="Descargar factura en PDF (ruta legada)",
    include_in_schema=False,
)
def portal_invoice_pdf(
    branch_id: UUID,
    sale_id: UUID,
    database: DatabaseSession,
    document_type: Annotated[str, Query(alias="documentType")],
    document_id: Annotated[str, Query(alias="documentId", max_length=64)],
) -> Response:
    return _portal_invoice_pdf(branch_id, sale_id, database, document_type, document_id)
