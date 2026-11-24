from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin


class UserNotification(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_notifications"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "membership_id",
            "event_key",
            name="uq_user_notifications_event",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="CASCADE",
            name="fk_user_notifications_membership",
        ),
        CheckConstraint(
            "priority IN ('normal', 'alta')",
            name="priority_values",
        ),
        Index(
            "ix_user_notifications_membership_created",
            "workspace_id",
            "membership_id",
            "created_at",
        ),
        Index(
            "ix_user_notifications_membership_unread",
            "workspace_id",
            "membership_id",
            "read_at",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    membership_id: Mapped[UUID] = mapped_column(nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    event_key: Mapped[str] = mapped_column(String(200), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(
        String(16), nullable=False, default="normal", server_default=text("'normal'")
    )
    link: Mapped[dict[str, object]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
