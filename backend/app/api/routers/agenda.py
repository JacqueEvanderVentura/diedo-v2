from datetime import date
from math import ceil
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Header, Query, Response, status

from app.api.deps import (
    AppointmentDeleteGrant,
    AppointmentManageGrant,
    AppointmentReadGrant,
    CurrentPrincipal,
    DatabaseSession,
)
from app.db.models import AppointmentResource, AppointmentResourceAcl, BranchOpeningHour
from app.repositories.agenda import AppointmentRecord, ListedAppointmentResource
from app.schemas.agenda import (
    AppointmentHistoryChange,
    AppointmentHistoryResponse,
    AppointmentRecurrence,
    AppointmentReference,
    AppointmentResourceAclEntry,
    AppointmentResourceAclResponse,
    AppointmentResourceResponse,
    AppointmentResourcesResponse,
    AppointmentResponse,
    AppointmentSortField,
    AppointmentStatus,
    BranchOpeningHourItem,
    BranchOpeningHoursResponse,
    CreateAppointmentRequest,
    CreateAppointmentResourceRequest,
    CreatedAppointmentsResponse,
    PaginatedAppointmentsResponse,
    ReorderAppointmentResourcesRequest,
    ReplaceAppointmentResourceAclRequest,
    ReplaceBranchOpeningHoursRequest,
    SortDirection,
    UpdateAppointmentRequest,
    UpdateAppointmentResourceRequest,
)
from app.schemas.common import ErrorResponse
from app.schemas.public_booking import BookingLinkEmailRequest, EmailNotificationResponse
from app.services.agenda import AgendaService
from app.services.authorization import AuthorizationService
from app.services.booking_links import send_booking_link
from app.services.email_notifications import notification_result

router = APIRouter(prefix="/api/v1", tags=["agenda"])


@router.post("/agenda/booking-links/email")
def email_booking_link(
    payload: BookingLinkEmailRequest,
    database: DatabaseSession,
    grant: AppointmentManageGrant,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> EmailNotificationResponse:
    return EmailNotificationResponse.model_validate(
        send_booking_link(
            database,
            grant=grant,
            branch_id=payload.branch_id,
            name=payload.name,
            email=str(payload.email),
            idempotency_key=idempotency_key,
        )
    )


_SECURITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
}


def _bypass_resource_acl(
    database: DatabaseSession, principal: CurrentPrincipal, branch_id: UUID
) -> bool:
    codes = AuthorizationService(database).permission_codes_for_branches(principal, {branch_id})
    return "appointment.manage" in codes.get(branch_id, set())


def _resource_response(
    listing: ListedAppointmentResource | AppointmentResource,
) -> AppointmentResourceResponse:
    if isinstance(listing, ListedAppointmentResource):
        resource = listing.resource
        access = cast(Any, listing.access)
    else:
        resource = listing
        access = None
    return AppointmentResourceResponse(
        id=resource.id,
        branch_id=resource.branch_id,
        code=resource.code,
        name=resource.name,
        description=resource.description,
        resource_type=cast(Any, resource.resource_type),
        status=cast(Any, resource.status),
        sort_order=resource.sort_order,
        access=access,
        version=resource.version,
    )


def _opening_hour_item(row: BranchOpeningHour) -> BranchOpeningHourItem:
    return BranchOpeningHourItem(
        weekday=cast(Any, row.weekday),
        opens_at=row.opens_at,
        closes_at=row.closes_at,
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
        completed_at=appointment.completed_at,
        completion_punctuality=cast(Any, appointment.completion_punctuality),
        delay_responsibility=cast(Any, appointment.delay_responsibility),
        completion_note=appointment.completion_note,
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
        notification=(
            EmailNotificationResponse.model_validate(notification_result(record.notification))
            if record.notification is not None
            else None
        ),
    )


@router.get(
    "/appointment-resources",
    summary="Listar cabinas y recursos reservables de una sucursal",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def list_appointment_resources(
    response: Response,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: AppointmentReadGrant,
    branch_id: Annotated[UUID, Query(alias="branchId")],
) -> AppointmentResourcesResponse:
    response.headers["Cache-Control"] = "no-store"
    resources = AgendaService(database).list_resources(
        grant,
        branch_id,
        principal=principal,
        bypass_resource_acl=_bypass_resource_acl(database, principal, branch_id),
    )
    return AppointmentResourcesResponse(items=[_resource_response(item) for item in resources])


@router.post(
    "/appointment-resources",
    status_code=status.HTTP_201_CREATED,
    summary="Crear una cabina o recurso reservable",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def create_appointment_resource(
    payload: CreateAppointmentResourceRequest,
    database: DatabaseSession,
    grant: AppointmentManageGrant,
) -> AppointmentResourceResponse:
    resource = AgendaService(database).create_appointment_resource(
        grant=grant,
        branch_id=payload.branch_id,
        name=payload.name,
        description=payload.description,
    )
    return _resource_response(resource)


@router.patch(
    "/appointment-resources/{resource_id}",
    summary="Actualizar una cabina",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def update_appointment_resource(
    resource_id: UUID,
    payload: UpdateAppointmentResourceRequest,
    database: DatabaseSession,
    grant: AppointmentManageGrant,
    branch_id: Annotated[UUID, Query(alias="branchId")],
) -> AppointmentResourceResponse:
    resource = AgendaService(database).update_appointment_resource(
        grant=grant,
        branch_id=branch_id,
        resource_id=resource_id,
        expected_version=payload.version,
        changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
    )
    return _resource_response(resource)


@router.delete(
    "/appointment-resources/{resource_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Archivar una cabina",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def delete_appointment_resource(
    resource_id: UUID,
    database: DatabaseSession,
    grant: AppointmentManageGrant,
    branch_id: Annotated[UUID, Query(alias="branchId")],
    version: Annotated[int, Query(ge=1)],
) -> Response:
    AgendaService(database).archive_appointment_resource(
        grant=grant,
        branch_id=branch_id,
        resource_id=resource_id,
        expected_version=version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/appointment-resources/order",
    summary="Reordenar cabinas de una sucursal",
    responses={**_SECURITY_RESPONSES, 400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def reorder_appointment_resources(
    payload: ReorderAppointmentResourcesRequest,
    database: DatabaseSession,
    grant: AppointmentManageGrant,
) -> AppointmentResourcesResponse:
    resources = AgendaService(database).reorder_appointment_resources(
        grant=grant,
        branch_id=payload.branch_id,
        resource_ids=payload.resource_ids,
    )
    return AppointmentResourcesResponse(
        items=[_resource_response(resource) for resource in resources]
    )


@router.get(
    "/branches/{branch_id}/opening-hours",
    summary="Horarios laborales de la sucursal para agenda",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def get_branch_opening_hours(
    branch_id: UUID,
    response: Response,
    database: DatabaseSession,
    grant: AppointmentReadGrant,
) -> BranchOpeningHoursResponse:
    response.headers["Cache-Control"] = "no-store"
    rows = AgendaService(database).get_branch_opening_hours(grant, branch_id)
    return BranchOpeningHoursResponse(items=[_opening_hour_item(row) for row in rows])


@router.put(
    "/branches/{branch_id}/opening-hours",
    summary="Reemplazar horarios laborales de la sucursal",
    responses={**_SECURITY_RESPONSES, 400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def replace_branch_opening_hours(
    branch_id: UUID,
    payload: ReplaceBranchOpeningHoursRequest,
    database: DatabaseSession,
    grant: AppointmentManageGrant,
) -> BranchOpeningHoursResponse:
    rows = AgendaService(database).replace_branch_opening_hours(
        grant=grant,
        branch_id=branch_id,
        items=[item.model_dump(by_alias=False) for item in payload.items],
    )
    return BranchOpeningHoursResponse(items=[_opening_hour_item(row) for row in rows])


@router.get(
    "/appointment-resources/{resource_id}/acl",
    summary="Permisos por usuario de una cabina",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def get_appointment_resource_acl(
    resource_id: UUID,
    response: Response,
    database: DatabaseSession,
    grant: AppointmentReadGrant,
    branch_id: Annotated[UUID, Query(alias="branchId")],
) -> AppointmentResourceAclResponse:
    response.headers["Cache-Control"] = "no-store"
    rows = AgendaService(database).get_resource_acl(grant, branch_id, resource_id)
    return AppointmentResourceAclResponse(
        resource_id=resource_id,
        items=[
            AppointmentResourceAclEntry(
                user_id=cast(AppointmentResourceAcl, row).platform_user_id,
                access=cast(Any, cast(AppointmentResourceAcl, row).access),
            )
            for row in rows
        ],
    )


@router.put(
    "/appointment-resources/{resource_id}/acl",
    summary="Reemplazar permisos por usuario de una cabina",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def replace_appointment_resource_acl(
    resource_id: UUID,
    payload: ReplaceAppointmentResourceAclRequest,
    database: DatabaseSession,
    grant: AppointmentManageGrant,
    branch_id: Annotated[UUID, Query(alias="branchId")],
) -> AppointmentResourceAclResponse:
    rows = AgendaService(database).replace_resource_acl(
        grant=grant,
        branch_id=branch_id,
        resource_id=resource_id,
        entries=[item.model_dump(by_alias=False) for item in payload.items],
    )
    return AppointmentResourceAclResponse(
        resource_id=resource_id,
        items=[
            AppointmentResourceAclEntry(
                user_id=cast(AppointmentResourceAcl, row).platform_user_id,
                access=cast(Any, cast(AppointmentResourceAcl, row).access),
            )
            for row in rows
        ],
    )


@router.get(
    "/appointments",
    summary="Listar citas visibles para calendario y gestión",
    responses={**_SECURITY_RESPONSES, 400: {"model": ErrorResponse}},
)
def list_appointments(
    response: Response,
    database: DatabaseSession,
    principal: CurrentPrincipal,
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
    bypass_acl = branch_id is not None and _bypass_resource_acl(database, principal, branch_id)
    result = AgendaService(database).list_appointments(
        grant=grant,
        principal=principal,
        bypass_resource_acl=bypass_acl,
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


@router.delete(
    "/appointments/{appointment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar lógicamente una cita con control de versión",
    responses={
        **_SECURITY_RESPONSES,
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def delete_appointment(
    appointment_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: AppointmentDeleteGrant,
    version: Annotated[int, Query(ge=1)],
) -> Response:
    AgendaService(database).deactivate_appointment(
        principal=principal,
        grant=grant,
        appointment_id=appointment_id,
        expected_version=version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
