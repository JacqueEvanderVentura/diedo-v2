"""Link personnel incidents to employees for operational reporting.

Revision ID: 20260903_0019
Revises: 20260903_0018
Create Date: 2026-09-03

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260903_0019"
down_revision: str | Sequence[str] | None = "20260903_0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("incidents", sa.Column("employee_id", sa.Uuid(), nullable=True))
    op.add_column(
        "incidents", sa.Column("employee_incident_kind", sa.String(length=24), nullable=True)
    )
    op.create_foreign_key(
        "fk_incidents_workspace_employee",
        "incidents",
        "employees",
        ["workspace_id", "employee_id"],
        ["workspace_id", "id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        op.f("ck_incidents_employee_incident_fields"),
        "incidents",
        "(incident_type = 'personal' AND "
        "((employee_id IS NULL AND employee_incident_kind IS NULL) OR "
        "(employee_id IS NOT NULL AND employee_incident_kind IN "
        "('ausencia', 'tardanza', 'amonestacion', 'licencia_medica', 'otro')))) OR "
        "(incident_type <> 'personal' AND employee_id IS NULL "
        "AND employee_incident_kind IS NULL)",
    )
    op.create_index(
        "ix_incidents_workspace_employee_created",
        "incidents",
        ["workspace_id", "employee_id", "created_at"],
        unique=False,
        postgresql_where=sa.text("employee_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_incidents_workspace_employee_created", table_name="incidents")
    op.drop_constraint(
        op.f("ck_incidents_employee_incident_fields"), "incidents", type_="check"
    )
    op.drop_constraint("fk_incidents_workspace_employee", "incidents", type_="foreignkey")
    op.drop_column("incidents", "employee_incident_kind")
    op.drop_column("incidents", "employee_id")
