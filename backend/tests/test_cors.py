from app.config import settings
from app.core.cors import (
    apply_cors_headers,
    normalize_origin,
    origin_allowed_for_cors,
    parse_cors_origins,
)
from app.main import create_app
from fastapi.testclient import TestClient
from starlette.requests import Request
from starlette.responses import Response


def test_parse_cors_origins_normalizes_and_deduplicates() -> None:
    raw = " https://app.example.com/,https://app.example.com,http://localhost:5173 "

    assert parse_cors_origins(raw) == [
        "https://app.example.com",
        "http://localhost:5173",
    ]
    assert normalize_origin(" https://app.example.com/ ") == "https://app.example.com"


def test_parse_cors_origins_accepts_empty_value() -> None:
    assert parse_cors_origins(None) == []
    assert parse_cors_origins("") == []


def test_cors_allows_only_configured_origin(monkeypatch) -> None:
    monkeypatch.setattr(settings, "cors_origins", "https://app.example.com")
    application = create_app()

    with TestClient(application) as client:
        allowed = client.get("/health", headers={"Origin": "https://app.example.com"})
        denied = client.get("/health", headers={"Origin": "https://other.example.com"})

    assert allowed.headers["Access-Control-Allow-Origin"] == "https://app.example.com"
    assert "Access-Control-Allow-Origin" not in denied.headers


def test_apply_cors_headers_preserves_existing_vary(monkeypatch) -> None:
    monkeypatch.setattr(settings, "cors_origins", "https://app.example.com")
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/health",
        "headers": [(b"origin", b"https://app.example.com")],
    }
    request = Request(scope)
    response = Response(headers={"Vary": "Accept-Encoding"})

    apply_cors_headers(request, response)

    assert response.headers["Access-Control-Allow-Origin"] == "https://app.example.com"
    assert response.headers["Access-Control-Allow-Credentials"] == "true"
    assert response.headers["Vary"] == "Accept-Encoding, Origin"
    assert origin_allowed_for_cors(None) is False
    assert origin_allowed_for_cors("https://other.example.com") is False


def test_apply_cors_headers_ignores_request_without_origin() -> None:
    request = Request({"type": "http", "method": "GET", "path": "/health", "headers": []})
    response = Response()

    apply_cors_headers(request, response)

    assert "Access-Control-Allow-Origin" not in response.headers
