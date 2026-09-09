from http.cookies import SimpleCookie

import pytest
from app.api.routers.auth import _delete_refresh_cookie, _token_response
from app.config import settings
from app.services.auth import TokenPair
from fastapi import Response


@pytest.mark.parametrize(
    ("app_env", "expected_secure", "expected_samesite"),
    [
        ("development", False, "lax"),
        ("test", False, "lax"),
        ("staging", True, "none"),
        ("production", True, "none"),
    ],
)
def test_refresh_cookie_policy_matches_environment(
    monkeypatch: pytest.MonkeyPatch,
    app_env: str,
    expected_secure: bool,
    expected_samesite: str,
) -> None:
    monkeypatch.setattr(settings, "app_env", app_env)
    response = Response()

    _token_response(
        TokenPair(
            access_token="access-token",
            refresh_token="refresh-token",
            expires_in=900,
            refresh_expires_in=3600,
        ),
        response,
    )

    cookies = SimpleCookie()
    cookies.load(response.headers["set-cookie"])
    refresh_cookie = cookies[settings.refresh_cookie_name]
    assert bool(refresh_cookie["secure"]) is expected_secure
    assert refresh_cookie["httponly"] is True
    assert refresh_cookie["samesite"].lower() == expected_samesite
    assert refresh_cookie["path"] == settings.refresh_cookie_path


@pytest.mark.parametrize(
    ("app_env", "expected_secure", "expected_samesite"),
    [
        ("development", False, "lax"),
        ("production", True, "none"),
    ],
)
def test_logout_deletes_refresh_cookie_with_matching_policy(
    monkeypatch: pytest.MonkeyPatch,
    app_env: str,
    expected_secure: bool,
    expected_samesite: str,
) -> None:
    monkeypatch.setattr(settings, "app_env", app_env)
    response = Response()

    _delete_refresh_cookie(response)

    cookies = SimpleCookie()
    cookies.load(response.headers["set-cookie"])
    refresh_cookie = cookies[settings.refresh_cookie_name]
    assert refresh_cookie.value == ""
    assert refresh_cookie["max-age"] == "0"
    assert bool(refresh_cookie["secure"]) is expected_secure
    assert refresh_cookie["httponly"] is True
    assert refresh_cookie["samesite"].lower() == expected_samesite
    assert refresh_cookie["path"] == settings.refresh_cookie_path
