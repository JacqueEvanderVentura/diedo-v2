import pytest
from app.config import Settings
from pydantic import ValidationError


def test_settings_disable_docs_in_production() -> None:
    settings = Settings(app_env="production", _env_file=None)

    assert settings.docs_enabled is False


def test_settings_enable_docs_in_development() -> None:
    settings = Settings(app_env="development", _env_file=None)

    assert settings.docs_enabled is True


def test_database_pool_size_is_bounded() -> None:
    with pytest.raises(ValidationError):
        Settings(db_pool_size=0, _env_file=None)
