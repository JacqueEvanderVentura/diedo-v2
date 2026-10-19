"""Run the production database preparation as one Railway pre-deploy command."""

from alembic import command
from alembic.config import Config


def main() -> None:
    """Apply forward migrations only."""
    command.upgrade(Config("alembic.ini"), "head")


if __name__ == "__main__":
    main()
