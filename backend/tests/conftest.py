from collections.abc import Generator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from app.config import settings
from app.db.session import dispose_engine
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url


def _migration_config() -> Config:
    return Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))


@pytest.fixture(autouse=True)
def ensure_database_schema_at_head(request: pytest.FixtureRequest) -> Generator[None]:
    if "integration" not in request.keywords:
        yield
        return
    dispose_engine()
    command.upgrade(_migration_config(), "head")
    dispose_engine()
    yield
    dispose_engine()
    command.upgrade(_migration_config(), "head")
    dispose_engine()


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    del config
    database_name = make_url(settings.database_url).database
    safe_integration_target = settings.app_env == "test" and database_name == "erp_test"
    if safe_integration_target:
        return
    skip = pytest.mark.skip(
        reason="Integration tests require APP_ENV=test and a disposable erp_test database."
    )
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip)


@pytest.fixture
def client() -> Generator[TestClient]:
    dispose_engine()
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    dispose_engine()


@pytest.fixture
def app_client() -> Generator[TestClient]:
    dispose_engine()
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    dispose_engine()
