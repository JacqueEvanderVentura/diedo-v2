from datetime import date
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, File, Form, Query, Response, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.attachment_response import authorized_attachment_response
from app.api.deps import (
    AttachmentStorageDep,
    CurrentPrincipal,
    CustomerManageGrant,
    CustomerReadGrant,
    DatabaseSession,
    EmployeeManageGrant,
    EmployeeReadGrant,
    EmployeeScheduleManageGrant,
)
from app.config import settings
from app.repositories.master_data import (
    AttachmentRecord,
    CustomerRecord,
    EmployeeRecord,
    ScheduleRecord,
)
from app.schemas.common import ErrorResponse
from app.schemas.master_data import (
    AttachmentClassification,
    AttachmentResponse,
    BranchReference,
    CreateCustomerRequest,
    CreateEmployeeRequest,
    CustomerResponse,
    CustomerSortField,
    CustomerTimelineResponse,
    CustomerType,
    EmployeeResponse,
    EmployeeScheduleResponse,
    EmployeeSortField,
    MasterDataStatus,
    PaginatedCustomersResponse,
    PaginatedEmployeesResponse,
    PutEmployeeScheduleRequest,
    SortDirection,
    TimelineItemResponse,
    UpdateCustomerRequest,
    UpdateEmployeeRequest,
    WeeklySchedule,
)
from app.services.master_data import MasterDataService

customers_router = APIRouter(prefix="/api/v1/customers", tags=["customers"])
employees_router = APIRouter(prefix="/api/v1/employees", tags=["employees"])

_SECURITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
}
_WRITE_RESPONSES: dict[int | str, dict[str, Any]] = {
    **_SECURITY_RESPONSES,
    400: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
}


def _schedule_response(schedule: ScheduleRecord) -> EmployeeScheduleResponse:
    return EmployeeScheduleResponse(
        timezone=schedule.timezone,
        week=WeeklySchedule.model_validate(schedule.weekly_schedule),
        version=schedule.version,
        updated_at=schedule.updated_at,
    )


def _customer_response(customer: CustomerRecord) -> CustomerResponse:
    return CustomerResponse(
        id=customer.id,
        customer_type=customer.customer_type,  # type: ignore[arg-type]
        display_name=customer.display_name,
        first_name=customer.first_name,
        last_name=customer.last_name,
        business_name=customer.business_name,
        email=customer.email,
        phone=customer.phone,
        branches=[
            BranchReference(id=branch.id, code=branch.code, name=branch.name)
            for branch in customer.branches
        ],
        status=customer.status,  # type: ignore[arg-type]
        version=customer.version,
        attachment_count=customer.attachment_count,
        created_at=customer.created_at,
        updated_at=customer.updated_at,
    )


def _employee_response(employee: EmployeeRecord) -> EmployeeResponse:
    return EmployeeResponse(
        id=employee.id,
        employee_number=employee.employee_number,
        first_name=employee.first_name,
        last_name=employee.last_name,
        display_name=f"{employee.first_name} {employee.last_name}".strip(),
        email=employee.email,
        phone=employee.phone,
        position=employee.position,
        department=employee.department,
        contract_type=employee.contract_type,
        hire_date=employee.hire_date,
        platform_user_id=employee.platform_user_id,
        branches=[
            BranchReference(id=branch.id, code=branch.code, name=branch.name)
            for branch in employee.branches
        ],
        supervisor_ids=list(employee.supervisor_ids),
        schedule=_schedule_response(employee.schedule),
        status=employee.status,  # type: ignore[arg-type]
        version=employee.version,
        attachment_count=employee.attachment_count,
        created_at=employee.created_at,
        updated_at=employee.updated_at,
    )


def _attachment_response(attachment: AttachmentRecord) -> AttachmentResponse:
    return AttachmentResponse(
        id=attachment.id,
        original_filename=attachment.original_filename,
        content_type=attachment.content_type,
        size_bytes=attachment.size_bytes,
        checksum_sha256=attachment.checksum_sha256,
        classification=attachment.classification,  # type: ignore[arg-type]
        retention_until=attachment.retention_until,
        created_at=attachment.created_at,
    )


@customers_router.get("", summary="Listar clientes compartidos con scope y paginación")
def list_customers(
    database: DatabaseSession,
    grant: CustomerReadGrant,
    search: Annotated[str | None, Query(max_length=120)] = None,
    name: Annotated[str | None, Query(max_length=200)] = None,
    phone: Annotated[str | None, Query(max_length=40)] = None,
    email: Annotated[str | None, Query(max_length=254)] = None,
    customer_type: Annotated[CustomerType | None, Query(alias="type")] = None,
    status_filter: Annotated[MasterDataStatus | None, Query(alias="status")] = None,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 50,
    sort_by: Annotated[CustomerSortField, Query(alias="sortBy")] = "name",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "asc",
) -> PaginatedCustomersResponse:
    result = MasterDataService(database).list_customers(
        grant=grant,
        search=search,
        name=name,
        phone=phone,
        email=email,
        customer_type=customer_type,
        status=status_filter,
        branch_id=branch_id,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return PaginatedCustomersResponse(
        items=[_customer_response(item) for item in result.items],
        page=result.page,
        page_size=result.page_size,
        total_items=result.total_items,
        total_pages=result.total_pages,
    )


@customers_router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Crear un cliente compartido",
    responses=_WRITE_RESPONSES,
)
def create_customer(
    payload: CreateCustomerRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CustomerManageGrant,
) -> CustomerResponse:
    values = payload.model_dump(exclude={"branch_ids"}, by_alias=False)
    return _customer_response(
        MasterDataService(database).create_customer(
            principal=principal,
            grant=grant,
            values=values,
            branch_ids=set(payload.branch_ids),
        )
    )


@customers_router.get(
    "/{customer_id}",
    summary="Obtener un cliente visible",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def get_customer(
    customer_id: UUID,
    database: DatabaseSession,
    grant: CustomerReadGrant,
) -> CustomerResponse:
    return _customer_response(MasterDataService(database).get_customer(grant, customer_id))


@customers_router.patch(
    "/{customer_id}",
    summary="Actualizar o archivar un cliente con control de versión",
    responses=_WRITE_RESPONSES,
)
def update_customer(
    customer_id: UUID,
    payload: UpdateCustomerRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CustomerManageGrant,
) -> CustomerResponse:
    return _customer_response(
        MasterDataService(database).update_customer(
            principal=principal,
            grant=grant,
            customer_id=customer_id,
            expected_version=payload.version,
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        )
    )


@customers_router.get(
    "/{customer_id}/timeline",
    summary="Proyectar el timeline compartido del cliente",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def customer_timeline(
    customer_id: UUID,
    database: DatabaseSession,
    grant: CustomerReadGrant,
) -> CustomerTimelineResponse:
    records = MasterDataService(database).customer_timeline(grant, customer_id)
    titles = {
        "master_data.customer.create": "Cliente creado",
        "master_data.customer.update": "Cliente actualizado",
    }
    return CustomerTimelineResponse(
        items=[
            TimelineItemResponse(
                id=str(record.id),
                event_type=record.action,
                title=titles.get(record.action, "Actividad de cliente"),
                occurred_at=record.occurred_at,
                source="master_data",
            )
            for record in records
        ]
    )


@employees_router.get("", summary="Listar empleados básicos con scope y paginación")
def list_employees(
    database: DatabaseSession,
    grant: EmployeeReadGrant,
    search: Annotated[str | None, Query(max_length=120)] = None,
    status_filter: Annotated[MasterDataStatus | None, Query(alias="status")] = None,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    department: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 50,
    sort_by: Annotated[EmployeeSortField, Query(alias="sortBy")] = "name",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "asc",
) -> PaginatedEmployeesResponse:
    result = MasterDataService(database).list_employees(
        grant=grant,
        search=search,
        status=status_filter,
        branch_id=branch_id,
        department=department,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return PaginatedEmployeesResponse(
        items=[_employee_response(item) for item in result.items],
        page=result.page,
        page_size=result.page_size,
        total_items=result.total_items,
        total_pages=result.total_pages,
    )


@employees_router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Crear un empleado básico",
    responses=_WRITE_RESPONSES,
)
def create_employee(
    payload: CreateEmployeeRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: EmployeeManageGrant,
) -> EmployeeResponse:
    values = payload.model_dump(
        exclude={"branch_ids", "supervisor_ids", "timezone", "schedule"},
        by_alias=False,
    )
    return _employee_response(
        MasterDataService(database).create_employee(
            principal=principal,
            grant=grant,
            values=values,
            branch_ids=set(payload.branch_ids),
            supervisor_ids=set(payload.supervisor_ids),
            timezone=payload.timezone,
            weekly_schedule=payload.schedule.model_dump(mode="json", by_alias=False),
        )
    )


@employees_router.get(
    "/{employee_id}",
    summary="Obtener un empleado básico visible",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def get_employee(
    employee_id: UUID,
    database: DatabaseSession,
    grant: EmployeeReadGrant,
) -> EmployeeResponse:
    return _employee_response(MasterDataService(database).get_employee(grant, employee_id))


@employees_router.patch(
    "/{employee_id}",
    summary="Actualizar o archivar un empleado con control de versión",
    responses=_WRITE_RESPONSES,
)
def update_employee(
    employee_id: UUID,
    payload: UpdateEmployeeRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: EmployeeManageGrant,
) -> EmployeeResponse:
    return _employee_response(
        MasterDataService(database).update_employee(
            principal=principal,
            grant=grant,
            employee_id=employee_id,
            expected_version=payload.version,
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        )
    )


@employees_router.get(
    "/{employee_id}/schedule",
    summary="Obtener el horario semanal del empleado",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def get_employee_schedule(
    employee_id: UUID,
    database: DatabaseSession,
    grant: EmployeeReadGrant,
) -> EmployeeScheduleResponse:
    return _schedule_response(MasterDataService(database).get_schedule(grant, employee_id))


@employees_router.put(
    "/{employee_id}/schedule",
    summary="Reemplazar el horario semanal con control de versión",
    responses=_WRITE_RESPONSES,
)
def update_employee_schedule(
    employee_id: UUID,
    payload: PutEmployeeScheduleRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: EmployeeScheduleManageGrant,
) -> EmployeeScheduleResponse:
    return _schedule_response(
        MasterDataService(database).update_schedule(
            principal=principal,
            grant=grant,
            employee_id=employee_id,
            expected_version=payload.version,
            timezone=payload.timezone,
            weekly_schedule=payload.week.model_dump(mode="json", by_alias=False),
        )
    )


def _list_attachments(
    database: DatabaseSession,
    grant: CustomerReadGrant | EmployeeReadGrant,
    owner_type: str,
    owner_id: UUID,
) -> list[AttachmentResponse]:
    records = MasterDataService(database).list_attachments(grant, owner_type, owner_id)
    return [_attachment_response(record) for record in records]


def _upload_attachment(
    *,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CustomerManageGrant | EmployeeManageGrant,
    storage: AttachmentStorageDep,
    owner_type: str,
    owner_id: UUID,
    file: UploadFile,
    classification: AttachmentClassification,
    retention_until: date | None,
) -> AttachmentResponse:
    try:
        record = MasterDataService(database).upload_attachment(
            principal=principal,
            grant=grant,
            owner_type=owner_type,
            owner_id=owner_id,
            source=file.file,
            original_filename=file.filename or "archivo",
            content_type=file.content_type or "",
            classification=classification,
            retention_until=retention_until,
            storage=storage,
            max_bytes=settings.attachment_max_bytes,
        )
        return _attachment_response(record)
    finally:
        file.file.close()


def _download_attachment(
    *,
    database: DatabaseSession,
    grant: CustomerReadGrant | EmployeeReadGrant,
    storage: AttachmentStorageDep,
    owner_type: str,
    owner_id: UUID,
    attachment_id: UUID,
) -> StreamingResponse:
    record = MasterDataService(database).get_attachment(
        grant=grant,
        owner_type=owner_type,
        owner_id=owner_id,
        attachment_id=attachment_id,
    )
    return authorized_attachment_response(
        storage,
        storage_key=record.storage_key,
        content_type=record.content_type,
        filename=record.original_filename,
        size_bytes=record.size_bytes,
    )


@customers_router.get("/{customer_id}/attachments", summary="Listar adjuntos del cliente")
def list_customer_attachments(
    customer_id: UUID,
    database: DatabaseSession,
    grant: CustomerReadGrant,
) -> list[AttachmentResponse]:
    return _list_attachments(database, grant, "customer", customer_id)


@customers_router.post(
    "/{customer_id}/attachments",
    status_code=status.HTTP_201_CREATED,
    summary="Subir un adjunto del cliente",
    responses=_WRITE_RESPONSES,
)
def upload_customer_attachment(
    customer_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CustomerManageGrant,
    storage: AttachmentStorageDep,
    file: Annotated[UploadFile, File(description="PDF, JPEG, PNG or WebP up to 10 MiB")],
    classification: Annotated[AttachmentClassification, Form()] = "customer_document",
    retention_until: Annotated[date | None, Form(alias="retentionUntil")] = None,
) -> AttachmentResponse:
    return _upload_attachment(
        database=database,
        principal=principal,
        grant=grant,
        storage=storage,
        owner_type="customer",
        owner_id=customer_id,
        file=file,
        classification=classification,
        retention_until=retention_until,
    )


@customers_router.get(
    "/{customer_id}/attachments/{attachment_id}/content",
    response_class=StreamingResponse,
    summary="Descargar un adjunto autorizado del cliente",
)
def download_customer_attachment(
    customer_id: UUID,
    attachment_id: UUID,
    database: DatabaseSession,
    grant: CustomerReadGrant,
    storage: AttachmentStorageDep,
) -> StreamingResponse:
    return _download_attachment(
        database=database,
        grant=grant,
        storage=storage,
        owner_type="customer",
        owner_id=customer_id,
        attachment_id=attachment_id,
    )


@customers_router.delete(
    "/{customer_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar un adjunto del cliente",
    responses=_WRITE_RESPONSES,
)
def delete_customer_attachment(
    customer_id: UUID,
    attachment_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CustomerManageGrant,
    storage: AttachmentStorageDep,
) -> Response:
    MasterDataService(database).delete_attachment(
        principal=principal,
        grant=grant,
        owner_type="customer",
        owner_id=customer_id,
        attachment_id=attachment_id,
        storage=storage,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@employees_router.get("/{employee_id}/attachments", summary="Listar adjuntos del empleado")
def list_employee_attachments(
    employee_id: UUID,
    database: DatabaseSession,
    grant: EmployeeReadGrant,
) -> list[AttachmentResponse]:
    return _list_attachments(database, grant, "employee", employee_id)


@employees_router.post(
    "/{employee_id}/attachments",
    status_code=status.HTTP_201_CREATED,
    summary="Subir un adjunto del empleado",
    responses=_WRITE_RESPONSES,
)
def upload_employee_attachment(
    employee_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: EmployeeManageGrant,
    storage: AttachmentStorageDep,
    file: Annotated[UploadFile, File(description="PDF, JPEG, PNG or WebP up to 10 MiB")],
    classification: Annotated[AttachmentClassification, Form()] = "employee_document",
    retention_until: Annotated[date | None, Form(alias="retentionUntil")] = None,
) -> AttachmentResponse:
    return _upload_attachment(
        database=database,
        principal=principal,
        grant=grant,
        storage=storage,
        owner_type="employee",
        owner_id=employee_id,
        file=file,
        classification=classification,
        retention_until=retention_until,
    )


@employees_router.get(
    "/{employee_id}/attachments/{attachment_id}/content",
    response_class=StreamingResponse,
    summary="Descargar un adjunto autorizado del empleado",
)
def download_employee_attachment(
    employee_id: UUID,
    attachment_id: UUID,
    database: DatabaseSession,
    grant: EmployeeReadGrant,
    storage: AttachmentStorageDep,
) -> StreamingResponse:
    return _download_attachment(
        database=database,
        grant=grant,
        storage=storage,
        owner_type="employee",
        owner_id=employee_id,
        attachment_id=attachment_id,
    )


@employees_router.delete(
    "/{employee_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar un adjunto del empleado",
    responses=_WRITE_RESPONSES,
)
def delete_employee_attachment(
    employee_id: UUID,
    attachment_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: EmployeeManageGrant,
    storage: AttachmentStorageDep,
) -> Response:
    MasterDataService(database).delete_attachment(
        principal=principal,
        grant=grant,
        owner_type="employee",
        owner_id=employee_id,
        attachment_id=attachment_id,
        storage=storage,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
