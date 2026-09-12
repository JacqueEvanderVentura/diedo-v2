from datetime import date
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Header, Query, status

from app.api.deps import DatabaseSession
from app.api.routers.backoffice import BackofficeAccess
from app.core.errors import raise_api_error
from app.schemas.common import ErrorResponse
from app.schemas.public_booking import (
    PublicAppointmentSummary,
    PublicAppointmentsListResponse,
    PublicBookAppointmentRequest,
    PublicBookAppointmentResponse,
    PublicBookingContextResponse,
    PublicCancelAppointmentRequest,
    PublicCustomerProfileResponse,
    PublicIdentifyRequest,
    PublicIdentifyResponse,
    PublicProfileUpdateRequest,
    PublicRescheduleAppointmentRequest,
    PublicSlotsResponse,
)
from app.services.errors import ResourceNotFoundError
from app.services.public_booking import AuthorizationErrorPublic, PublicBookingService

router = APIRouter(prefix="/api/v1/public/booking", tags=["public-booking"])

_SECURITY: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
}


def _handle_public_errors(exc: Exception) -> None:
    if isinstance(exc, AuthorizationErrorPublic):
        raise_api_error(403, str(exc))
    raise exc


@router.get(
    "/branches/{branch_id}/context",
    summary="Contexto público de agendación por sucursal",
    responses=_SECURITY,
)
def get_booking_context(branch_id: UUID, database: DatabaseSession) -> PublicBookingContextResponse:
    try:
        payload = PublicBookingService(database).get_context(branch_id)
        return PublicBookingContextResponse.model_validate(payload)
    except Exception as exc:
        _handle_public_errors(exc)
        raise


@router.post(
    "/branches/{branch_id}/identify",
    summary="Identificar cliente por documento",
    responses=_SECURITY,
)
def identify_customer(
    branch_id: UUID,
    payload: PublicIdentifyRequest,
    database: DatabaseSession,
) -> PublicIdentifyResponse:
    try:
        result = PublicBookingService(database).identify(
            branch_id, payload.document_type, payload.document_id
        )
        return PublicIdentifyResponse.model_validate(result)
    except Exception as exc:
        _handle_public_errors(exc)
        raise


@router.get(
    "/branches/{branch_id}/slots",
    summary="Horarios disponibles para un especialista",
    responses=_SECURITY,
)
def list_slots(
    branch_id: UUID,
    database: DatabaseSession,
    scheduled_date: Annotated[date, Query(alias="date")],
    employee_id: Annotated[UUID, Query(alias="employeeId")],
    duration_minutes: Annotated[int, Query(alias="duration", ge=5, le=480)] = 30,
) -> PublicSlotsResponse:
    slots = PublicBookingService(database).list_slots(
        branch_id,
        scheduled_date=scheduled_date,
        employee_id=employee_id,
        duration_minutes=duration_minutes,
    )
    return PublicSlotsResponse(
        date=scheduled_date,
        employee_id=employee_id,
        duration_minutes=duration_minutes,
        slots=slots,
    )


@router.post(
    "/branches/{branch_id}/appointments",
    status_code=status.HTTP_201_CREATED,
    summary="Crear cita de auto-agendación",
    responses={**_SECURITY, 409: {"model": ErrorResponse}},
)
def book_appointment(
    branch_id: UUID,
    payload: PublicBookAppointmentRequest,
    database: DatabaseSession,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> PublicBookAppointmentResponse:
    key = idempotency_key or (
        f"public-booking:{branch_id}:{payload.document_id}:{payload.date}:{payload.time}"
    )
    summary = PublicBookingService(database).book(
        branch_id,
        payload.model_dump(by_alias=False),
        idempotency_key=key,
    )
    return PublicBookAppointmentResponse(
        appointment=PublicAppointmentSummary.model_validate(summary)
    )


@router.get(
    "/branches/{branch_id}/me",
    summary="Perfil y citas del cliente identificado",
    responses=_SECURITY,
)
def get_profile(
    branch_id: UUID,
    database: DatabaseSession,
    document_type: Annotated[str, Query(alias="documentType")],
    document_id: Annotated[str, Query(alias="documentId", max_length=64)],
) -> PublicAppointmentsListResponse:
    service = PublicBookingService(database)
    profile = service.profile_for_document(branch_id, document_type, document_id)
    if profile.get("customer_id") is None:
        raise ResourceNotFoundError("No encontramos un perfil con ese documento.", "documentId")
    items = service.list_customer_appointments(branch_id, document_type, document_id)
    return PublicAppointmentsListResponse(
        items=[PublicAppointmentSummary.model_validate(item) for item in items]
    )


@router.patch(
    "/branches/{branch_id}/profile",
    summary="Actualizar perfil público del cliente",
    responses=_SECURITY,
)
def update_profile(
    branch_id: UUID,
    payload: PublicProfileUpdateRequest,
    database: DatabaseSession,
) -> PublicCustomerProfileResponse:
    result = PublicBookingService(database).update_profile(
        branch_id, payload.model_dump(by_alias=False)
    )
    return PublicCustomerProfileResponse.model_validate(result)


@router.post(
    "/branches/{branch_id}/appointments/{appointment_id}/cancel",
    summary="Cancelar cita con token de gestión",
    responses={**_SECURITY, 403: {"model": ErrorResponse}},
)
def cancel_appointment(
    branch_id: UUID,
    appointment_id: UUID,
    payload: PublicCancelAppointmentRequest,
    database: DatabaseSession,
) -> dict[str, Any]:
    try:
        return PublicBookingService(database).cancel_appointment(
            branch_id, appointment_id, payload.management_token
        )
    except Exception as exc:
        _handle_public_errors(exc)
        raise


@router.post(
    "/branches/{branch_id}/appointments/{appointment_id}/reschedule",
    summary="Reagendar cita con token de gestión",
    responses={**_SECURITY, 403: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def reschedule_appointment(
    branch_id: UUID,
    appointment_id: UUID,
    payload: PublicRescheduleAppointmentRequest,
    database: DatabaseSession,
) -> dict[str, Any]:
    try:
        return PublicBookingService(database).reschedule_appointment(
            branch_id,
            appointment_id,
            management_token=payload.management_token,
            scheduled_date=payload.date,
            scheduled_time=payload.time,
            duration=payload.duration,
        )
    except Exception as exc:
        _handle_public_errors(exc)
        raise


@router.post(
    "/internal/appointment-reminders",
    summary="Enviar recordatorios de citas (cron)",
    responses={401: {"model": ErrorResponse}},
)
def send_appointment_reminders(
    database: DatabaseSession,
    _access: BackofficeAccess,
    workspace_id: Annotated[UUID | None, Query(alias="workspaceId")] = None,
) -> dict[str, int]:
    sent = PublicBookingService(database).send_due_reminders(workspace_id)
    return {"sent": sent}
