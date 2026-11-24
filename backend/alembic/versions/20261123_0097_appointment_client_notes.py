"""Per-appointment client observations (distinct from staff notes)."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261123_0097"
down_revision: str | Sequence[str] | None = "20261123_0096"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "appointments",
        sa.Column("client_notes", sa.String(length=2000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("appointments", "client_notes")
