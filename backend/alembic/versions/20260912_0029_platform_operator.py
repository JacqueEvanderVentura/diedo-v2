"""Platform operator flag on platform_users.

Revision ID: 20260912_0029
Revises: 20260912_0028
Create Date: 2026-09-12

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260912_0029"
down_revision: str | Sequence[str] | None = "20260912_0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "platform_users",
        sa.Column(
            "is_platform_operator",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("platform_users", "is_platform_operator")
