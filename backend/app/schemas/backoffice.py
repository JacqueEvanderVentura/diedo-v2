from decimal import Decimal
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import EmailStr, Field, SecretStr, field_validator

from app.schemas.common import ApiModel


class WorkspaceOwnerInput(ApiModel):
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=160)
    password: SecretStr | None = Field(default=None, min_length=12, max_length=128)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if len(normalized) < 2:
            raise ValueError("El nombre es demasiado corto.")
        return normalized


class CreateWorkspaceRequest(ApiModel):
    slug: str = Field(
        min_length=3,
        max_length=63,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )
    name: str = Field(min_length=2, max_length=160)
    default_currency: str = Field(min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$")
    timezone: str = Field(min_length=3, max_length=64)
    locale: str = Field(
        min_length=2,
        max_length=16,
        pattern=r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$",
    )
    tax_default_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100, decimal_places=2)
    owner: WorkspaceOwnerInput

    @field_validator("slug", mode="before")
    @classmethod
    def normalize_slug(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if len(normalized) < 2:
            raise ValueError("El nombre es demasiado corto.")
        return normalized

    @field_validator("default_currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.upper()

    @field_validator("locale")
    @classmethod
    def normalize_locale(cls, value: str) -> str:
        language, *rest = value.split("-")
        return "-".join((language.lower(), *(part.upper() for part in rest)))

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        normalized = value.strip()
        try:
            ZoneInfo(normalized)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("La zona horaria no es válida.") from exc
        return normalized


class ProvisionedOwnerResponse(ApiModel):
    user_id: UUID
    membership_id: UUID
    email: EmailStr
    display_name: str
    existing_identity: bool
    is_default_workspace: bool


class ProvisionedWorkspaceResponse(ApiModel):
    workspace_id: UUID
    slug: str
    name: str
    status: Literal["active"]
    owner: ProvisionedOwnerResponse
    administrator_role_id: UUID
    enabled_modules: list[str]
