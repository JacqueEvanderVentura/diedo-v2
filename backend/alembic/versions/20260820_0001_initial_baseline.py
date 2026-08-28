"""Establish the initial ERP schema baseline.

Revision ID: 20260820_0001
Revises:
Create Date: 2026-08-20
"""

from collections.abc import Sequence

revision: str = "20260820_0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the baseline without inventing domain tables."""
    pass


def downgrade() -> None:
    """Remove the baseline marker."""
    pass
