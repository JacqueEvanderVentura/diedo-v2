"""Employee identity document, HR residence, and labor-contract attachments.

Revision ID: 20261026_0080
Revises: 20261020_0079
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261026_0080"
down_revision: str | Sequence[str] | None = "20261020_0079"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CLASSIFICATION_CHECK = (
    "classification IN ('internal', 'customer_document', 'employee_document', 'labor_contract')"
)
_PREVIOUS_CLASSIFICATION_CHECK = (
    "classification IN ('internal', 'customer_document', 'employee_document')"
)


def upgrade() -> None:
    op.add_column("employees", sa.Column("document_type", sa.String(length=16), nullable=True))
    op.add_column("employees", sa.Column("document_id", sa.String(length=64), nullable=True))
    op.add_column(
        "employees",
        sa.Column("normalized_document_id", sa.String(length=64), nullable=True),
    )
    op.create_check_constraint(
        "employee_document_type_values",
        "employees",
        "document_type IS NULL OR document_type IN ('cedula', 'pasaporte')",
    )
    op.create_index(
        "ix_employees_workspace_normalized_document",
        "employees",
        ["workspace_id", "normalized_document_id"],
    )
    op.create_index(
        "uq_employees_workspace_document_active",
        "employees",
        ["workspace_id", "normalized_document_id"],
        unique=True,
        postgresql_where=sa.text("normalized_document_id IS NOT NULL AND status <> 'archived'"),
    )

    op.add_column(
        "employee_hr_profiles",
        sa.Column("residence_location", sa.String(length=120), nullable=True),
    )

    op.drop_constraint(op.f("ck_attachments_classification_values"), "attachments", type_="check")
    op.create_check_constraint(
        op.f("ck_attachments_classification_values"),
        "attachments",
        _CLASSIFICATION_CHECK,
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_attachments_classification_values"), "attachments", type_="check")
    op.create_check_constraint(
        op.f("ck_attachments_classification_values"),
        "attachments",
        _PREVIOUS_CLASSIFICATION_CHECK,
    )

    op.drop_column("employee_hr_profiles", "residence_location")

    op.drop_index("uq_employees_workspace_document_active", table_name="employees")
    op.drop_index("ix_employees_workspace_normalized_document", table_name="employees")
    op.drop_constraint("employee_document_type_values", "employees", type_="check")
    op.drop_column("employees", "normalized_document_id")
    op.drop_column("employees", "document_id")
    op.drop_column("employees", "document_type")
