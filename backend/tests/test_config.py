import pytest
from app.api import deps
from app.api.routers import users
from app.config import Settings
from app.services.errors import InvalidOperationError
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


@pytest.mark.parametrize(
    ("raw_url", "expected"),
    [
        (
            "postgres://user:password@postgres:5432/app",
            "postgresql+psycopg://user:password@postgres:5432/app",
        ),
        (
            "postgresql://user:password@postgres:5432/app",
            "postgresql+psycopg://user:password@postgres:5432/app",
        ),
        (
            "postgresql+psycopg://user:password@postgres:5432/app",
            "postgresql+psycopg://user:password@postgres:5432/app",
        ),
    ],
)
def test_settings_normalize_railway_postgresql_urls(raw_url: str, expected: str) -> None:
    configured = Settings(database_url=raw_url, _env_file=None)

    assert configured.database_url == expected


def test_s3_storage_requires_bucket_and_endpoint() -> None:
    with pytest.raises(ValidationError, match="S3_BUCKET, S3_ENDPOINT_URL"):
        Settings(attachment_storage_backend="s3", _env_file=None)

    configured = Settings(
        attachment_storage_backend="s3",
        s3_bucket="uploads",
        s3_endpoint_url="https://storage.example.invalid",
        _env_file=None,
    )

    assert configured.s3_bucket == "uploads"


def test_invitations_default_off_in_production_and_can_be_explicitly_enabled() -> None:
    production = Settings(
        app_env="production",
        jwt_secret_key="a-production-secret-with-at-least-32-characters",
        _env_file=None,
    )
    local = Settings(app_env="test", _env_file=None)
    explicit = Settings(
        app_env="production",
        jwt_secret_key="a-production-secret-with-at-least-32-characters",
        user_invitations_enabled=True,
        _env_file=None,
    )

    assert production.invitations_enabled is False
    assert local.invitations_enabled is True
    assert explicit.invitations_enabled is True


def test_disabled_invitations_are_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(users.settings, "user_invitations_enabled", False)

    with pytest.raises(InvalidOperationError, match="no están habilitadas"):
        users._require_invitations_enabled()


def test_attachment_dependency_builds_s3_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    sentinel = object()
    captured: dict[str, object] = {}

    def fake_storage(**kwargs: object) -> object:
        captured.update(kwargs)
        return sentinel

    monkeypatch.setattr(deps.settings, "attachment_storage_backend", "s3")
    monkeypatch.setattr(deps.settings, "s3_bucket", "uploads")
    monkeypatch.setattr(deps.settings, "s3_endpoint_url", "https://storage.example.invalid")
    monkeypatch.setattr(deps, "S3AttachmentStorage", fake_storage)
    deps.get_attachment_storage.cache_clear()
    try:
        assert deps.get_attachment_storage() is sentinel
    finally:
        deps.get_attachment_storage.cache_clear()

    assert captured["bucket"] == "uploads"
    assert captured["endpoint_url"] == "https://storage.example.invalid"


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
