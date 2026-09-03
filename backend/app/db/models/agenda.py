from datetime import date, datetime, time
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Computed,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSTZRANGE, ExcludeConstraint, Range
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin, VersionMixin

ACTIVE_APPOINTMENT_STATUSES = ("pending", "confirmed", "delayed", "rescheduled")
DEFAULT_APPOINTMENT_RESOURCES = (
    ("cab1", "Cabina 1"),
    ("cab2", "Cabina 2"),
    ("cab3", "Cabina 3"),
    ("cab4", "Cabina 4"),
    ("cab5", "Cabina 5 Ventas"),
)


class AppointmentResource(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    """Exclusive branch resource that can be reserved by an appointment."""

    __tablename__ = "appointment_resources"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "branch_id", "id", name="uq_appointment_resources_scope_id"
        ),
        UniqueConstraint(
            "workspace_id", "branch_id", "code", name="uq_appointment_resources_scope_code"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_appointment_resources_workspace_branch",
        ),
        CheckConstraint(
            "resource_type IN ('room', 'equipment', 'other')", name="resource_type_values"
        ),
        CheckConstraint("status IN ('active', 'inactive', 'archived')", name="status_values"),
        Index(
            "ix_appointment_resources_workspace_branch_status",
            "workspace_id",
            "branch_id",
            "status",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    code: Mapped[str] = mapped_column(String(48), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    resource_type: Mapped[str] = mapped_column(
        String(24), nullable=False, default="room", server_default=text("'room'")
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )


class Appointment(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    """Branch-scoped appointment with database-enforced resource and employee exclusivity."""

    __tablename__ = "appointments"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_appointments_workspace_id"),
        UniqueConstraint(
            "workspace_id",
            "idempotency_key",
            "occurrence_index",
            name="uq_appointments_idempotency_occurrence",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_appointments_workspace_branch",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id", "resource_id"],
            [
                "appointment_resources.workspace_id",
                "appointment_resources.branch_id",
                "appointment_resources.id",
            ],
            ondelete="RESTRICT",
            name="fk_appointments_workspace_branch_resource",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            ondelete="RESTRICT",
            name="fk_appointments_workspace_customer",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_appointments_workspace_employee",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "service_id"],
            ["items.workspace_id", "items.id"],
            ondelete="RESTRICT",
            name="fk_appointments_workspace_service",
        ),
        CheckConstraint("ends_at > starts_at", name="time_order"),
        CheckConstraint("duration_minutes >= 5 AND duration_minutes <= 480", name="duration_range"),
        CheckConstraint("price >= 0 AND pending_amount >= 0", name="money_non_negative"),
        CheckConstraint("pending_amount <= price", name="pending_not_above_price"),
        CheckConstraint(
            "pending_payment OR pending_amount = 0", name="pending_amount_requires_flag"
        ),
        CheckConstraint(
            "status IN ('pending', 'confirmed', 'completed', 'attended', 'no_show', "
            "'cancelled', 'delayed', 'rescheduled')",
            name="status_values",
        ),
        CheckConstraint(
            "record_status IN ('active', 'inactive')",
            name="record_status_values",
        ),
        CheckConstraint(
            "(record_status = 'active' AND deactivated_at IS NULL) OR "
            "(record_status = 'inactive' AND deactivated_at IS NOT NULL)",
            name="deactivation_consistency",
        ),
        CheckConstraint("source IN ('staff', 'self')", name="source_values"),
        CheckConstraint("recurrence IN ('none', 'weekly', 'monthly')", name="recurrence_values"),
        CheckConstraint("repeat_count >= 1 AND repeat_count <= 12", name="repeat_count_range"),
        CheckConstraint(
            "occurrence_index >= 0 AND occurrence_index < repeat_count",
            name="occurrence_index_range",
        ),
        CheckConstraint("char_length(idempotency_key) >= 8", name="idempotency_key_length"),
        ExcludeConstraint(
            ("workspace_id", "="),
            ("branch_id", "="),
            ("resource_id", "="),
            ("scheduled_period", "&&"),
            where=text(
                "record_status = 'active' AND "
                "status IN ('pending', 'confirmed', 'delayed', 'rescheduled')"
            ),
            using="gist",
            name="excl_appointments_resource_period",
        ),
        ExcludeConstraint(
            ("workspace_id", "="),
            ("branch_id", "="),
            ("employee_id", "="),
            ("scheduled_period", "&&"),
            where=text(
                "employee_id IS NOT NULL AND "
                "record_status = 'active' AND "
                "status IN ('pending', 'confirmed', 'delayed', 'rescheduled')"
            ),
            using="gist",
            name="excl_appointments_employee_period",
        ),
        Index(
            "ix_appointments_workspace_branch_date",
            "workspace_id",
            "branch_id",
            "scheduled_date",
            "starts_at",
        ),
        Index(
            "ix_appointments_workspace_status_date",
            "workspace_id",
            "status",
            "scheduled_date",
        ),
        Index("ix_appointments_workspace_customer", "workspace_id", "customer_id", "starts_at"),
        Index("ix_appointments_workspace_employee", "workspace_id", "employee_id", "starts_at"),
        Index("ix_appointments_workspace_service", "workspace_id", "service_id"),
        Index("ix_appointments_workspace_resource", "workspace_id", "resource_id", "starts_at"),
        Index("ix_appointments_workspace_record_status", "workspace_id", "record_status"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    resource_id: Mapped[UUID] = mapped_column(nullable=False)
    customer_id: Mapped[UUID | None] = mapped_column(nullable=True)
    employee_id: Mapped[UUID | None] = mapped_column(nullable=True)
    service_id: Mapped[UUID | None] = mapped_column(nullable=True)
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False)
    scheduled_time: Mapped[time] = mapped_column(Time(timezone=False), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    scheduled_period: Mapped[Range[datetime]] = mapped_column(
        TSTZRANGE,
        Computed("tstzrange(starts_at, ends_at, '[)')", persisted=True),
        nullable=False,
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    customer_phone: Mapped[str | None] = mapped_column(String(40))
    service_name: Mapped[str] = mapped_column(String(200), nullable=False)
    price: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="confirmed", server_default=text("'confirmed'")
    )
    record_status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(String(2000))
    pending_payment: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    pending_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    first_time: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    free_trial: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    reminder_sent: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    source: Mapped[str] = mapped_column(
        String(16), nullable=False, default="staff", server_default=text("'staff'")
    )
    recurrence: Mapped[str] = mapped_column(
        String(16), nullable=False, default="none", server_default=text("'none'")
    )
    recurrence_group_id: Mapped[UUID | None] = mapped_column(nullable=True)
    occurrence_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    repeat_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default=text("1")
    )
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class AppointmentEvent(UuidPrimaryKeyMixin, Base):
    """Append-only appointment history consumed by Gestión de citas."""

    __tablename__ = "appointment_events"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "appointment_id"],
            ["appointments.workspace_id", "appointments.id"],
            ondelete="RESTRICT",
            name="fk_appointment_events_workspace_appointment",
        ),
        CheckConstraint("action IN ('create', 'update', 'status_change')", name="action_values"),
        CheckConstraint("jsonb_typeof(changes) = 'object'", name="changes_object"),
        Index(
            "ix_appointment_events_workspace_appointment_occurred",
            "workspace_id",
            "appointment_id",
            "occurred_at",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    appointment_id: Mapped[UUID] = mapped_column(nullable=False)
    actor_platform_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT")
    )
    actor_name: Mapped[str] = mapped_column(String(160), nullable=False)
    action: Mapped[str] = mapped_column(String(24), nullable=False)
    changes: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(128))
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
