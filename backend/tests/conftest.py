from collections.abc import Generator

import pytest
from app.db.session import dispose_engine
from app.main import app
from fastapi.testclient import TestClient


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
