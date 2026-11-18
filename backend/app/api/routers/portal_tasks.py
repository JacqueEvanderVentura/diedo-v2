from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, File, Form, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.attachment_response import authorized_attachment_response
from app.api.deps import (
    AttachmentStorageDep,
    CurrentPrincipal,
    CustomerReadGrant,
    DatabaseSession,
    WorkspaceUpdateGrant,
)
from app.config import settings
from app.core.errors import raise_api_error
from app.db.models.portal_tasks import PortalTaskTemplate
from app.schemas.common import ErrorResponse
from app.schemas.portal_tasks import (
    CustomerPortalTasksResponse,
    CustomerPortalTaskStatusResponse,
    PortalTaskTemplateListResponse,
    PortalTaskTemplateResponse,
    UpdatePortalTaskTemplateRequest,
)
from app.services.errors import (
    AuthorizationError,
    InvalidOperationError,
    ResourceNotFoundError,
    ServiceUnavailableError,
)
from app.services.portal_tasks import PortalTaskService

router = APIRouter(prefix="/api/v1/portal-tasks", tags=["portal-tasks"])
customers_router = APIRouter(prefix="/api/v1/customers", tags=["customers"])

_WRITE_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse},
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
}


def _template_response(row: PortalTaskTemplate) -> PortalTaskTemplateResponse:
    return PortalTaskTemplateResponse.model_validate(
        {
            "id": row.id,
            "title": row.title,
            "checkbox_label": row.checkbox_label,
            "kind": row.kind,
            "is_default_for_all": row.is_default_for_all,
            "is_active": row.is_active,
            "original_filename": row.original_filename,
            "content_type": row.content_type,
            "size_bytes": row.size_bytes,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
    )


@router.get("/templates", summary="Listar plantillas de tareas del portal")
def list_portal_task_templates(
    database: DatabaseSession,
    grant: WorkspaceUpdateGrant,
) -> PortalTaskTemplateListResponse:
    rows = PortalTaskService(database).list_templates(grant.workspace_id)
    return PortalTaskTemplateListResponse(
        items=[_template_response(row) for row in rows],
    )


@router.post(
    "/templates",
    status_code=status.HTTP_201_CREATED,
    summary="Crear plantilla de tarea del portal (PDF)",
    responses=_WRITE_RESPONSES,
)
def create_portal_task_template(
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: WorkspaceUpdateGrant,
    storage: AttachmentStorageDep,
    file: Annotated[UploadFile, File(description="PDF hasta 10 MiB")],
    title: Annotated[str, Form(max_length=200)],
    is_default_for_all: Annotated[bool, Form(alias="isDefaultForAll")] = True,
    checkbox_label: Annotated[str | None, Form(alias="checkboxLabel")] = None,
) -> PortalTaskTemplateResponse:
    try:
        row = PortalTaskService(database).create_template(
            grant=grant,
            principal_platform_user_id=principal.platform_user_id,
            source=file.file,
            original_filename=file.filename or "documento.pdf",
            content_type=file.content_type or "application/pdf",
            title=title,
            checkbox_label=checkbox_label,
            is_default_for_all=is_default_for_all,
            storage=storage,
            max_bytes=settings.attachment_max_bytes,
        )
    except InvalidOperationError as exc:
        raise_api_error(400, exc.message, exc.parameter)
    except ServiceUnavailableError as exc:
        raise_api_error(503, exc.message, exc.parameter)
    return _template_response(row)


@router.patch(
    "/templates/{template_id}",
    summary="Actualizar plantilla de tarea del portal",
    responses=_WRITE_RESPONSES,
)
def update_portal_task_template(
    template_id: UUID,
    database: DatabaseSession,
    grant: WorkspaceUpdateGrant,
    storage: AttachmentStorageDep,
    payload: UpdatePortalTaskTemplateRequest,
    file: Annotated[UploadFile | None, File(description="Reemplazar PDF")] = None,
) -> PortalTaskTemplateResponse:
    file_tuple = None
    if file is not None and file.filename:
        file_tuple = (
            file.file,
            file.filename,
            file.content_type or "application/pdf",
        )
    try:
        row = PortalTaskService(database).update_template(
            grant=grant,
            template_id=template_id,
            payload=payload.model_dump(exclude_unset=True, by_alias=False),
            storage=storage,
            max_bytes=settings.attachment_max_bytes,
            file=file_tuple,
        )
    except ResourceNotFoundError as exc:
        raise_api_error(404, exc.message, exc.parameter)
    except InvalidOperationError as exc:
        raise_api_error(400, exc.message, exc.parameter)
    except ServiceUnavailableError as exc:
        raise_api_error(503, exc.message, exc.parameter)
    return _template_response(row)


@router.get(
    "/templates/{template_id}/content",
    response_class=StreamingResponse,
    summary="Descargar PDF de plantilla",
)
def download_portal_task_template(
    template_id: UUID,
    database: DatabaseSession,
    grant: WorkspaceUpdateGrant,
    storage: AttachmentStorageDep,
) -> StreamingResponse:
    try:
        row = PortalTaskService(database).get_template(grant.workspace_id, template_id)
    except ResourceNotFoundError as exc:
        raise_api_error(404, exc.message, exc.parameter)
    return authorized_attachment_response(
        storage,
        storage_key=row.storage_key,
        content_type=row.content_type,
        filename=row.original_filename,
        size_bytes=row.size_bytes,
        headers={"Content-Disposition": f'inline; filename="{row.original_filename}"'},
    )


@customers_router.get(
    "/{customer_id}/portal-tasks",
    summary="Estado de tareas del portal para un cliente",
)
def customer_portal_tasks(
    customer_id: UUID,
    database: DatabaseSession,
    grant: CustomerReadGrant,
) -> CustomerPortalTasksResponse:
    try:
        items = PortalTaskService(database).customer_task_status(
            grant=grant,
            customer_id=customer_id,
        )
    except AuthorizationError as exc:
        raise_api_error(403, exc.message, exc.parameter)
    except ResourceNotFoundError as exc:
        raise_api_error(404, exc.message, exc.parameter)
    return CustomerPortalTasksResponse(
        items=[CustomerPortalTaskStatusResponse.model_validate(item) for item in items],
    )
