from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.schemas.common import ApiModel

IncidentType = Literal["activo", "infraestructura", "personal"]
IncidentPriority = Literal["baja", "media", "alta", "critica"]
IncidentStatus = Literal["abierta", "en_proceso", "resuelta", "cerrada"]
IncidentActivityType = Literal["created", "status_changed", "comment"]
EmployeeIncidentKind = Literal["ausencia", "tardanza", "amonestacion", "licencia_medica", "otro"]
IncidentSortField = Literal["code", "title", "priority", "status", "createdAt", "updatedAt"]
SortDirection = Literal["asc", "desc"]


def _normalize_required_text(value: str) -> str:
    return " ".join(value.split())


class CreateIncidentRequest(ApiModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=4000)
    type: IncidentType = "activo"
    priority: IncidentPriority = "media"
    branch_id: UUID
    activo_id: UUID | None = None
    employee_id: UUID | None = None
    employee_incident_kind: EmployeeIncidentKind | None = None
    participant_ids: list[UUID] = Field(default_factory=list, max_length=50)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = _normalize_required_text(value)
        if len(normalized) < 3:
            raise ValueError("El título es demasiado corto.")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return value.strip()

    @field_validator("participant_ids")
    @classmethod
    def reject_duplicate_participants(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("No repitas intervinientes.")
        return value

    @model_validator(mode="after")
    def require_type_specific_relation(self) -> CreateIncidentRequest:
        if self.type == "personal":
            if self.employee_id is None:
                raise ValueError("Selecciona el empleado relacionado con la incidencia.")
            if self.employee_incident_kind is None:
                raise ValueError("Selecciona la categoría de incidencia laboral.")
        elif self.employee_id is not None or self.employee_incident_kind is not None:
            raise ValueError("Solo una incidencia de personal puede relacionar un empleado.")
        return self


class UpdateIncidentStatusRequest(ApiModel):
    status: IncidentStatus
    version: int = Field(ge=1)


class CreateIncidentCommentRequest(ApiModel):
    message: str = Field(min_length=1, max_length=2000)
    version: int = Field(ge=1)

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("El comentario no puede estar vacío.")
        return normalized


class IncidentPersonResponse(ApiModel):
    id: UUID
    name: str


class IncidentEmployeeResponse(ApiModel):
    id: UUID
    name: str


class IncidentActivityResponse(ApiModel):
    id: UUID
    type: IncidentActivityType
    author_id: UUID | None
    author: str
    message: str
    created_at: datetime


class IncidentAttachmentResponse(ApiModel):
    id: UUID
    original_filename: str
    content_type: str
    size_bytes: int
    checksum_sha256: str
    preview_url: str
    created_at: datetime


class IncidentResponse(ApiModel):
    id: UUID
    code: str
    title: str
    description: str
    type: IncidentType
    priority: IncidentPriority
    status: IncidentStatus
    branch_id: UUID
    activo_id: UUID | None
    employee: IncidentEmployeeResponse | None
    employee_incident_kind: EmployeeIncidentKind | None
    reporter: IncidentPersonResponse
    intervenientes: list[IncidentPersonResponse]
    attachments: list[IncidentAttachmentResponse]
    images: list[str]
    activity: list[IncidentActivityResponse]
    version: int
    created_at: datetime
    updated_at: datetime


class PaginatedIncidentsResponse(ApiModel):
    items: list[IncidentResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class IncidentStatsResponse(ApiModel):
    total: int
    abiertas: int
    en_proceso: int
    criticas: int


class IncidentFilters(ApiModel):
    search: str | None = Field(default=None, max_length=120)
    type: IncidentType | None = None
    priority: IncidentPriority | None = None
    status: IncidentStatus | None = None
    branch_id: UUID | None = None
    date_from: date | None = None
    date_to: date | None = None
