from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.common import ApiModel


class RoleResponse(ApiModel):
    id: UUID
    code: str
    name: str
    version: int
    is_system: bool
    permission_count: int = 0


class RolePermissionSummaryItem(ApiModel):
    id: UUID
    code: str
    name: str
    permission_count: int = Field(ge=0)
    permission_percentage: int = Field(ge=0, le=100)


class RolePermissionSummaryResponse(ApiModel):
    total_permissions: int = Field(ge=0)
    roles: list[RolePermissionSummaryItem]


class PermissionMatrixItem(ApiModel):
    id: UUID
    code: str
    action: str
    name: str
    description: str
    granted_role_ids: list[UUID]


class PermissionModule(ApiModel):
    code: str
    name: str
    permissions: list[PermissionMatrixItem]


class PermissionMatrixResponse(ApiModel):
    roles: list[RoleResponse]
    modules: list[PermissionModule]
    total_permissions: int


class ReplaceRolePermissionsRequest(ApiModel):
    permission_ids: list[UUID] = Field(max_length=500)
    version: int = Field(ge=1)

    @field_validator("permission_ids")
    @classmethod
    def reject_duplicate_permissions(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("No repitas permisos.")
        return value
