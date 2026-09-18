"""Align crm_discovery_usage.id default with SQLAlchemy models.

Revision ID: 20260918_0036
Revises: 20260918_0035
"""

import sqlalchemy as sa
from alembic import op

revision = "20260918_0036"
down_revision = "20260918_0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("crm_discovery_usage", "id", server_default=sa.text("uuidv7()"))


def downgrade() -> None:
    op.alter_column("crm_discovery_usage", "id", server_default=None)
