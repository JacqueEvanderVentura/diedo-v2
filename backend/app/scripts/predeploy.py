"""Run the production database preparation as one Railway pre-deploy command."""

from alembic import command
from alembic.config import Config

from app.scripts.seed_demo import main as seed_demo


def main() -> None:
    """Apply forward migrations, then reconcile the reserved demo workspace."""
    command.upgrade(Config("alembic.ini"), "head")
    seed_demo()


if __name__ == "__main__":
    main()
