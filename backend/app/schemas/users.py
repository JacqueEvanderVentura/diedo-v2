from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import EmailStr, Field, SecretStr, field_validator

from app.schemas.common import ApiModel


class RoleReference(ApiModel):
    id: UUID
    code: str
    name: str


class BranchReference(ApiModel):
    id: UUID
    code: str
    name: str


class UserListItem(ApiModel):
    id: UUID
    user_id: UUID
    display_name: str
    email: EmailStr
    initials: str
    role: RoleReference | None
    branches: list[BranchReference]
    last_access_at: datetime | None
    status: Literal["active", "inactive"]


class PaginatedUsersResponse(ApiModel):
    items: list[UserListItem]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class UserSummaryResponse(ApiModel):
    total_users: int
    active_users: int
    administrators: int
    inactive_users: int


class UserFormOptionsResponse(ApiModel):
    roles: list[RoleReference]
    branches: list[BranchReference]


class CreateUserRequest(ApiModel):
    display_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: SecretStr = Field(min_length=12, max_length=128)
    role_id: UUID
    branch_ids: list[UUID] = Field(min_length=1, max_length=100)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if len(normalized) < 2:
            raise ValueError("El nombre es demasiado corto.")
        return normalized

    @field_validator("branch_ids")
    @classmethod
    def reject_duplicate_branches(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("No repitas sucursales.")
        return value


UserStatusFilter = Literal["active", "inactive"]
UserSortField = Literal["displayName", "email", "lastAccessAt", "status"]
SortDirection = Literal["asc", "desc"]
