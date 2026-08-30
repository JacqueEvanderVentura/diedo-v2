import pytest
from app.config import Settings
from pydantic import ValidationError


def test_settings_disable_docs_in_production() -> None:
    settings = Settings(
        app_env="production",
        jwt_secret_key="a-production-secret-with-at-least-32-characters",
        _env_file=None,
    )

    assert settings.docs_enabled is False


def test_settings_enable_docs_in_development() -> None:
    settings = Settings(app_env="development", _env_file=None)

    assert settings.docs_enabled is True


def test_invitation_tokens_require_explicit_non_deployment_demo_mode() -> None:
    local_demo = Settings(
        app_env="development",
        demo_seed_enabled=True,
        _env_file=None,
    )
    local_without_demo = Settings(
        app_env="development",
        demo_seed_enabled=False,
        _env_file=None,
    )
    production_demo = Settings(
        app_env="production",
        demo_seed_enabled=True,
        jwt_secret_key="a-production-secret-with-at-least-32-characters",
        _env_file=None,
    )

    assert local_demo.expose_demo_invitation_tokens is True
    assert local_without_demo.expose_demo_invitation_tokens is False
    assert production_demo.expose_demo_invitation_tokens is False


def test_database_pool_size_is_bounded() -> None:
    with pytest.raises(ValidationError):
        Settings(db_pool_size=0, _env_file=None)


def test_deployment_rejects_local_or_short_jwt_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    # Settings still reads process environment when `_env_file=None`; isolate the
    # default-secret assertion from the JWT used by integration-test commands.
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    with pytest.raises(ValidationError):
        Settings(app_env="production", _env_file=None)
    with pytest.raises(ValidationError):
        Settings(jwt_secret_key="too-short", _env_file=None)
    with pytest.raises(ValidationError):
        Settings(
            app_env="staging",
            jwt_secret_key="replace-with-a-random-secret-that-is-long-enough",
            _env_file=None,
        )
