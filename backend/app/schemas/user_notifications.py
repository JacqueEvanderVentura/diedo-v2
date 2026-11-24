from datetime import date, datetime
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.common import ApiModel

MAX_NOTIFICATIONS_STORED = 50


class SlotHoldResumeLink(ApiModel):
    """Snapshot of an abandoned self-booking, kept on the notification (the hold itself expires)."""

    branch_id: UUID
    service_id: UUID
    service_name: str | None = None
    employee_id: UUID | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    scheduled_date: date
    scheduled_time: str


class NotificationLink(ApiModel):
    path: str | None = None
    incident_id: UUID | None = None
    purchase_request_id: UUID | None = None
    appointment_id: UUID | None = None
    slot_hold_resume: SlotHoldResumeLink | None = None


class SlotHoldResumeResponse(ApiModel):
    """Link to continue an abandoned booking; date/time are omitted once no longer bookable."""

    resume_url: str
    scheduled_date: date | None = None
    scheduled_time: str | None = None


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
