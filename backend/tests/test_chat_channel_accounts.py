from __future__ import annotations

from typing import Any
from urllib.parse import parse_qs, urlparse
from uuid import UUID, uuid7

import pytest
from app.config import settings
from app.core.security import hash_password
from app.db.models import ChatChannelAccount, ChatOauthState
from app.db.session import session_scope
from app.services.chat.meta_oauth import MetaOauthService
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import select

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "chat-oauth-owner-password-not-a-secret"
_REDIRECT_URI = "http://testserver/api/v1/chat/oauth/meta/callback"


class _FakeGraphHttp:
    def __init__(self, responses: dict[str, dict[str, Any]]) -> None:
        self._responses = responses
        self.calls: list[tuple[str, str]] = []

    def request(self, method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        self.calls.append((method, url))
        if "fb_exchange_token" in url:
            return self._responses.get("fb_exchange_token", {"access_token": "long-token"})
        for key, payload in self._responses.items():
            if key in url:
                return payload
        raise AssertionError(f"Unexpected Graph URL: {url}")


def _login(client: TestClient) -> dict[str, str]:
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OWNER_PASSWORD))
    login = client.post(
        "/api/v1/auth/login",
        json={"email": _OWNER_EMAIL, "password": _OWNER_PASSWORD},
    )
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['accessToken']}"}


@pytest.fixture
def meta_oauth_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "meta_app_id", "meta-test-app-id")
    monkeypatch.setattr(settings, "meta_app_secret", SecretStr("meta-test-app-secret-32chars-min"))
    monkeypatch.setattr(settings, "meta_oauth_redirect_uri", _REDIRECT_URI)
    monkeypatch.setattr(settings, "public_app_url", "http://localhost:5173")


@pytest.mark.integration
def test_list_channel_accounts(client: TestClient, meta_oauth_settings) -> None:
    headers = _login(client)
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        workspace_id = summary.workspace_id
        session.add(
            ChatChannelAccount(
                workspace_id=workspace_id,
                channel="whatsapp",
                provider_account_id=f"wa-list-{uuid7()}",
                display_name="List test",
                connection_status="connected",
                access_token_ciphertext="token",
            )
        )

    response = client.get("/api/v1/chat/channel-accounts", headers=headers)
    assert response.status_code == 200
    items = response.json()["items"]
    assert any(item["displayName"] == "List test" for item in items)


@pytest.mark.integration
def test_oauth_start_returns_authorization_url(client: TestClient, meta_oauth_settings) -> None:
    headers = _login(client)
    response = client.post(
        "/api/v1/chat/channel-accounts/oauth/start",
        headers=headers,
        json={"channel": "whatsapp"},
    )
    assert response.status_code == 200, response.text
    url = response.json()["authorizationUrl"]
    assert "facebook.com" in url
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    assert params["client_id"] == ["meta-test-app-id"]
    assert params["scope"][0].startswith("whatsapp_")


@pytest.mark.integration
def test_oauth_start_instagram_uses_business_scopes(
    client: TestClient, meta_oauth_settings
) -> None:
    headers = _login(client)
    response = client.post(
        "/api/v1/chat/channel-accounts/oauth/start",
        headers=headers,
        json={"channel": "instagram"},
    )
    assert response.status_code == 200, response.text
    params = parse_qs(urlparse(response.json()["authorizationUrl"]).query)
    scope = params["scope"][0]
    assert "instagram_business_basic" in scope
    assert "instagram_business_manage_messages" in scope
    assert "instagram_basic" not in scope.split(",")
    assert "instagram_manage_messages" not in scope.split(",")


def _oauth_state_id_from_start(client: TestClient, headers: dict[str, str], channel: str) -> UUID:
    start = client.post(
        "/api/v1/chat/channel-accounts/oauth/start",
        headers=headers,
        json={"channel": channel},
    )
    assert start.status_code == 200, start.text
    parsed = urlparse(start.json()["authorizationUrl"])
    state_value = parse_qs(parsed.query)["state"][0]
    return UUID(state_value)


@pytest.mark.integration
def test_oauth_callback_auto_connects_single_whatsapp_account(
    client: TestClient,
    meta_oauth_settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers = _login(client)
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        workspace_id = summary.workspace_id

    state_id = _oauth_state_id_from_start(client, headers, "whatsapp")

    fake_http = _FakeGraphHttp(
        {
            "oauth/access_token?": {"access_token": "short-token"},
            "fb_exchange_token": {"access_token": "long-token"},
            "me/businesses": {
                "data": [
                    {
                        "owned_whatsapp_business_accounts": {
                            "data": [
                                {
                                    "name": "Demo WABA",
                                    "phone_numbers": {
                                        "data": [
                                            {
                                                "id": "15550001111",
                                                "display_phone_number": "+1 555 000 1111",
                                                "verified_name": "Helios Demo",
                                            }
                                        ]
                                    },
                                }
                            ]
                        }
                    }
                ]
            },
        }
    )

    original_init = MetaOauthService.__init__

    def _init_oauth(self, session, *, http_client=None):
        original_init(self, session, http_client=fake_http)

    monkeypatch.setattr(MetaOauthService, "__init__", _init_oauth)

    callback = client.get(
        f"/api/v1/chat/oauth/meta/callback?state={state_id}&code=oauth-code",
        follow_redirects=False,
    )
    assert callback.status_code == 302
    assert "chatOauth=connected" in callback.headers["location"]

    with session_scope() as session:
        account = session.scalar(
            select(ChatChannelAccount).where(
                ChatChannelAccount.workspace_id == workspace_id,
                ChatChannelAccount.provider_account_id == "15550001111",
            )
        )
        assert account is not None
        assert account.connection_status == "connected"
        assert account.access_token_ciphertext == "long-token"


@pytest.mark.integration
def test_update_branches_and_disconnect(client: TestClient, meta_oauth_settings) -> None:
    headers = _login(client)
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        workspace_id = summary.workspace_id
        branch_id = summary.branch_id
        provider_id = f"ig-{uuid7()}"
        account = ChatChannelAccount(
            workspace_id=workspace_id,
            channel="instagram",
            provider_account_id=provider_id,
            display_name="@helios",
            connection_status="connected",
            access_token_ciphertext="page-token",
        )
        session.add(account)
        session.flush()
        account_id = account.id

    branches = client.put(
        f"/api/v1/chat/channel-accounts/{account_id}/branches",
        headers=headers,
        json={"branchIds": [str(branch_id)]},
    )
    assert branches.status_code == 200, branches.text
    assert branches.json()["assignedBranchIds"] == [str(branch_id)]

    listed = client.get("/api/v1/chat/channel-accounts", headers=headers)
    listed_account = next(item for item in listed.json()["items"] if item["id"] == str(account_id))
    assert listed_account["connectionStatus"] == "connected"

    disconnected = client.post(
        f"/api/v1/chat/channel-accounts/{account_id}/disconnect",
        headers=headers,
    )
    assert disconnected.status_code == 200
    assert disconnected.json()["connectionStatus"] == "disconnected"
    assert disconnected.json()["assignedBranchIds"] == [str(branch_id)]


@pytest.mark.integration
def test_oauth_complete_after_multi_candidate_discovery(
    client: TestClient,
    meta_oauth_settings,
) -> None:
    headers = _login(client)
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        workspace_id = summary.workspace_id

    state_id = _oauth_state_id_from_start(client, headers, "instagram")

    fake_http = _FakeGraphHttp(
        {
            "oauth/access_token?": {"access_token": "short-token"},
            "grant_type=fb_exchange_token": {"access_token": "user-token"},
            "me/accounts": {
                "data": [
                    {
                        "name": "Page A",
                        "access_token": "page-a-token",
                        "instagram_business_account": {"id": "ig-a", "username": "helios_a"},
                    },
                    {
                        "name": "Page B",
                        "access_token": "page-b-token",
                        "instagram_business_account": {"id": "ig-b", "username": "helios_b"},
                    },
                ]
            },
        }
    )

    with session_scope() as session:
        oauth = MetaOauthService(session, http_client=fake_http)
        _ws, _channel, candidates, auto = oauth.handle_callback(
            state_id=state_id,
            code="oauth-code",
            error=None,
        )
        assert len(candidates) == 2
        assert auto is False
        pending_state = session.scalar(select(ChatOauthState).where(ChatOauthState.id == state_id))
        assert pending_state is not None
        session.commit()

    pending = client.get(
        f"/api/v1/chat/channel-accounts/oauth/pending?oauthStateId={state_id}",
        headers=headers,
    )
    assert pending.status_code == 200
    assert len(pending.json()["candidates"]) == 2

    complete = client.post(
        "/api/v1/chat/channel-accounts/oauth/complete",
        headers=headers,
        json={"oauthStateId": str(state_id), "providerAccountId": "ig-b"},
    )
    assert complete.status_code == 200, complete.text
    body = complete.json()
    assert body["providerAccountId"] == "ig-b"
    assert body["connectionStatus"] == "connected"

    with session_scope() as session:
        account = session.scalar(
            select(ChatChannelAccount).where(
                ChatChannelAccount.workspace_id == workspace_id,
                ChatChannelAccount.provider_account_id == "ig-b",
            )
        )
        assert account is not None
        assert account.access_token_ciphertext == "page-b-token"
        tokens = session.scalar(select(ChatOauthState).where(ChatOauthState.id == state_id))
        assert tokens is None
