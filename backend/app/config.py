from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parents[1]


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

    @property
    def docs_enabled(self) -> bool:
        return self.app_env != "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
