from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin, VersionMixin


class Customer(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_customers_workspace_id"),
        CheckConstraint("customer_type IN ('person', 'business')", name="type_values"),
        CheckConstraint("status IN ('active', 'inactive', 'archived')", name="status_values"),
        Index("ix_customers_workspace_name", "workspace_id", "normalized_name"),
        Index("ix_customers_workspace_status_type", "workspace_id", "status", "customer_type"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    customer_type: Mapped[str] = mapped_column(String(16), nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(200), nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    business_name: Mapped[str | None] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(254))
    normalized_email: Mapped[str | None] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(40))
    normalized_phone: Mapped[str | None] = mapped_column(String(24))
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class CustomerBranchAssignment(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "customer_branch_assignments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            ondelete="RESTRICT",
            name="fk_customer_branches_workspace_customer",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_customer_branches_workspace_branch",
        ),
        UniqueConstraint(
            "workspace_id", "customer_id", "branch_id", name="uq_customer_branches_assignment"
        ),
        CheckConstraint("status IN ('active', 'inactive')", name="status_values"),
        Index("ix_customer_branches_workspace_branch", "workspace_id", "branch_id", "status"),
        Index("ix_customer_branches_workspace_customer", "workspace_id", "customer_id"),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    customer_id: Mapped[UUID] = mapped_column(nullable=False)
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )


class Employee(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "employees"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_employees_workspace_id"),
        UniqueConstraint("workspace_id", "employee_number", name="uq_employees_workspace_number"),
        ForeignKeyConstraint(
            ["workspace_id", "platform_user_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.platform_user_id"],
            ondelete="RESTRICT",
            name="fk_employees_workspace_platform_user",
        ),
        CheckConstraint("status IN ('active', 'inactive', 'archived')", name="status_values"),
        Index("ix_employees_workspace_name", "workspace_id", "normalized_name"),
        Index("ix_employees_workspace_status", "workspace_id", "status"),
        Index(
            "uq_employees_workspace_platform_user",
            "workspace_id",
            "platform_user_id",
            unique=True,
            postgresql_where=text("platform_user_id IS NOT NULL"),
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    employee_number: Mapped[str] = mapped_column(String(32), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(201), nullable=False)
    email: Mapped[str | None] = mapped_column(String(254))
    normalized_email: Mapped[str | None] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(40))
    normalized_phone: Mapped[str | None] = mapped_column(String(24))
    position: Mapped[str] = mapped_column(String(120), nullable=False)
    department: Mapped[str | None] = mapped_column(String(120))
    contract_type: Mapped[str | None] = mapped_column(String(80))
    hire_date: Mapped[date] = mapped_column(Date, nullable=False)
    platform_user_id: Mapped[UUID | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class EmployeeBranchAssignment(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "employee_branch_assignments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_employee_branches_workspace_employee",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_employee_branches_workspace_branch",
        ),
        UniqueConstraint(
            "workspace_id", "employee_id", "branch_id", name="uq_employee_branches_assignment"
        ),
        CheckConstraint("status IN ('active', 'inactive')", name="status_values"),
        Index("ix_employee_branches_workspace_branch", "workspace_id", "branch_id", "status"),
        Index("ix_employee_branches_workspace_employee", "workspace_id", "employee_id"),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    employee_id: Mapped[UUID] = mapped_column(nullable=False)
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )


class EmployeeSupervisor(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "employee_supervisors"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_employee_supervisors_workspace_employee",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "supervisor_employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_employee_supervisors_workspace_supervisor",
        ),
        UniqueConstraint(
            "workspace_id",
            "employee_id",
            "supervisor_employee_id",
            name="uq_employee_supervisors_assignment",
        ),
        CheckConstraint("employee_id <> supervisor_employee_id", name="not_self"),
        CheckConstraint("status IN ('active', 'inactive')", name="status_values"),
        Index("ix_employee_supervisors_employee", "workspace_id", "employee_id", "status"),
        Index("ix_employee_supervisors_supervisor", "workspace_id", "supervisor_employee_id"),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    employee_id: Mapped[UUID] = mapped_column(nullable=False)
    supervisor_employee_id: Mapped[UUID] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )


class EmployeeSchedule(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "employee_schedules"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_employee_schedules_workspace_employee",
        ),
        UniqueConstraint("workspace_id", "employee_id", name="uq_employee_schedules_employee"),
        CheckConstraint("jsonb_typeof(weekly_schedule) = 'object'", name="weekly_schedule_object"),
        Index("ix_employee_schedules_employee", "workspace_id", "employee_id"),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    employee_id: Mapped[UUID] = mapped_column(nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    weekly_schedule: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class Attachment(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "attachments"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_attachments_workspace_id"),
        ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            ondelete="RESTRICT",
            name="fk_attachments_workspace_customer",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_attachments_workspace_employee",
        ),
        CheckConstraint(
            "(customer_id IS NOT NULL AND employee_id IS NULL) OR "
            "(customer_id IS NULL AND employee_id IS NOT NULL)",
            name="single_owner",
        ),
        CheckConstraint(
            "classification IN ('internal', 'customer_document', 'employee_document')",
            name="classification_values",
        ),
        CheckConstraint("size_bytes > 0 AND size_bytes <= 10485760", name="size_range"),
        CheckConstraint("char_length(checksum_sha256) = 64", name="checksum_length"),
        Index("ix_attachments_customer", "workspace_id", "customer_id", "created_at"),
        Index("ix_attachments_employee", "workspace_id", "employee_id", "created_at"),
        Index("ix_attachments_uploader", "uploaded_by_platform_user_id"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    customer_id: Mapped[UUID | None] = mapped_column(nullable=True)
    employee_id: Mapped[UUID | None] = mapped_column(nullable=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    classification: Mapped[str] = mapped_column(String(32), nullable=False)
    retention_until: Mapped[date | None] = mapped_column(Date)
    uploaded_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
