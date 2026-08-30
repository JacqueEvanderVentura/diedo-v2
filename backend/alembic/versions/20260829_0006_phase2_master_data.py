"""Phase 2 shared customers, employees, schedules, and attachments.

Revision ID: 20260829_0006
Revises: 20260829_0005
Create Date: 2026-08-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260829_0006"
down_revision: str | Sequence[str] | None = "20260829_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "customers",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("customer_type", sa.String(length=16), nullable=False),
        sa.Column("display_name", sa.String(length=200), nullable=False),
        sa.Column("normalized_name", sa.String(length=200), nullable=False),
        sa.Column("first_name", sa.String(length=100), nullable=True),
        sa.Column("last_name", sa.String(length=100), nullable=True),
        sa.Column("business_name", sa.String(length=200), nullable=True),
        sa.Column("email", sa.String(length=254), nullable=True),
        sa.Column("normalized_email", sa.String(length=254), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("normalized_phone", sa.String(length=24), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint(
            "customer_type IN ('person', 'business')", name=op.f("ck_customers_type_values")
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'archived')",
            name=op.f("ck_customers_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"],
            ["platform_users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_customers_created_by_platform_user_id_platform_users"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"],
            ["platform_users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_customers_updated_by_platform_user_id_platform_users"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="RESTRICT",
            name=op.f("fk_customers_workspace_id_workspaces"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customers")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_customers_workspace_id"),
    )
    op.create_index("ix_customers_workspace_name", "customers", ["workspace_id", "normalized_name"])
    op.create_index(
        "ix_customers_workspace_status_type",
        "customers",
        ["workspace_id", "status", "customer_type"],
    )

    op.create_table(
        "employees",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("employee_number", sa.String(length=32), nullable=False),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("normalized_name", sa.String(length=201), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=True),
        sa.Column("normalized_email", sa.String(length=254), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("normalized_phone", sa.String(length=24), nullable=True),
        sa.Column("position", sa.String(length=120), nullable=False),
        sa.Column("department", sa.String(length=120), nullable=True),
        sa.Column("contract_type", sa.String(length=80), nullable=True),
        sa.Column("hire_date", sa.Date(), nullable=False),
        sa.Column("platform_user_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'archived')",
            name=op.f("ck_employees_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"],
            ["platform_users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_employees_created_by_platform_user_id_platform_users"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"],
            ["platform_users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_employees_updated_by_platform_user_id_platform_users"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "platform_user_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.platform_user_id"],
            ondelete="RESTRICT",
            name="fk_employees_workspace_platform_user",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="RESTRICT",
            name=op.f("fk_employees_workspace_id_workspaces"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employees")),
        sa.UniqueConstraint("workspace_id", "employee_number", name="uq_employees_workspace_number"),
        sa.UniqueConstraint("workspace_id", "id", name="uq_employees_workspace_id"),
    )
    op.create_index("ix_employees_workspace_name", "employees", ["workspace_id", "normalized_name"])
    op.create_index("ix_employees_workspace_status", "employees", ["workspace_id", "status"])
    op.create_index(
        "uq_employees_workspace_platform_user",
        "employees",
        ["workspace_id", "platform_user_id"],
        unique=True,
        postgresql_where=sa.text("platform_user_id IS NOT NULL"),
    )

    op.create_table(
        "customer_branch_assignments",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')",
            name=op.f("ck_customer_branch_assignments_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_customer_branches_workspace_branch",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            ondelete="RESTRICT",
            name="fk_customer_branches_workspace_customer",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customer_branch_assignments")),
        sa.UniqueConstraint(
            "workspace_id", "customer_id", "branch_id", name="uq_customer_branches_assignment"
        ),
    )
    op.create_index(
        "ix_customer_branches_workspace_branch",
        "customer_branch_assignments",
        ["workspace_id", "branch_id", "status"],
    )
    op.create_index(
        "ix_customer_branches_workspace_customer",
        "customer_branch_assignments",
        ["workspace_id", "customer_id"],
    )

    op.create_table(
        "employee_branch_assignments",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')",
            name=op.f("ck_employee_branch_assignments_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_employee_branches_workspace_branch",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_employee_branches_workspace_employee",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employee_branch_assignments")),
        sa.UniqueConstraint(
            "workspace_id", "employee_id", "branch_id", name="uq_employee_branches_assignment"
        ),
    )
    op.create_index(
        "ix_employee_branches_workspace_branch",
        "employee_branch_assignments",
        ["workspace_id", "branch_id", "status"],
    )
    op.create_index(
        "ix_employee_branches_workspace_employee",
        "employee_branch_assignments",
        ["workspace_id", "employee_id"],
    )

    op.create_table(
        "employee_supervisors",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("supervisor_employee_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "employee_id <> supervisor_employee_id",
            name=op.f("ck_employee_supervisors_not_self"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')",
            name=op.f("ck_employee_supervisors_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_employee_supervisors_workspace_employee",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "supervisor_employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_employee_supervisors_workspace_supervisor",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employee_supervisors")),
        sa.UniqueConstraint(
            "workspace_id",
            "employee_id",
            "supervisor_employee_id",
            name="uq_employee_supervisors_assignment",
        ),
    )
    op.create_index(
        "ix_employee_supervisors_employee",
        "employee_supervisors",
        ["workspace_id", "employee_id", "status"],
    )
    op.create_index(
        "ix_employee_supervisors_supervisor",
        "employee_supervisors",
        ["workspace_id", "supervisor_employee_id"],
    )

    op.create_table(
        "employee_schedules",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column(
            "weekly_schedule",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint(
            "jsonb_typeof(weekly_schedule) = 'object'",
            name=op.f("ck_employee_schedules_weekly_schedule_object"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"],
            ["platform_users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_employee_schedules_updated_by_platform_user_id_platform_users"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_employee_schedules_workspace_employee",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employee_schedules")),
        sa.UniqueConstraint("workspace_id", "employee_id", name="uq_employee_schedules_employee"),
    )
    op.create_index(
        "ix_employee_schedules_employee",
        "employee_schedules",
        ["workspace_id", "employee_id"],
    )

    op.create_table(
        "attachments",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=True),
        sa.Column("employee_id", sa.Uuid(), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=False),
        sa.Column("classification", sa.String(length=32), nullable=False),
        sa.Column("retention_until", sa.Date(), nullable=True),
        sa.Column("uploaded_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(checksum_sha256) = 64",
            name=op.f("ck_attachments_checksum_length"),
        ),
        sa.CheckConstraint(
            "classification IN ('internal', 'customer_document', 'employee_document')",
            name=op.f("ck_attachments_classification_values"),
        ),
        sa.CheckConstraint(
            "size_bytes > 0 AND size_bytes <= 10485760",
            name=op.f("ck_attachments_size_range"),
        ),
        sa.CheckConstraint(
            "(customer_id IS NOT NULL AND employee_id IS NULL) OR "
            "(customer_id IS NULL AND employee_id IS NOT NULL)",
            name=op.f("ck_attachments_single_owner"),
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_platform_user_id"],
            ["platform_users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_attachments_uploaded_by_platform_user_id_platform_users"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            ondelete="RESTRICT",
            name="fk_attachments_workspace_customer",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_attachments_workspace_employee",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="RESTRICT",
            name=op.f("fk_attachments_workspace_id_workspaces"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_attachments")),
        sa.UniqueConstraint("storage_key", name=op.f("uq_attachments_storage_key")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_attachments_workspace_id"),
    )
    op.create_index(
        "ix_attachments_customer",
        "attachments",
        ["workspace_id", "customer_id", "created_at"],
    )
    op.create_index(
        "ix_attachments_employee",
        "attachments",
        ["workspace_id", "employee_id", "created_at"],
    )
    op.create_index(
        "ix_attachments_uploader", "attachments", ["uploaded_by_platform_user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_attachments_uploader", table_name="attachments")
    op.drop_index("ix_attachments_employee", table_name="attachments")
    op.drop_index("ix_attachments_customer", table_name="attachments")
    op.drop_table("attachments")
    op.drop_index("ix_employee_schedules_employee", table_name="employee_schedules")
    op.drop_table("employee_schedules")
    op.drop_index("ix_employee_supervisors_supervisor", table_name="employee_supervisors")
    op.drop_index("ix_employee_supervisors_employee", table_name="employee_supervisors")
    op.drop_table("employee_supervisors")
    op.drop_index(
        "ix_employee_branches_workspace_employee", table_name="employee_branch_assignments"
    )
    op.drop_index(
        "ix_employee_branches_workspace_branch", table_name="employee_branch_assignments"
    )
    op.drop_table("employee_branch_assignments")
    op.drop_index(
        "ix_customer_branches_workspace_customer", table_name="customer_branch_assignments"
    )
    op.drop_index(
        "ix_customer_branches_workspace_branch", table_name="customer_branch_assignments"
    )
    op.drop_table("customer_branch_assignments")
    op.drop_index("uq_employees_workspace_platform_user", table_name="employees")
    op.drop_index("ix_employees_workspace_status", table_name="employees")
    op.drop_index("ix_employees_workspace_name", table_name="employees")
    op.drop_table("employees")
    op.drop_index("ix_customers_workspace_status_type", table_name="customers")
    op.drop_index("ix_customers_workspace_name", table_name="customers")
    op.drop_table("customers")
