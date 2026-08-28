import uuid

from app.config import settings
from app.main import create_app
from fastapi.testclient import TestClient


def test_health_returns_liveness_without_database(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    uuid.UUID(response.headers["X-Request-Id"])


def test_health_propagates_valid_request_id(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Request-Id": "request-123"})

    assert response.status_code == 200
    assert response.headers["X-Request-Id"] == "request-123"


def test_health_replaces_unsafe_request_id(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Request-Id": "invalid request id"})

    assert response.status_code == 200
    assert response.headers["X-Request-Id"] != "invalid request id"
    uuid.UUID(response.headers["X-Request-Id"])


def test_docs_redirect_to_swagger(client: TestClient) -> None:
    response = client.get("/docs", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/swagger/index.html"


def test_swagger_redirect(client: TestClient) -> None:
    response = client.get("/swagger", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/swagger/index.html"


def test_not_found_uses_error_envelope(client: TestClient) -> None:
    response = client.get("/missing")

    assert response.status_code == 404
    assert response.json() == {"message": "Not Found", "parameter": None}


def test_production_app_disables_interactive_docs(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    application = create_app()

    with TestClient(application) as production_client:
        response = production_client.get("/docs")

    assert response.status_code == 404
