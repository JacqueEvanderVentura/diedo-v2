"""Add appointment soft deletion and its dedicated permission.

Revision ID: 20260903_0017
Revises: 20260901_0016
Create Date: 2026-09-03

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260903_0017"
down_revision: str | Sequence[str] | None = "20260901_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACTIVE_STATUS_SQL = "status IN ('pending', 'confirmed', 'delayed', 'rescheduled')"


def _drop_slot_constraints() -> None:
    op.execute(
        "ALTER TABLE appointments DROP CONSTRAINT excl_appointments_resource_period"
    )
    op.execute(
        "ALTER TABLE appointments DROP CONSTRAINT excl_appointments_employee_period"
    )


def _create_slot_constraints(*, active_records_only: bool) -> None:
    record_predicate = "record_status = 'active' AND " if active_records_only else ""
    op.execute(
        f"""
        ALTER TABLE appointments
        ADD CONSTRAINT excl_appointments_resource_period
        EXCLUDE USING gist (
            workspace_id WITH =,
            branch_id WITH =,
            resource_id WITH =,
            scheduled_period WITH &&
        )
        WHERE ({record_predicate}{_ACTIVE_STATUS_SQL})
        """
    )
    op.execute(
        f"""
        ALTER TABLE appointments
        ADD CONSTRAINT excl_appointments_employee_period
        EXCLUDE USING gist (
            workspace_id WITH =,
            branch_id WITH =,
            employee_id WITH =,
            scheduled_period WITH &&
        )
        WHERE (employee_id IS NOT NULL AND {record_predicate}{_ACTIVE_STATUS_SQL})
        """
    )


def upgrade() -> None:
    op.add_column(
        "appointments",
        sa.Column(
            "record_status",
            sa.String(length=16),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
    )
    op.add_column(
        "appointments",
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        op.f("ck_appointments_record_status_values"),
        "appointments",
        "record_status IN ('active', 'inactive')",
    )
    op.create_check_constraint(
        op.f("ck_appointments_deactivation_consistency"),
        "appointments",
        "(record_status = 'active' AND deactivated_at IS NULL) OR "
        "(record_status = 'inactive' AND deactivated_at IS NOT NULL)",
    )
    op.create_index(
        "ix_appointments_workspace_record_status",
        "appointments",
        ["workspace_id", "record_status"],
    )
    _drop_slot_constraints()
    _create_slot_constraints(active_records_only=True)

    op.execute(
        """
        INSERT INTO permissions
            (code, module_code, action, name, description, sort_order, is_platform_only)
        VALUES
            ('appointment.delete', 'appointments', 'delete', 'Eliminar citas',
             'Deactivate appointments while preserving their audit history.', 30, false)
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
          AND permission.code = 'appointment.delete'
        ON CONFLICT (workspace_id, role_id, permission_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM role_permissions WHERE permission_id = "
        "(SELECT id FROM permissions WHERE code = 'appointment.delete')"
    )
    op.execute("DELETE FROM permissions WHERE code = 'appointment.delete'")

    _drop_slot_constraints()
    # The previous schema has no independent record lifecycle. Mapping inactive
    # rows to its non-blocking business status prevents overlapping soft-deleted
    # appointments from making the downgrade impossible.
    op.execute(
        "UPDATE appointments SET status = 'cancelled', pending_payment = false, "
        "pending_amount = 0 WHERE record_status = 'inactive'"
    )
    _create_slot_constraints(active_records_only=False)
    op.drop_index("ix_appointments_workspace_record_status", table_name="appointments")
    op.drop_constraint(
        op.f("ck_appointments_deactivation_consistency"),
        "appointments",
        type_="check",
    )
    op.drop_constraint(
        op.f("ck_appointments_record_status_values"),
        "appointments",
        type_="check",
    )
    op.drop_column("appointments", "deactivated_at")
    op.drop_column("appointments", "record_status")
