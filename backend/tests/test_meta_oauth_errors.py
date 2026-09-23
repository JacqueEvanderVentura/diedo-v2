from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid7

import pytest
from app.config import settings
from app.core.security import hash_password
from app.db.models import ChatOauthState
from app.db.session import session_scope
from app.services.chat.meta_oauth import MetaOauthService, _as_channel
from app.services.errors import InvalidOperationError, ResourceNotFoundError
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from pydantic import SecretStr

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "meta-oauth-errors-password-not-a-secret"


def _login(client: TestClient) -> dict[str, str]:
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OWNER_PASSWORD))
    login = client.post(
        "/api/v1/auth/login",
        json={"email": _OWNER_EMAIL, "password": _OWNER_PASSWORD},
    )
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['accessToken']}"}


def test_meta_oauth_handle_callback_without_candidates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "meta_app_id", "meta-test-app-id")
    monkeypatch.setattr(settings, "meta_app_secret", SecretStr("meta-test-app-secret-32chars-min"))

    from app.services.chat.meta_oauth import MetaOauthService

    class EmptyDiscoveryHttp:
        def request(self, method: str, url: str, **kwargs: object) -> dict:
            del method, kwargs
            if "oauth/access_token" in url:
                return {"access_token": "short-token"}
            if "fb_exchange_token" in url:
                return {"access_token": "long-token"}
            return {"data": []}

    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        state = ChatOauthState(
            workspace_id=summary.workspace_id,
            channel="whatsapp",
            candidates_json=[],
            tokens_json=None,
            expires_at=datetime.now(UTC) + timedelta(minutes=10),
        )
        session.add(state)
        session.flush()
        state_id = state.id

    with session_scope() as session:
        oauth = MetaOauthService(session, http_client=EmptyDiscoveryHttp())
        with pytest.raises(InvalidOperationError) as exc_info:
            oauth.handle_callback(state_id=state_id, code="oauth-code", error=None)
        assert exc_info.value.parameter == "channel"


def test_meta_oauth_complete_selection_rejects_unknown_provider() -> None:
    from unittest.mock import Mock

    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        workspace_id = summary.workspace_id
        state = ChatOauthState(
            workspace_id=workspace_id,
            channel="instagram",
            candidates_json=[{"provider_account_id": "ig-1", "display_name": "@one"}],
            tokens_json='{"ig-1":"token-1"}',
            expires_at=datetime.now(UTC) + timedelta(minutes=10),
        )
        session.add(state)
        session.flush()
        state_id = state.id

    with session_scope() as session:
        oauth = MetaOauthService(session, http_client=Mock())
        with pytest.raises(InvalidOperationError) as exc_info:
            oauth.complete_selection(
                workspace_id=workspace_id,
                state_id=state_id,
                provider_account_id="ig-unknown",
            )
        assert exc_info.value.parameter == "providerAccountId"


def test_meta_oauth_handle_callback_rejects_provider_errors() -> None:
    from unittest.mock import Mock

    oauth = MetaOauthService(Mock())
    with pytest.raises(InvalidOperationError) as denied:
        oauth.handle_callback(state_id=uuid7(), code="abc", error="access_denied")
    assert denied.value.parameter == "oauth"
    with pytest.raises(InvalidOperationError) as missing_code:
        oauth.handle_callback(state_id=uuid7(), code=None, error=None)
    assert missing_code.value.parameter == "oauth"


def test_meta_oauth_tokens_from_state_and_purge_expired() -> None:
    from unittest.mock import Mock

    oauth = MetaOauthService(Mock())
    state = Mock(tokens_json='{"page-1":"token-a"}')
    assert oauth._tokens_from_state(state) == {"page-1": "token-a"}
    state.tokens_json = "[1, 2]"
    assert oauth._tokens_from_state(state) == {}
    state.tokens_json = None
    assert oauth._tokens_from_state(state) == {}

    session = Mock()
    session.execute.return_value.rowcount = 3
    assert MetaOauthService.purge_expired(session) == 3


def test_as_channel_rejects_unknown() -> None:
    with pytest.raises(InvalidOperationError) as exc_info:
        _as_channel("telegram")
    assert exc_info.value.parameter == "channel"


@pytest.mark.integration
def test_oauth_start_requires_meta_app_config(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "meta_app_id", "")
    monkeypatch.setattr(settings, "meta_app_secret", None)
    headers = _login(client)
    response = client.post(
        "/api/v1/chat/channel-accounts/oauth/start",
        headers=headers,
        json={"channel": "whatsapp"},
    )
    assert response.status_code == 400
    body = response.json()
    parameter = body.get("parameter") or body.get("detail", {}).get("parameter")
    assert parameter == "meta"


@pytest.mark.integration
def test_oauth_callback_rejects_meta_error_param(
    client: TestClient, meta_oauth_settings: None
) -> None:
    from urllib.parse import parse_qs, urlparse

    headers = _login(client)
    start = client.post(
        "/api/v1/chat/channel-accounts/oauth/start",
        headers=headers,
        json={"channel": "whatsapp"},
    )
    assert start.status_code == 200, start.text
    state_id = parse_qs(urlparse(start.json()["authorizationUrl"]).query)["state"][0]
    callback = client.get(
        f"/api/v1/chat/oauth/meta/callback?state={state_id}&error=access_denied",
        follow_redirects=False,
    )
    assert callback.status_code == 302
    assert "chatOauth=error" in callback.headers["location"]
    assert "chatOauthMessage=oauth_denied" in callback.headers["location"]


@pytest.mark.integration
def test_oauth_handle_callback_missing_code(client: TestClient) -> None:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        state = ChatOauthState(
            workspace_id=summary.workspace_id,
            channel="whatsapp",
            candidates_json=[],
            tokens_json=None,
            expires_at=datetime.now(UTC) + timedelta(minutes=10),
        )
        session.add(state)
        session.flush()
        state_id = state.id

    with session_scope() as session:
        oauth = MetaOauthService(session)
        with pytest.raises(InvalidOperationError) as exc_info:
            oauth.handle_callback(state_id=state_id, code=None, error=None)
        assert exc_info.value.parameter == "oauth"


@pytest.mark.integration
def test_oauth_load_state_expired_is_removed() -> None:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        state = ChatOauthState(
            workspace_id=summary.workspace_id,
            channel="instagram",
            candidates_json=[],
            tokens_json=None,
            expires_at=datetime.now(UTC) - timedelta(minutes=1),
        )
        session.add(state)
        session.flush()
        state_id = state.id

    with session_scope() as session:
        oauth = MetaOauthService(session)
        with pytest.raises(ResourceNotFoundError):
            oauth._load_state(state_id)
        assert session.get(ChatOauthState, state_id) is None


@pytest.fixture
def meta_oauth_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "meta_app_id", "meta-test-app-id")
    monkeypatch.setattr(settings, "meta_app_secret", SecretStr("meta-test-app-secret-32chars-min"))
    monkeypatch.setattr(
        settings,
        "meta_oauth_redirect_uri",
        "http://testserver/api/v1/chat/oauth/meta/callback",
    )
