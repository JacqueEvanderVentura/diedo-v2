"""Agenda resources, appointments, history, and overlap protection.

Revision ID: 20260830_0009
Revises: 20260830_0008
Create Date: 2026-08-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260830_0009"
down_revision: str | Sequence[str] | None = "20260830_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PERMISSION_CODES = ("appointment.read", "appointment.manage")
_ACTIVE_STATUS_SQL = "status IN ('pending', 'confirmed', 'delayed', 'rescheduled')"


def _id_column() -> sa.Column[object]:
    return sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False)


def _timestamps() -> list[sa.Column[object]]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
    ]


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.create_table(
        "appointment_resources",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(48), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("resource_type", sa.String(24), server_default="room", nullable=False),
        sa.Column("status", sa.String(16), server_default="active", nullable=False),
        _id_column(),
        *_timestamps(),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint(
            "resource_type IN ('room', 'equipment', 'other')",
            name=op.f("ck_appointment_resources_resource_type_values"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'archived')",
            name=op.f("ck_appointment_resources_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_appointment_resources_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_appointment_resources_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_appointment_resources")),
        sa.UniqueConstraint(
            "workspace_id",
            "branch_id",
            "id",
            name="uq_appointment_resources_scope_id",
        ),
        sa.UniqueConstraint(
            "workspace_id",
            "branch_id",
            "code",
            name="uq_appointment_resources_scope_code",
        ),
    )
    op.create_index(
        "ix_appointment_resources_workspace_branch_status",
        "appointment_resources",
        ["workspace_id", "branch_id", "status"],
    )

    op.create_table(
        "appointments",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("resource_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid()),
        sa.Column("employee_id", sa.Uuid()),
        sa.Column("service_id", sa.Uuid()),
        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column("scheduled_time", sa.Time(), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "scheduled_period",
            postgresql.TSTZRANGE(),
            sa.Computed("tstzrange(starts_at, ends_at, '[)')", persisted=True),
            nullable=False,
        ),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("customer_name", sa.String(200), nullable=False),
        sa.Column("customer_phone", sa.String(40)),
        sa.Column("service_name", sa.String(200), nullable=False),
        sa.Column("price", sa.Numeric(14, 2), server_default="0", nullable=False),
        sa.Column("status", sa.String(16), server_default="confirmed", nullable=False),
        sa.Column("notes", sa.String(2000)),
        sa.Column("pending_payment", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("pending_amount", sa.Numeric(14, 2), server_default="0", nullable=False),
        sa.Column("first_time", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("free_trial", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("reminder_sent", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("source", sa.String(16), server_default="staff", nullable=False),
        sa.Column("recurrence", sa.String(16), server_default="none", nullable=False),
        sa.Column("recurrence_group_id", sa.Uuid()),
        sa.Column("occurrence_index", sa.Integer(), server_default="0", nullable=False),
        sa.Column("repeat_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_fingerprint", sa.String(64), nullable=False),
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=False),
        _id_column(),
        *_timestamps(),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint("ends_at > starts_at", name=op.f("ck_appointments_time_order")),
        sa.CheckConstraint(
            "duration_minutes >= 5 AND duration_minutes <= 480",
            name=op.f("ck_appointments_duration_range"),
        ),
        sa.CheckConstraint(
            "price >= 0 AND pending_amount >= 0",
            name=op.f("ck_appointments_money_non_negative"),
        ),
        sa.CheckConstraint(
            "pending_amount <= price", name=op.f("ck_appointments_pending_not_above_price")
        ),
        sa.CheckConstraint(
            "pending_payment OR pending_amount = 0",
            name=op.f("ck_appointments_pending_amount_requires_flag"),
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'confirmed', 'completed', 'attended', 'no_show', "
            "'cancelled', 'delayed', 'rescheduled')",
            name=op.f("ck_appointments_status_values"),
        ),
        sa.CheckConstraint(
            "source IN ('staff', 'self')", name=op.f("ck_appointments_source_values")
        ),
        sa.CheckConstraint(
            "recurrence IN ('none', 'weekly', 'monthly')",
            name=op.f("ck_appointments_recurrence_values"),
        ),
        sa.CheckConstraint(
            "repeat_count >= 1 AND repeat_count <= 12",
            name=op.f("ck_appointments_repeat_count_range"),
        ),
        sa.CheckConstraint(
            "occurrence_index >= 0 AND occurrence_index < repeat_count",
            name=op.f("ck_appointments_occurrence_index_range"),
        ),
        sa.CheckConstraint(
            "char_length(idempotency_key) >= 8",
            name=op.f("ck_appointments_idempotency_key_length"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_appointments_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id", "resource_id"],
            [
                "appointment_resources.workspace_id",
                "appointment_resources.branch_id",
                "appointment_resources.id",
            ],
            name="fk_appointments_workspace_branch_resource",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            name="fk_appointments_workspace_customer",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            name="fk_appointments_workspace_employee",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "service_id"],
            ["items.workspace_id", "items.id"],
            name="fk_appointments_workspace_service",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_appointments_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"],
            ["platform_users.id"],
            name=op.f("fk_appointments_created_by_platform_user_id_platform_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"],
            ["platform_users.id"],
            name=op.f("fk_appointments_updated_by_platform_user_id_platform_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_appointments")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_appointments_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id",
            "idempotency_key",
            "occurrence_index",
            name="uq_appointments_idempotency_occurrence",
        ),
        postgresql.ExcludeConstraint(
            ("workspace_id", "="),
            ("branch_id", "="),
            ("resource_id", "="),
            ("scheduled_period", "&&"),
            where=sa.text(_ACTIVE_STATUS_SQL),
            using="gist",
            name="excl_appointments_resource_period",
        ),
        postgresql.ExcludeConstraint(
            ("workspace_id", "="),
            ("branch_id", "="),
            ("employee_id", "="),
            ("scheduled_period", "&&"),
            where=sa.text(f"employee_id IS NOT NULL AND {_ACTIVE_STATUS_SQL}"),
            using="gist",
            name="excl_appointments_employee_period",
        ),
    )
    op.create_index(
        "ix_appointments_workspace_branch_date",
        "appointments",
        ["workspace_id", "branch_id", "scheduled_date", "starts_at"],
    )
    op.create_index(
        "ix_appointments_workspace_status_date",
        "appointments",
        ["workspace_id", "status", "scheduled_date"],
    )
    op.create_index(
        "ix_appointments_workspace_customer",
        "appointments",
        ["workspace_id", "customer_id", "starts_at"],
    )
    op.create_index(
        "ix_appointments_workspace_employee",
        "appointments",
        ["workspace_id", "employee_id", "starts_at"],
    )
    op.create_index(
        "ix_appointments_workspace_service", "appointments", ["workspace_id", "service_id"]
    )
    op.create_index(
        "ix_appointments_workspace_resource",
        "appointments",
        ["workspace_id", "resource_id", "starts_at"],
    )

    op.create_table(
        "appointment_events",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("appointment_id", sa.Uuid(), nullable=False),
        sa.Column("actor_platform_user_id", sa.Uuid()),
        sa.Column("actor_name", sa.String(160), nullable=False),
        sa.Column("action", sa.String(24), nullable=False),
        sa.Column("changes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("request_id", sa.String(128)),
        sa.Column(
            "occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        _id_column(),
        sa.CheckConstraint(
            "action IN ('create', 'update', 'status_change')",
            name=op.f("ck_appointment_events_action_values"),
        ),
        sa.CheckConstraint(
            "jsonb_typeof(changes) = 'object'",
            name=op.f("ck_appointment_events_changes_object"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "appointment_id"],
            ["appointments.workspace_id", "appointments.id"],
            name="fk_appointment_events_workspace_appointment",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_appointment_events_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["actor_platform_user_id"],
            ["platform_users.id"],
            name=op.f("fk_appointment_events_actor_platform_user_id_platform_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_appointment_events")),
    )
    op.create_index(
        "ix_appointment_events_workspace_appointment_occurred",
        "appointment_events",
        ["workspace_id", "appointment_id", "occurred_at"],
    )

    _install_agenda_catalogs()
    _seed_default_resources()


def _install_agenda_catalogs() -> None:
    op.execute(
        """
        INSERT INTO module_definitions (code, name, kind, status, dependency_codes)
        VALUES ('appointments', 'Appointments', 'optional', 'available', '["crm", "catalog", "hr"]')
        ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            kind = EXCLUDED.kind,
            status = EXCLUDED.status,
            dependency_codes = EXCLUDED.dependency_codes,
            updated_at = now()
        """
    )
    op.execute(
        """
        INSERT INTO permissions
            (code, module_code, action, name, description, sort_order, is_platform_only)
        VALUES
            ('appointment.read', 'appointments', 'read', 'Ver agenda',
             'View appointment resources, calendar, and appointment management.', 10, false),
            ('appointment.manage', 'appointments', 'manage', 'Gestionar citas',
             'Create, reschedule, update, and cancel appointments.', 20, false)
        ON CONFLICT (code) DO UPDATE SET
            module_code = EXCLUDED.module_code,
            action = EXCLUDED.action,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            sort_order = EXCLUDED.sort_order,
            is_platform_only = EXCLUDED.is_platform_only,
            updated_at = now()
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (workspace_id, role_id, permission_id)
        SELECT role.workspace_id, role.id, permission.id
        FROM roles AS role
        CROSS JOIN permissions AS permission
        WHERE role.code = 'workspace_admin'
          AND role.status = 'active'
          AND permission.code IN ('appointment.read', 'appointment.manage')
        ON CONFLICT (workspace_id, role_id, permission_id) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO module_entitlements
            (workspace_id, module_definition_id, status, effective_from)
        SELECT workspace.id, module.id, 'enabled', now()
        FROM workspaces AS workspace
        JOIN module_definitions AS module ON module.code = 'appointments'
        ON CONFLICT (workspace_id, module_definition_id) DO NOTHING
        """
    )


def _seed_default_resources() -> None:
    op.execute(
        """
        INSERT INTO appointment_resources
            (workspace_id, branch_id, code, name, resource_type, status)
        SELECT branch.workspace_id, branch.id, resource.code, resource.name, 'room', 'active'
        FROM branches AS branch
        CROSS JOIN (
            VALUES
                ('cab1', 'Cabina 1'),
                ('cab2', 'Cabina 2'),
                ('cab3', 'Cabina 3'),
                ('cab4', 'Cabina 4'),
                ('cab5', 'Cabina 5 Ventas')
        ) AS resource(code, name)
        WHERE branch.status = 'active'
        ON CONFLICT (workspace_id, branch_id, code) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id IN "
            "(SELECT id FROM permissions WHERE code = ANY(:codes))"
        ).bindparams(
            sa.bindparam("codes", list(_PERMISSION_CODES), type_=postgresql.ARRAY(sa.Text()))
        )
    )
    op.execute(
        sa.text("DELETE FROM permissions WHERE code = ANY(:codes)").bindparams(
            sa.bindparam("codes", list(_PERMISSION_CODES), type_=postgresql.ARRAY(sa.Text()))
        )
    )
    op.execute("UPDATE module_definitions SET status = 'planned' WHERE code = 'appointments'")
    op.drop_index(
        "ix_appointment_events_workspace_appointment_occurred", table_name="appointment_events"
    )
    op.drop_table("appointment_events")
    op.drop_index("ix_appointments_workspace_resource", table_name="appointments")
    op.drop_index("ix_appointments_workspace_service", table_name="appointments")
    op.drop_index("ix_appointments_workspace_employee", table_name="appointments")
    op.drop_index("ix_appointments_workspace_customer", table_name="appointments")
    op.drop_index("ix_appointments_workspace_status_date", table_name="appointments")
    op.drop_index("ix_appointments_workspace_branch_date", table_name="appointments")
    op.drop_table("appointments")
    op.drop_index(
        "ix_appointment_resources_workspace_branch_status", table_name="appointment_resources"
    )
    op.drop_table("appointment_resources")
