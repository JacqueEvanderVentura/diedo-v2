from __future__ import annotations

from types import ModuleType
from typing import Any

import pytest
from app.services.chat.graph_clients import GraphApiError, _HttpxGraphClient


class _FakeResponse:
    def __init__(self, *, status_code: int, payload: object) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> object:
        return self._payload


class _FakeClient:
    def __init__(
        self,
        *,
        response: _FakeResponse | None = None,
        error: Exception | None = None,
    ) -> None:
        self._response = response
        self._error = error
        self.requests: list[tuple[str, str, dict[str, Any]]] = []

    def request(self, method: str, url: str, **kwargs: Any) -> _FakeResponse:
        self.requests.append((method, url, kwargs))
        if self._error is not None:
            raise self._error
        assert self._response is not None
        return self._response

    def __enter__(self) -> _FakeClient:
        return self

    def __exit__(self, *args: object) -> None:
        return None


def _install_fake_httpx(
    monkeypatch: pytest.MonkeyPatch,
    *,
    client: _FakeClient,
) -> None:
    class RequestError(Exception):
        pass

    fake_httpx = ModuleType("httpx")
    fake_httpx.Client = lambda **kwargs: client  # type: ignore[misc, assignment]
    fake_httpx.RequestError = RequestError
    monkeypatch.setitem(__import__("sys").modules, "httpx", fake_httpx)


def test_httpx_graph_client_maps_request_error(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_httpx = ModuleType("httpx")

    class RequestError(Exception):
        pass

    client = _FakeClient(error=RequestError("timeout"))
    fake_httpx.Client = lambda **kwargs: client  # type: ignore[misc, assignment]
    fake_httpx.RequestError = RequestError
    monkeypatch.setitem(__import__("sys").modules, "httpx", fake_httpx)

    with pytest.raises(GraphApiError) as exc_info:
        _HttpxGraphClient().request("GET", "https://graph.facebook.com/v21.0/me")
    assert exc_info.value.status_code is None


def test_httpx_graph_client_maps_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _FakeClient(response=_FakeResponse(status_code=400, payload={"error": "bad"}))
    _install_fake_httpx(monkeypatch, client=client)

    with pytest.raises(GraphApiError) as exc_info:
        _HttpxGraphClient().request("POST", "https://graph.facebook.com/v21.0/x/messages")
    assert exc_info.value.status_code == 400


def test_httpx_graph_client_rejects_non_object_json(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _FakeClient(response=_FakeResponse(status_code=200, payload=["not", "a", "dict"]))
    _install_fake_httpx(monkeypatch, client=client)

    with pytest.raises(TypeError, match="JSON object"):
        _HttpxGraphClient().request("GET", "https://graph.facebook.com/v21.0/me")


def test_httpx_graph_client_returns_dict_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _FakeClient(response=_FakeResponse(status_code=200, payload={"ok": True}))
    _install_fake_httpx(monkeypatch, client=client)

    payload = _HttpxGraphClient().request(
        "GET",
        "https://graph.facebook.com/v21.0/me",
        timeout=12.0,
        headers={"Authorization": "Bearer x"},
    )
    assert payload == {"ok": True}
    assert "timeout" not in client.requests[0][2]
