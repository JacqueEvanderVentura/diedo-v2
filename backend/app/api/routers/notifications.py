from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentPrincipal, DatabaseSession
from app.repositories.user_notifications import NotificationRecord
from app.schemas.common import ErrorResponse
from app.schemas.user_notifications import (
    MarkAllNotificationsReadResponse,
    MarkNotificationReadResponse,
    NotificationLink,
    PaginatedNotificationsResponse,
    UserNotificationResponse,
)
from app.services.user_notifications import UserNotificationService

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])

_SECURITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
}


def _item(record: NotificationRecord) -> UserNotificationResponse:
    row = record.notification
    link = row.link if isinstance(row.link, dict) else {}
    return UserNotificationResponse(
        id=row.id,
        event_type=row.event_type,
        title=row.title,
        body=row.body,
        priority=row.priority,
        link=NotificationLink.model_validate(link),
        read=row.read_at is not None,
        created_at=row.created_at,
    )


@router.get(
    "",
    response_model=PaginatedNotificationsResponse,
    responses=_SECURITY_RESPONSES,
)
def list_notifications(
    database: DatabaseSession,
    principal: CurrentPrincipal,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=10)] = 10,
) -> PaginatedNotificationsResponse:
    rows, total, unread = UserNotificationService(database).list_for_principal(
        principal=principal,
        page=page,
        page_size=page_size,
    )
    return PaginatedNotificationsResponse(
        items=[_item(row) for row in rows],
        page=page,
        page_size=page_size,
        total=total,
        unread_count=unread,
    )


@router.post(
    "/{notification_id}/read",
    response_model=MarkNotificationReadResponse,
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def mark_notification_read(
    notification_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
) -> MarkNotificationReadResponse:
    service = UserNotificationService(database)
    service.mark_read(principal, notification_id)
    database.commit()
    return MarkNotificationReadResponse(id=notification_id, read=True)


@router.post(
    "/read-all",
    response_model=MarkAllNotificationsReadResponse,
    responses=_SECURITY_RESPONSES,
    status_code=status.HTTP_200_OK,
)
def mark_all_notifications_read(
    database: DatabaseSession,
    principal: CurrentPrincipal,
) -> MarkAllNotificationsReadResponse:
    service = UserNotificationService(database)
    updated = service.mark_all_read(principal)
    database.commit()
    return MarkAllNotificationsReadResponse(updated=updated)
