"""Add meta_business_name to chat channel accounts."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261122_0095"
down_revision: str | Sequence[str] | None = "20261121_0094"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "chat_channel_accounts",
        sa.Column("meta_business_name", sa.String(length=160), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("chat_channel_accounts", "meta_business_name")
