"""Resume an abandoned self-booking from its staff notification."""

from __future__ import annotations

from datetime import time
from uuid import UUID

from sqlalchemy.orm import Session

from app.repositories.user_notifications import UserNotificationsRepository
from app.schemas.user_notifications import SlotHoldResumeLink, SlotHoldResumeResponse
from app.services.auth import AuthPrincipal
from app.services.errors import ResourceNotFoundError
from app.services.mailer import build_resume_booking_url
from app.services.public_booking import PublicBookingService
from app.services.user_notifications import SLOT_HOLD_ABANDONED_EVENT


class SlotHoldResumeService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = UserNotificationsRepository(session)

    def resume_link(
        self, principal: AuthPrincipal, notification_id: UUID
    ) -> SlotHoldResumeResponse:
        row = self._repository.get_for_membership(
            principal.workspace_id, principal.membership_id, notification_id
        )
        if row is None:
            raise ResourceNotFoundError("La notificación no existe.", "notificationId")
        raw = row.link.get("slotHoldResume") if isinstance(row.link, dict) else None
        if row.event_type != SLOT_HOLD_ABANDONED_EVENT or not raw:
            raise ResourceNotFoundError(
                "Esta notificación no tiene una agenda para continuar.", "notificationId"
            )
        snapshot = SlotHoldResumeLink.model_validate(raw)
        scheduled_date, scheduled_time = PublicBookingService(self._session).resume_booking_window(
            snapshot.branch_id,
            scheduled_date=snapshot.scheduled_date,
            scheduled_time=time.fromisoformat(snapshot.scheduled_time),
            employee_id=snapshot.employee_id,
            service_id=snapshot.service_id,
        )
        return SlotHoldResumeResponse(
            resume_url=build_resume_booking_url(
                branch_id=snapshot.branch_id,
                service_id=snapshot.service_id,
                employee_id=snapshot.employee_id,
                scheduled_date=scheduled_date,
                scheduled_time=scheduled_time,
            ),
            scheduled_date=scheduled_date,
            scheduled_time=scheduled_time,
        )
