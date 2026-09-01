from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
_LOCAL_JWT_SECRET = "local-development-only-secret-change-before-deploying"


class Settings(BaseSettings):
    """Application settings loaded from environment variables and `backend/.env`."""

    model_config = SettingsConfigDict(
        env_file=_BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: Literal["development", "test", "staging", "production"] = "development"
    project_name: str = "ERP API"
    api_version: str = "0.1.0"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    cors_origins: str = ""

    database_url: str = "postgresql+psycopg://erp:erp@localhost:5433/erp"
    db_pool_size: int = Field(default=5, ge=1, le=50)
    db_max_overflow: int = Field(default=10, ge=0, le=100)
    db_pool_timeout_seconds: int = Field(default=30, ge=1, le=120)

    jwt_secret_key: SecretStr = SecretStr(_LOCAL_JWT_SECRET)
    jwt_issuer: str = "erp-api"
    jwt_audience: str = "erp-clients"
    access_token_minutes: int = Field(default=15, ge=5, le=60)
    refresh_token_days: int = Field(default=30, ge=1, le=90)
    refresh_cookie_name: str = "erp_refresh"
    refresh_cookie_path: str = "/api/v1/auth"
    local_bootstrap_admin_password: SecretStr | None = None
    demo_seed_enabled: bool = False
    expected_schema_revision: str = "20260901_0014"
    attachment_storage_root: Path = _BACKEND_ROOT / ".local" / "attachments"
    attachment_max_bytes: int = Field(default=10 * 1024 * 1024, ge=1, le=10 * 1024 * 1024)
    incident_image_max_bytes: int = Field(default=5 * 1024 * 1024, ge=1, le=10 * 1024 * 1024)
    incident_image_max_files: int = Field(default=5, ge=1, le=20)

    @model_validator(mode="after")
    def require_deployment_jwt_secret(self) -> Settings:
        secret = self.jwt_secret_key.get_secret_value()
        if len(secret) < 32:
            raise ValueError("JWT_SECRET_KEY must contain at least 32 characters.")
        if self.app_env in {"staging", "production"} and (
            secret == _LOCAL_JWT_SECRET or secret.startswith("replace-with-")
        ):
            raise ValueError("JWT_SECRET_KEY must be provided outside local environments.")
        return self

    @property
    def docs_enabled(self) -> bool:
        return self.app_env != "production"

    @property
    def secure_cookies(self) -> bool:
        return self.app_env in {"staging", "production"}

    @property
    def expose_demo_invitation_tokens(self) -> bool:
        """Expose one-use invitation tokens only in an explicit local demo/test mode."""
        return self.demo_seed_enabled and self.app_env in {"development", "test"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
