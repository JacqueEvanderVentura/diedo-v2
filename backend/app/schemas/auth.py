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
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_expires_in: int


class CurrentSessionResponse(ApiModel):
    user_id: UUID
    membership_id: UUID
    workspace_id: UUID
    display_name: str
    email: EmailStr
