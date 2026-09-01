from datetime import date
from typing import Annotated, Any, cast
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, File, Form, Header, Query, Response, UploadFile, status

from app.api.deps import (
    CurrentPrincipal,
    DatabaseSession,
    IncidentCreateGrant,
    IncidentManageGrant,
    IncidentReadGrant,
)
from app.config import settings
from app.repositories.incidents import IncidentRecord
from app.schemas.common import ErrorResponse
from app.schemas.incidents import (
    CreateIncidentCommentRequest,
    CreateIncidentRequest,
    IncidentActivityResponse,
    IncidentActivityType,
    IncidentAttachmentResponse,
    IncidentPersonResponse,
    IncidentPriority,
    IncidentResponse,
    IncidentSortField,
    IncidentStatsResponse,
    IncidentStatus,
    IncidentType,
    PaginatedIncidentsResponse,
    SortDirection,
    UpdateIncidentStatusRequest,
)
from app.services.incidents import IncidentImageInput, IncidentService, page_count

router = APIRouter(prefix="/api/v1/incidents", tags=["incidents"])

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


def _incident_response(record: IncidentRecord) -> IncidentResponse:
    incident = record.incident
    attachments = [
        IncidentAttachmentResponse(
            id=attachment.id,
            original_filename=attachment.original_filename,
            content_type=attachment.content_type,
            size_bytes=attachment.size_bytes,
            checksum_sha256=attachment.checksum_sha256,
            preview_url=(f"/api/v1/incidents/{incident.id}/attachments/{attachment.id}/content"),
            created_at=attachment.created_at,
        )
        for attachment in record.attachments
    ]
    return IncidentResponse(
        id=incident.id,
        code=incident.code,
        title=incident.title,
        description=incident.description,
        type=cast(IncidentType, incident.incident_type),
        priority=cast(IncidentPriority, incident.priority),
        status=cast(IncidentStatus, incident.status),
        branch_id=incident.branch_id,
        activo_id=incident.asset_id,
        reporter=IncidentPersonResponse(
            id=incident.reported_by_membership_id,
            name=incident.reported_by_name,
        ),
        intervenientes=[
            IncidentPersonResponse(id=person.membership_id, name=person.name)
            for person in record.participants
        ],
        attachments=attachments,
        images=[attachment.preview_url for attachment in attachments],
        activity=[
            IncidentActivityResponse(
                id=entry.id,
                type=cast(IncidentActivityType, entry.activity_type),
                author_id=entry.author_membership_id,
                author=entry.author_name,
                message=entry.message,
                created_at=entry.created_at,
            )
            for entry in record.activity
        ],
        version=incident.version,
        created_at=incident.created_at,
        updated_at=incident.updated_at,
    )


@router.get("/stats", responses=_SECURITY_RESPONSES)
def incident_stats(
    response: Response,
    database: DatabaseSession,
    grant: IncidentReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> IncidentStatsResponse:
    response.headers["Cache-Control"] = "no-store"
    stats = IncidentService(database).incident_stats(grant, branch_id)
    return IncidentStatsResponse(
        total=stats.total,
        abiertas=stats.abiertas,
        en_proceso=stats.en_proceso,
        criticas=stats.criticas,
    )


@router.get("", responses={**_SECURITY_RESPONSES, 400: {"model": ErrorResponse}})
def list_incidents(
    response: Response,
    database: DatabaseSession,
    grant: IncidentReadGrant,
    search: Annotated[str | None, Query(max_length=120)] = None,
    incident_type: Annotated[IncidentType | None, Query(alias="type")] = None,
    priority: IncidentPriority | None = None,
    status_filter: Annotated[IncidentStatus | None, Query(alias="status")] = None,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    date_from: Annotated[date | None, Query(alias="dateFrom")] = None,
    date_to: Annotated[date | None, Query(alias="dateTo")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 50,
    sort_by: Annotated[IncidentSortField, Query(alias="sortBy")] = "createdAt",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "desc",
) -> PaginatedIncidentsResponse:
    response.headers["Cache-Control"] = "no-store"
    result = IncidentService(database).list_incidents(
        grant=grant,
        branch_id=branch_id,
        search=search,
        incident_type=incident_type,
        priority=priority,
        status=status_filter,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return PaginatedIncidentsResponse(
        items=[_incident_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=page_count(result.total_items, page_size),
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    responses=_WRITE_RESPONSES,
)
def create_incident(
    payload: CreateIncidentRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: IncidentCreateGrant,
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=8, max_length=128),
    ],
) -> IncidentResponse:
    values = payload.model_dump(by_alias=False)
    values["incident_type"] = values.pop("type")
    values["asset_id"] = values.pop("activo_id")
    return _incident_response(
        IncidentService(database).create_incident(
            principal=principal,
            grant=grant,
            values=values,
            idempotency_key=idempotency_key,
        )
    )


@router.get("/{incident_id}", responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}})
def get_incident(
    incident_id: UUID,
    database: DatabaseSession,
    grant: IncidentReadGrant,
) -> IncidentResponse:
    return _incident_response(IncidentService(database).get_incident(grant, incident_id))


@router.patch("/{incident_id}/status", responses=_WRITE_RESPONSES)
def update_incident_status(
    incident_id: UUID,
    payload: UpdateIncidentStatusRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: IncidentManageGrant,
) -> IncidentResponse:
    return _incident_response(
        IncidentService(database).update_status(
            principal=principal,
            grant=grant,
            incident_id=incident_id,
            status=payload.status,
            expected_version=payload.version,
        )
    )


@router.post("/{incident_id}/comments", responses=_WRITE_RESPONSES)
def add_incident_comment(
    incident_id: UUID,
    payload: CreateIncidentCommentRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: IncidentManageGrant,
) -> IncidentResponse:
    return _incident_response(
        IncidentService(database).add_comment(
            principal=principal,
            grant=grant,
            incident_id=incident_id,
            message=payload.message,
            expected_version=payload.version,
        )
    )


@router.post("/{incident_id}/attachments", responses=_WRITE_RESPONSES)
def add_incident_images(
    incident_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: IncidentManageGrant,
    version: Annotated[int, Form(ge=1)],
    files: Annotated[list[UploadFile], File()],
) -> IncidentResponse:
    inputs: list[IncidentImageInput] = []
    try:
        for uploaded in files:
            content = uploaded.file.read(settings.incident_image_max_bytes + 1)
            inputs.append(
                IncidentImageInput(
                    filename=uploaded.filename or "imagen",
                    content_type=uploaded.content_type or "application/octet-stream",
                    content=content,
                )
            )
    finally:
        for uploaded in files:
            uploaded.file.close()
    return _incident_response(
        IncidentService(database).add_images(
            principal=principal,
            grant=grant,
            incident_id=incident_id,
            expected_version=version,
            inputs=tuple(inputs),
            max_files=settings.incident_image_max_files,
            max_bytes=settings.incident_image_max_bytes,
        )
    )


@router.get(
    "/{incident_id}/attachments/{attachment_id}/content",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def preview_incident_image(
    incident_id: UUID,
    attachment_id: UUID,
    database: DatabaseSession,
    grant: IncidentReadGrant,
) -> Response:
    image = IncidentService(database).get_attachment_content(
        grant=grant,
        incident_id=incident_id,
        attachment_id=attachment_id,
    )
    encoded_name = quote(image.original_filename, safe="")
    return Response(
        content=image.content,
        media_type=image.content_type,
        headers={
            "Cache-Control": "private, max-age=300",
            "Content-Disposition": f"inline; filename*=UTF-8''{encoded_name}",
            "Content-Length": str(image.size_bytes),
            "ETag": f'"{image.checksum_sha256}"',
        },
    )
