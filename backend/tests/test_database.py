import pytest
from app.api.routers.health import readiness
from app.db.base import NAMING_CONVENTION, Base
from app.db.session import get_engine, session_scope
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError


@pytest.mark.integration
def test_postgres_connection_and_transaction_scope() -> None:
    assert get_engine().dialect.name == "postgresql"

    with session_scope() as session:
        assert session.execute(text("SELECT 1")).scalar_one() == 1


@pytest.mark.integration
def test_readiness_checks_postgres(client: TestClient) -> None:
    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "database": "ok",
        "schemaStatus": "compatible",
        "schemaRevision": "20260831_0010",
    }


def test_declarative_base_uses_stable_constraint_names() -> None:
    assert Base.metadata.naming_convention == NAMING_CONVENTION
    assert NAMING_CONVENTION["pk"] == "pk_%(table_name)s"


def test_readiness_returns_service_unavailable_when_database_fails() -> None:
    class FailingSession:
        def execute(self, _statement):
            raise OperationalError("SELECT 1", {}, RuntimeError("offline"))

    with pytest.raises(HTTPException) as captured:
        readiness(FailingSession())  # type: ignore[arg-type]

    assert captured.value.status_code == 503
    assert captured.value.detail == {
        "message": "La base de datos no esta disponible.",
        "parameter": None,
    }
