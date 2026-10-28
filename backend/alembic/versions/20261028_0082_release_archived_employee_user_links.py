"""Release platform users still linked to archived employees.

Revision ID: 20261028_0082
Revises: 20261028_0081
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20261028_0082"
down_revision: str | Sequence[str] | None = "20261028_0081"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "UPDATE employees SET platform_user_id = NULL "
        "WHERE status = 'archived' AND platform_user_id IS NOT NULL"
    )


def downgrade() -> None:
    pass
