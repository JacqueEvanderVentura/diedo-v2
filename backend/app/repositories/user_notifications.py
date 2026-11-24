from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db.models.identity import PlatformUser, Role, RoleAssignment, WorkspaceMembership
from app.db.models.master_data import Employee
from app.db.models.user_notifications import UserNotification
from app.schemas.user_notifications import MAX_NOTIFICATIONS_STORED


@dataclass(frozen=True)
class NotificationRecord:
    notification: UserNotification


class UserNotificationsRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def insert(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        event_type: str,
        event_key: str,
        title: str,
        body: str,
        priority: str,
        link: dict[str, Any],
    ) -> UserNotification | None:
        existing = self._session.scalar(
            select(UserNotification).where(
                UserNotification.workspace_id == workspace_id,
                UserNotification.membership_id == membership_id,
                UserNotification.event_key == event_key,
            )
        )
        if existing is not None:
            return None
        row = UserNotification(
            workspace_id=workspace_id,
            membership_id=membership_id,
            event_type=event_type,
            event_key=event_key,
            title=title,
            body=body,
            priority=priority,
            link=link,
        )
        self._session.add(row)
        self._session.flush()
        return row

    def trim_for_membership(self, workspace_id: UUID, membership_id: UUID) -> None:
        keep_ids = (
            select(UserNotification.id)
            .where(
                UserNotification.workspace_id == workspace_id,
                UserNotification.membership_id == membership_id,
            )
            .order_by(UserNotification.created_at.desc())
            .limit(MAX_NOTIFICATIONS_STORED)
        )
        self._session.execute(
            delete(UserNotification).where(
                UserNotification.workspace_id == workspace_id,
                UserNotification.membership_id == membership_id,
                UserNotification.id.not_in(keep_ids),
            )
        )

    def list_page(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        page: int,
        page_size: int,
    ) -> tuple[tuple[NotificationRecord, ...], int, int]:
        base = select(UserNotification).where(
            UserNotification.workspace_id == workspace_id,
            UserNotification.membership_id == membership_id,
        )
        raw_total = (
            self._session.scalar(
                select(func.count()).where(
                    UserNotification.workspace_id == workspace_id,
                    UserNotification.membership_id == membership_id,
                )
            )
            or 0
        )
        total = min(raw_total, MAX_NOTIFICATIONS_STORED)
        unread = (
            self._session.scalar(
                select(func.count()).where(
                    UserNotification.workspace_id == workspace_id,
                    UserNotification.membership_id == membership_id,
                    UserNotification.read_at.is_(None),
                )
            )
            or 0
        )
        offset = (page - 1) * page_size
        rows = self._session.scalars(
            base.order_by(UserNotification.created_at.desc()).offset(offset).limit(page_size)
        ).all()
        return tuple(NotificationRecord(notification=row) for row in rows), total, unread

    def get_for_membership(
        self, workspace_id: UUID, membership_id: UUID, notification_id: UUID
    ) -> UserNotification | None:
        return self._session.scalar(
            select(UserNotification).where(
                UserNotification.workspace_id == workspace_id,
                UserNotification.membership_id == membership_id,
                UserNotification.id == notification_id,
            )
        )

    def mark_read(self, workspace_id: UUID, membership_id: UUID, notification_id: UUID) -> bool:
        row = self._session.scalar(
            select(UserNotification).where(
                UserNotification.workspace_id == workspace_id,
                UserNotification.membership_id == membership_id,
                UserNotification.id == notification_id,
            )
        )
        if row is None:
            return False
        if row.read_at is None:
            row.read_at = datetime.now(UTC)
            self._session.flush()
        return True

    def mark_all_read(self, workspace_id: UUID, membership_id: UUID) -> int:
        now = datetime.now(UTC)
        rows = self._session.scalars(
            select(UserNotification).where(
                UserNotification.workspace_id == workspace_id,
                UserNotification.membership_id == membership_id,
                UserNotification.read_at.is_(None),
            )
        ).all()
        for row in rows:
            row.read_at = now
        self._session.flush()
        return len(rows)

    def membership_email(self, workspace_id: UUID, membership_id: UUID) -> str | None:
        return self._session.scalar(
            select(PlatformUser.email)
            .join(
                WorkspaceMembership,
                WorkspaceMembership.platform_user_id == PlatformUser.id,
            )
            .where(
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.id == membership_id,
                WorkspaceMembership.status == "active",
            )
        )

    def active_membership_ids_for_roles(
        self, workspace_id: UUID, role_codes: tuple[str, ...]
    ) -> set[UUID]:
        rows = self._session.scalars(
            select(RoleAssignment.membership_id)
            .join(Role, Role.id == RoleAssignment.role_id)
            .join(
                WorkspaceMembership,
                (WorkspaceMembership.id == RoleAssignment.membership_id)
                & (WorkspaceMembership.workspace_id == RoleAssignment.workspace_id),
            )
            .where(
                RoleAssignment.workspace_id == workspace_id,
                RoleAssignment.status == "active",
                Role.status == "active",
                Role.code.in_(role_codes),
                WorkspaceMembership.status == "active",
            )
            .distinct()
        ).all()
        return set(rows)

    def membership_for_platform_user(
        self, workspace_id: UUID, platform_user_id: UUID
    ) -> UUID | None:
        return self._session.scalar(
            select(WorkspaceMembership.id).where(
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.platform_user_id == platform_user_id,
                WorkspaceMembership.status == "active",
            )
        )

    def employee_membership(self, workspace_id: UUID, employee_id: UUID) -> UUID | None:
        platform_user_id = self._session.scalar(
            select(Employee.platform_user_id).where(
                Employee.workspace_id == workspace_id,
                Employee.id == employee_id,
            )
        )
        if platform_user_id is None:
            return None
        return self.membership_for_platform_user(workspace_id, platform_user_id)
