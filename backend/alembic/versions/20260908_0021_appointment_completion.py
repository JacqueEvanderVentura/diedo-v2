"""Simplify appointment statuses and add completion metadata.

Revision ID: 20260908_0021
Revises: 20260907_0020
Create Date: 2026-09-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260908_0021"
down_revision: str | Sequence[str] | None = "20260907_0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACTIVE_STATUS_SQL = "status = 'confirmed'"


def _drop_slot_constraints() -> None:
    op.execute("ALTER TABLE appointments DROP CONSTRAINT excl_appointments_resource_period")
    op.execute("ALTER TABLE appointments DROP CONSTRAINT excl_appointments_employee_period")


def _create_slot_constraints() -> None:
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
        WHERE (record_status = 'active' AND {_ACTIVE_STATUS_SQL})
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
        WHERE (employee_id IS NOT NULL AND record_status = 'active' AND {_ACTIVE_STATUS_SQL})
        """
    )


def upgrade() -> None:
    op.add_column("appointments", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("appointments", sa.Column("completion_punctuality", sa.String(length=16), nullable=True))
    op.add_column("appointments", sa.Column("delay_responsibility", sa.String(length=16), nullable=True))
    op.add_column("appointments", sa.Column("completion_note", sa.String(length=500), nullable=True))

    op.execute(
        """
        UPDATE appointments
        SET status = 'fulfilled',
            completed_at = COALESCE(updated_at, created_at),
            completion_punctuality = 'on_time'
        WHERE status IN ('completed', 'attended')
        """
    )
    op.execute(
        """
        UPDATE appointments
        SET status = 'confirmed'
        WHERE status IN ('pending', 'delayed', 'rescheduled')
        """
    )

    op.drop_constraint(op.f("ck_appointments_status_values"), "appointments", type_="check")
    op.create_check_constraint(
        op.f("ck_appointments_status_values"),
        "appointments",
        "status IN ('confirmed', 'fulfilled', 'no_show', 'cancelled')",
    )
    op.create_check_constraint(
        op.f("ck_appointments_completion_punctuality_values"),
        "appointments",
        "completion_punctuality IS NULL OR completion_punctuality IN ('on_time', 'delayed')",
    )
    op.create_check_constraint(
        op.f("ck_appointments_delay_responsibility_values"),
        "appointments",
        "delay_responsibility IS NULL OR delay_responsibility IN ('center', 'customer')",
    )
    op.create_check_constraint(
        op.f("ck_appointments_fulfilled_completion"),
        "appointments",
        "(status = 'fulfilled' AND completed_at IS NOT NULL AND completion_punctuality IS NOT NULL) OR "
        "(status <> 'fulfilled' AND completed_at IS NULL AND completion_punctuality IS NULL "
        "AND delay_responsibility IS NULL AND completion_note IS NULL)",
    )
    op.create_check_constraint(
        op.f("ck_appointments_delayed_responsibility"),
        "appointments",
        "completion_punctuality <> 'delayed' OR delay_responsibility IS NOT NULL",
    )

    _drop_slot_constraints()
    _create_slot_constraints()


def downgrade() -> None:
    _drop_slot_constraints()
    op.execute(
        """
        ALTER TABLE appointments
        ADD CONSTRAINT excl_appointments_resource_period
        EXCLUDE USING gist (
            workspace_id WITH =,
            branch_id WITH =,
            resource_id WITH =,
            scheduled_period WITH &&
        )
        WHERE (record_status = 'active' AND status IN ('pending', 'confirmed', 'delayed', 'rescheduled'))
        """
    )
    op.execute(
        """
        ALTER TABLE appointments
        ADD CONSTRAINT excl_appointments_employee_period
        EXCLUDE USING gist (
            workspace_id WITH =,
            branch_id WITH =,
            employee_id WITH =,
            scheduled_period WITH &&
        )
        WHERE (employee_id IS NOT NULL AND record_status = 'active' AND status IN ('pending', 'confirmed', 'delayed', 'rescheduled'))
        """
    )

    op.drop_constraint(op.f("ck_appointments_delayed_responsibility"), "appointments", type_="check")
    op.drop_constraint(op.f("ck_appointments_fulfilled_completion"), "appointments", type_="check")
    op.drop_constraint(op.f("ck_appointments_delay_responsibility_values"), "appointments", type_="check")
    op.drop_constraint(op.f("ck_appointments_completion_punctuality_values"), "appointments", type_="check")
    op.drop_constraint(op.f("ck_appointments_status_values"), "appointments", type_="check")

    op.execute("UPDATE appointments SET status = 'completed' WHERE status = 'fulfilled'")
    op.create_check_constraint(
        op.f("ck_appointments_status_values"),
        "appointments",
        "status IN ('pending', 'confirmed', 'completed', 'attended', 'no_show', "
        "'cancelled', 'delayed', 'rescheduled')",
    )

    op.drop_column("appointments", "completion_note")
    op.drop_column("appointments", "delay_responsibility")
    op.drop_column("appointments", "completion_punctuality")
    op.drop_column("appointments", "completed_at")
