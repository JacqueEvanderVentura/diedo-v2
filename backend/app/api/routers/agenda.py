from datetime import date
from math import ceil
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Header, Query, Response, status

from app.api.deps import (
    AppointmentManageGrant,
    AppointmentReadGrant,
    CurrentPrincipal,
    DatabaseSession,
)
from app.db.models import AppointmentResource
from app.repositories.agenda import AppointmentRecord
from app.schemas.agenda import (
    AppointmentHistoryChange,
    AppointmentHistoryResponse,
    AppointmentRecurrence,
    AppointmentReference,
    AppointmentResourceResponse,
    AppointmentResourcesResponse,
    AppointmentResponse,
    AppointmentSortField,
    AppointmentStatus,
    CreateAppointmentRequest,
    CreatedAppointmentsResponse,
    PaginatedAppointmentsResponse,
    SortDirection,
    UpdateAppointmentRequest,
)
from app.schemas.common import ErrorResponse
from app.services.agenda import AgendaService

router = APIRouter(prefix="/api/v1", tags=["agenda"])

_SECURITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
}


def _resource_response(resource: AppointmentResource) -> AppointmentResourceResponse:
    return AppointmentResourceResponse(
        id=resource.id,
        branch_id=resource.branch_id,
        code=resource.code,
        name=resource.name,
        resource_type=cast(Any, resource.resource_type),
        status=cast(Any, resource.status),
        version=resource.version,
    )


def _appointment_response(record: AppointmentRecord) -> AppointmentResponse:
    appointment = record.appointment
    history = [
        AppointmentHistoryResponse(
            id=event.id,
            at=event.at,
            user_id=event.user_id,
            user_name=event.user_name,
            action=("status" if event.action == "status_change" else cast(Any, event.action)),
            changes=[AppointmentHistoryChange.model_validate(change) for change in event.changes],
        )
        for event in record.history
    ]
    return AppointmentResponse(
        id=appointment.id,
        branch_id=appointment.branch_id,
        resource=_resource_response(record.resource),
        customer=(
            AppointmentReference(id=appointment.customer_id, name=appointment.customer_name)
            if appointment.customer_id is not None
            else None
        ),
        employee=(
            AppointmentReference(
                id=appointment.employee_id,
                name=record.employee_name or "Empleado",
            )
            if appointment.employee_id is not None
            else None
        ),
        service=(
            AppointmentReference(id=appointment.service_id, name=appointment.service_name)
            if appointment.service_id is not None
            else None
        ),
        date=appointment.scheduled_date,
        time=appointment.scheduled_time.strftime("%H:%M"),
        starts_at=appointment.starts_at,
        ends_at=appointment.ends_at,
        duration=appointment.duration_minutes,
        customer_name=appointment.customer_name,
        customer_phone=appointment.customer_phone,
        service_name=appointment.service_name,
        price=appointment.price,
        status=cast(AppointmentStatus, appointment.status),
        notes=appointment.notes,
        pending_payment=appointment.pending_payment,
        pending_amount=appointment.pending_amount,
        first_time=appointment.first_time,
        free_trial=appointment.free_trial,
        reminder_sent=appointment.reminder_sent,
        source=cast(Any, appointment.source),
        recurrence=cast(AppointmentRecurrence, appointment.recurrence),
        recurrence_group_id=appointment.recurrence_group_id,
        occurrence_index=appointment.occurrence_index,
        repeat_count=appointment.repeat_count,
        created_by=record.created_by_name,
        updated_by=record.updated_by_name,
        created_at=appointment.created_at,
        updated_at=appointment.updated_at,
        version=appointment.version,
        history=history,
    )


@router.get(
    "/appointment-resources",
    summary="Listar cabinas y recursos reservables de una sucursal",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def list_appointment_resources(
    response: Response,
    database: DatabaseSession,
    grant: AppointmentReadGrant,
    branch_id: Annotated[UUID, Query(alias="branchId")],
) -> AppointmentResourcesResponse:
    response.headers["Cache-Control"] = "no-store"
    resources = AgendaService(database).list_resources(grant, branch_id)
    return AppointmentResourcesResponse(items=[_resource_response(item) for item in resources])


@router.get(
    "/appointments",
    summary="Listar citas visibles para calendario y gestión",
    responses={**_SECURITY_RESPONSES, 400: {"model": ErrorResponse}},
)
def list_appointments(
    response: Response,
    database: DatabaseSession,
    grant: AppointmentReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    date_from: Annotated[date | None, Query(alias="dateFrom")] = None,
    date_to: Annotated[date | None, Query(alias="dateTo")] = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
    employee_id: Annotated[UUID | None, Query(alias="employeeId")] = None,
    status_filter: Annotated[AppointmentStatus | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
    sort_by: Annotated[AppointmentSortField, Query(alias="sortBy")] = "date",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "asc",
) -> PaginatedAppointmentsResponse:
    response.headers["Cache-Control"] = "no-store"
    result = AgendaService(database).list_appointments(
        grant=grant,
        branch_id=branch_id,
        date_from=date_from,
        date_to=date_to,
        search=search,
        employee_id=employee_id,
        status=status_filter,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return PaginatedAppointmentsResponse(
        items=[_appointment_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=ceil(result.total_items / page_size) if result.total_items else 0,
    )


@router.post(
    "/appointments",
    status_code=status.HTTP_201_CREATED,
    summary="Crear una cita o serie recurrente de forma atómica",
    responses={
        **_SECURITY_RESPONSES,
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def create_appointments(
    payload: CreateAppointmentRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: AppointmentManageGrant,
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=8, max_length=128),
    ],
) -> CreatedAppointmentsResponse:
    records = AgendaService(database).create_appointments(
        principal=principal,
        grant=grant,
        values=payload.model_dump(by_alias=False),
        idempotency_key=idempotency_key,
    )
    return CreatedAppointmentsResponse(items=[_appointment_response(item) for item in records])


@router.patch(
    "/appointments/{appointment_id}",
    summary="Actualizar, reprogramar o cancelar una cita con control de versión",
    responses={
        **_SECURITY_RESPONSES,
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def update_appointment(
    appointment_id: UUID,
    payload: UpdateAppointmentRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: AppointmentManageGrant,
) -> AppointmentResponse:
    record = AgendaService(database).update_appointment(
        principal=principal,
        grant=grant,
        appointment_id=appointment_id,
        expected_version=payload.version,
        changes=payload.model_dump(
            exclude_unset=True,
            exclude={"version"},
            by_alias=False,
        ),
    )
    return _appointment_response(record)
