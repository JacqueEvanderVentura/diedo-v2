from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import EmailStr, Field, SecretStr

from app.schemas.common import ApiModel


class LoginRequest(ApiModel):
    email: EmailStr
    password: SecretStr = Field(min_length=1, max_length=128)


class RefreshTokenRequest(ApiModel):
    refresh_token: SecretStr = Field(min_length=40, max_length=256)


class TokenResponse(ApiModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_expires_in: int


class WorkspaceSessionReference(ApiModel):
    id: UUID
    slug: str
    name: str
    default_currency: str
    timezone: str
    locale: str
    version: int


class SessionRoleReference(ApiModel):
    id: UUID
    code: str
    name: str


class SessionScopeReference(ApiModel):
    type: Literal["workspace", "legal_entity", "branch"]
    legal_entity_id: UUID | None = None
    branch_id: UUID | None = None


class SessionRoleAssignment(ApiModel):
    id: UUID
    role: SessionRoleReference
    scope: SessionScopeReference


class SessionBranchReference(ApiModel):
    id: UUID
    legal_entity_id: UUID
    code: str
    name: str


class EffectiveScopeResponse(ApiModel):
    workspace_wide: bool
    legal_entity_ids: list[UUID]
    branch_ids: list[UUID]


class CurrentSessionResponse(ApiModel):
    user_id: UUID
    membership_id: UUID
    workspace_id: UUID
    display_name: str
    email: EmailStr
    workspace: WorkspaceSessionReference
    role_assignments: list[SessionRoleAssignment]
    primary_role: SessionRoleReference | None
    visible_branches: list[SessionBranchReference]
    effective_scope: EffectiveScopeResponse
    effective_permission_codes: list[str]
    workspace_permission_codes: list[str]
    enabled_modules: list[str]


class WorkspaceOptionResponse(ApiModel):
    workspace_id: UUID
    membership_id: UUID
    slug: str
    name: str
    is_default: bool


class SwitchWorkspaceRequest(ApiModel):
    workspace_id: UUID


class ChangePasswordRequest(ApiModel):
    current_password: SecretStr = Field(min_length=1, max_length=128)
    new_password: SecretStr = Field(min_length=12, max_length=128)


class UpdateProfileRequest(ApiModel):
    display_name: str = Field(min_length=2, max_length=160)


class AuthSessionResponse(ApiModel):
    id: UUID
    workspace_id: UUID
    current: bool
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime
