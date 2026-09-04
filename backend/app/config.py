from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
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
    backoffice_api_key: SecretStr | None = None
    local_bootstrap_admin_password: SecretStr | None = None
    demo_seed_enabled: bool = False
    allow_production_demo_seed: bool = False
    demo_admin_password: SecretStr | None = None
    user_invitations_enabled: bool | None = None
    expected_schema_revision: str = "20260903_0019"
    attachment_storage_backend: Literal["local", "s3"] = "local"
    attachment_storage_root: Path = _BACKEND_ROOT / ".local" / "attachments"
    s3_bucket: str | None = None
    s3_endpoint_url: str | None = None
    s3_region: str = "us-east-1"
    s3_connect_timeout_seconds: int = Field(default=5, ge=1, le=30)
    s3_read_timeout_seconds: int = Field(default=30, ge=1, le=120)
    attachment_max_bytes: int = Field(default=10 * 1024 * 1024, ge=1, le=10 * 1024 * 1024)
    incident_image_max_bytes: int = Field(default=5 * 1024 * 1024, ge=1, le=10 * 1024 * 1024)
    incident_image_max_files: int = Field(default=5, ge=1, le=20)

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_postgresql_driver(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    @model_validator(mode="after")
    def require_deployment_jwt_secret(self) -> Settings:
        secret = self.jwt_secret_key.get_secret_value()
        if len(secret) < 32:
            raise ValueError("JWT_SECRET_KEY must contain at least 32 characters.")
        if self.app_env in {"staging", "production"} and (
            secret == _LOCAL_JWT_SECRET or secret.startswith("replace-with-")
        ):
            raise ValueError("JWT_SECRET_KEY must be provided outside local environments.")
        if self.backoffice_api_key is not None:
            backoffice_key = self.backoffice_api_key.get_secret_value()
            if len(backoffice_key) < 32:
                raise ValueError("BACKOFFICE_API_KEY must contain at least 32 characters.")
            if self.app_env in {"staging", "production"} and backoffice_key.startswith(
                "replace-with-"
            ):
                raise ValueError("BACKOFFICE_API_KEY must not use a placeholder value.")
        if self.attachment_storage_backend == "s3":
            missing = [
                name
                for name, value in (
                    ("S3_BUCKET", self.s3_bucket),
                    ("S3_ENDPOINT_URL", self.s3_endpoint_url),
                )
                if not value
            ]
            if missing:
                raise ValueError("S3 attachment storage requires: " + ", ".join(missing) + ".")
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

    @property
    def invitations_enabled(self) -> bool:
        if self.user_invitations_enabled is not None:
            return self.user_invitations_enabled
        return self.app_env in {"development", "test"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
