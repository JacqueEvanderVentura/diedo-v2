from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from app.config import settings
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError


@pytest.mark.integration
def test_0021_converts_existing_appointment_statuses_and_preserves_constraints() -> None:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    migration = ScriptDirectory.from_config(config).get_revision("20260908_0021").module
    engine = create_engine(settings.database_url)
    try:
        with engine.connect() as connection, connection.begin():
            # A temporary table shadows the application table only on this connection.
            # No shared rows or Alembic version are changed, including on CI.
            connection.execute(
                text(
                    """
                    CREATE TEMP TABLE appointments (
                        id integer PRIMARY KEY,
                        status varchar(16) NOT NULL,
                        created_at timestamptz NOT NULL,
                        updated_at timestamptz,
                        workspace_id integer NOT NULL DEFAULT 1,
                        branch_id integer NOT NULL DEFAULT 1,
                        resource_id integer NOT NULL,
                        employee_id integer,
                        scheduled_period tstzrange NOT NULL,
                        record_status varchar(16) NOT NULL DEFAULT 'active',
                        CONSTRAINT ck_appointments_status_values CHECK (
                            status IN ('pending', 'confirmed', 'completed', 'attended',
                                       'no_show', 'cancelled', 'delayed', 'rescheduled')
                        )
                    ) ON COMMIT DROP
                    """
                )
            )
            for target in ("resource", "employee"):
                connection.execute(
                    text(
                        f"""
                        ALTER TABLE appointments
                        ADD CONSTRAINT excl_appointments_{target}_period
                        EXCLUDE USING gist (
                            workspace_id WITH =, branch_id WITH =,
                            {target}_id WITH =, scheduled_period WITH &&
                        ) WHERE (record_status = 'active' AND
                            status IN ('pending', 'confirmed', 'delayed', 'rescheduled'))
                        """
                    )
                )
            legacy_statuses = (
                "completed",
                "attended",
                "pending",
                "delayed",
                "rescheduled",
                "confirmed",
                "no_show",
                "cancelled",
            )
            created_at = datetime(2026, 9, 1, 10, tzinfo=UTC)
            updated_at = datetime(2026, 9, 1, 11, tzinfo=UTC)
            for identifier, status in enumerate(legacy_statuses, start=1):
                connection.execute(
                    text(
                        """
                        INSERT INTO appointments
                            (id, status, created_at, updated_at, resource_id, employee_id,
                             scheduled_period)
                        VALUES (:id, :status, :created, :updated, :id, :id,
                            tstzrange(:created, :ends, '[)'))
                        """
                    ),
                    {
                        "id": identifier,
                        "status": status,
                        "created": created_at,
                        "updated": None if status == "attended" else updated_at,
                        "ends": updated_at,
                    },
                )

            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()

            rows = connection.execute(text("SELECT * FROM appointments ORDER BY id")).mappings()
            for legacy_status, row in zip(legacy_statuses, rows, strict=True):
                if legacy_status in ("completed", "attended"):
                    assert row["status"] == "fulfilled"
                    assert row["completed_at"] == (
                        created_at if legacy_status == "attended" else updated_at
                    )
                    assert row["completion_punctuality"] == "on_time"
                else:
                    assert row["status"] == (
                        legacy_status if legacy_status in ("no_show", "cancelled") else "confirmed"
                    )
                    assert row["completed_at"] is None
                    assert row["completion_punctuality"] is None
                assert row["delay_responsibility"] is None
                assert row["completion_note"] is None

            for statement, constraint in (
                (
                    "UPDATE appointments SET status = 'pending' WHERE id = 3",
                    "ck_appointments_status_values",
                ),
                (
                    "UPDATE appointments SET status = 'fulfilled' WHERE id = 3",
                    "ck_appointments_fulfilled_completion",
                ),
                (
                    "UPDATE appointments SET resource_id = 3 WHERE id = 4",
                    "excl_appointments_resource_period",
                ),
                (
                    "UPDATE appointments SET employee_id = 3 WHERE id = 4",
                    "excl_appointments_employee_period",
                ),
            ):
                with pytest.raises(IntegrityError) as error, connection.begin_nested():
                    connection.execute(text(statement))
                assert error.value.orig.diag.constraint_name == constraint

            # Fulfilled appointments release the slot, including for the same employee.
            connection.execute(
                text("UPDATE appointments SET resource_id = 1, employee_id = 1 WHERE id = 3")
            )
    finally:
        engine.dispose()
