from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.schemas.common import ApiModel

DEFAULT_CHECKBOX_LABEL = "He leído y acepto los términos y condiciones"


class PortalTaskTemplateResponse(ApiModel):
    id: UUID
    title: str
    checkbox_label: str
    kind: str
    is_default_for_all: bool
    is_active: bool
    original_filename: str
    content_type: str
    size_bytes: int
    created_at: datetime
    updated_at: datetime


class PortalTaskTemplateListResponse(ApiModel):
    items: list[PortalTaskTemplateResponse]


class UpdatePortalTaskTemplateRequest(ApiModel):
    title: str | None = Field(default=None, max_length=200)
    checkbox_label: str | None = Field(default=None, min_length=1, max_length=2000)
    is_default_for_all: bool | None = None
    is_active: bool | None = None


class CustomerPortalTaskStatusResponse(ApiModel):
    template_id: UUID
    title: str
    checkbox_label: str
    kind: str
    is_active: bool
    is_default_for_all: bool
    accepted_at: datetime | None


class CustomerPortalTasksResponse(ApiModel):
    items: list[CustomerPortalTaskStatusResponse]


class PublicPortalTaskItem(ApiModel):
    id: UUID
    title: str
    checkbox_label: str
    kind: str
    has_pdf: bool = True
    accepted_at: datetime | None


class PublicPortalTasksResponse(ApiModel):
    items: list[PublicPortalTaskItem]


class PublicPortalTaskAcceptRequest(ApiModel):
    accepted: bool = True


class PublicPortalTaskAcceptResponse(ApiModel):
    template_id: UUID
    accepted_at: datetime
