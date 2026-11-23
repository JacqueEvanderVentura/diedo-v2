from datetime import datetime
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.common import ApiModel

MAX_NOTIFICATIONS_STORED = 50


class NotificationLink(ApiModel):
    path: str | None = None
    incident_id: UUID | None = None
    purchase_request_id: UUID | None = None
    appointment_id: UUID | None = None


class UserNotificationResponse(ApiModel):
    id: UUID
    event_type: str
    title: str
    body: str
    priority: str
    link: NotificationLink
    read: bool
    created_at: datetime


class PaginatedNotificationsResponse(ApiModel):
    items: list[UserNotificationResponse]
    page: int
    page_size: int
    total: int = Field(le=MAX_NOTIFICATIONS_STORED)
    unread_count: int


class MarkAllNotificationsReadResponse(ApiModel):
    updated: int


class MarkNotificationReadResponse(ApiModel):
    id: UUID
    read: bool


class NotificationListQuery(ApiModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=10, ge=1, le=10)

    @field_validator("page_size")
    @classmethod
    def clamp_page_size(cls, value: int) -> int:
        return min(max(value, 1), 10)
