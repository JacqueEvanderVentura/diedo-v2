from collections.abc import Generator

import pytest
from app.config import settings
from app.db.session import dispose_engine
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url


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
