from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin, VersionMixin


class SubscriptionPlan(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "subscription_plans"
    __table_args__ = (
        UniqueConstraint("code", name="uq_subscription_plans_code"),
        CheckConstraint("status IN ('active', 'archived')", name="status_values"),
        CheckConstraint("sort_order >= 0", name="sort_order_non_negative"),
    )

    code: Mapped[str] = mapped_column(String(48), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(String(400), nullable=False, default="")
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )
    module_codes: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0, server_default=text("0"))


class WorkspaceSubscription(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "workspace_subscriptions"
    __table_args__ = (
        UniqueConstraint("workspace_id", name="uq_workspace_subscriptions_workspace"),
        CheckConstraint(
            "status IN ('trial', 'active', 'cancelled', 'expired')",
            name="status_values",
        ),
        CheckConstraint(
            "ends_at IS NULL OR ends_at >= started_at",
            name="subscription_period",
        ),
        Index("ix_workspace_subscriptions_plan", "plan_id"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    plan_id: Mapped[UUID] = mapped_column(
        ForeignKey("subscription_plans.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
