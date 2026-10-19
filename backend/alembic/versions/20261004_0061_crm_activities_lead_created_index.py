"""Index CRM activities by workspace, lead, and created time.

Revision ID: 20261004_0061
Revises: 20261004_0060
Create Date: 2026-10-05

"""

from collections.abc import Sequence

from alembic import op

revision: str = "20261004_0061"
down_revision: str | Sequence[str] | None = "20261004_0060"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_crm_activities_workspace_lead_created",
        "crm_activities",
        ["workspace_id", "lead_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_crm_activities_workspace_lead_created", table_name="crm_activities")
