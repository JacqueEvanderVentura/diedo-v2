from contextlib import contextmanager
from typing import Any

import pytest
from app.config import Settings
from app.scripts import seed_demo
from app.scripts.seed_demo import resolve_demo_password

_PRODUCTION_SECRET = "a-production-secret-with-at-least-32-characters"


def test_disabled_demo_seed_is_a_noop() -> None:
    configured = Settings(demo_seed_enabled=False, _env_file=None)

    assert resolve_demo_password(configured) is None


def test_local_demo_seed_supports_local_or_explicit_password() -> None:
    local = Settings(
        app_env="development",
        demo_seed_enabled=True,
        local_bootstrap_admin_password="local-demo-password",
        _env_file=None,
    )
    explicit = Settings(
        app_env="test",
        demo_seed_enabled=True,
        local_bootstrap_admin_password="ignored-local-password",
        demo_admin_password="explicit-demo-password",
        _env_file=None,
    )

    assert resolve_demo_password(local).get_secret_value() == "local-demo-password"
    assert resolve_demo_password(explicit).get_secret_value() == "explicit-demo-password"


def test_local_demo_seed_requires_a_password() -> None:
    configured = Settings(app_env="test", demo_seed_enabled=True, _env_file=None)

    with pytest.raises(RuntimeError, match="DEMO_ADMIN_PASSWORD"):
        resolve_demo_password(configured)


def test_staging_demo_seed_is_rejected() -> None:
    configured = Settings(
        app_env="staging",
        jwt_secret_key=_PRODUCTION_SECRET,
        demo_seed_enabled=True,
        demo_admin_password="staging-demo-password",
        _env_file=None,
    )

    with pytest.raises(RuntimeError, match="disabled in staging"):
        resolve_demo_password(configured)


def test_production_demo_seed_requires_explicit_acknowledgement_and_password() -> None:
    blocked = Settings(
        app_env="production",
        jwt_secret_key=_PRODUCTION_SECRET,
        demo_seed_enabled=True,
        demo_admin_password="production-demo-password",
        _env_file=None,
    )
    missing_password = Settings(
        app_env="production",
        jwt_secret_key=_PRODUCTION_SECRET,
        demo_seed_enabled=True,
        allow_production_demo_seed=True,
        _env_file=None,
    )
    allowed = Settings(
        app_env="production",
        jwt_secret_key=_PRODUCTION_SECRET,
        demo_seed_enabled=True,
        allow_production_demo_seed=True,
        demo_admin_password="production-demo-password",
        _env_file=None,
    )

    with pytest.raises(RuntimeError, match="ALLOW_PRODUCTION_DEMO_SEED"):
        resolve_demo_password(blocked)
    with pytest.raises(RuntimeError, match="DEMO_ADMIN_PASSWORD"):
        resolve_demo_password(missing_password)
    assert resolve_demo_password(allowed).get_secret_value() == "production-demo-password"


def test_production_entrypoint_explicitly_authorizes_service_layer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configured = Settings(
        app_env="production",
        jwt_secret_key=_PRODUCTION_SECRET,
        demo_seed_enabled=True,
        allow_production_demo_seed=True,
        demo_admin_password="production-demo-password",
        _env_file=None,
    )
    captured: dict[str, Any] = {}

    @contextmanager
    def fake_session_scope():
        yield object()

    def fake_seed_demo_data(*args: object, **kwargs: object) -> object:
        captured.update(kwargs)
        return object()

    monkeypatch.setattr(seed_demo, "settings", configured)
    monkeypatch.setattr(seed_demo, "hash_password", lambda _password: "hash")
    monkeypatch.setattr(seed_demo, "session_scope", fake_session_scope)
    monkeypatch.setattr(seed_demo, "seed_demo_data", fake_seed_demo_data)
    monkeypatch.setattr(seed_demo, "asdict", lambda _summary: {})

    seed_demo.main()

    assert captured["production_authorized"] is True
