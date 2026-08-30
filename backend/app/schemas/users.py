from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import EmailStr, Field, SecretStr, field_validator

from app.schemas.common import ApiModel


class RoleReference(ApiModel):
    id: UUID
    code: str
    name: str


class BranchReference(ApiModel):
    id: UUID
    legal_entity_id: UUID
    code: str
    name: str


class LegalEntityReference(ApiModel):
    id: UUID
    code: str
    name: str


class WorkspaceRoleAssignmentInput(ApiModel):
    role_id: UUID
    scope_type: Literal["workspace"]


class LegalEntityRoleAssignmentInput(ApiModel):
    role_id: UUID
    scope_type: Literal["legalEntity"]
    legal_entity_id: UUID


class BranchRoleAssignmentInput(ApiModel):
    role_id: UUID
    scope_type: Literal["branch"]
    branch_id: UUID


RoleAssignmentInput = Annotated[
    WorkspaceRoleAssignmentInput | LegalEntityRoleAssignmentInput | BranchRoleAssignmentInput,
    Field(discriminator="scope_type"),
]


class UserRoleAssignmentResponse(ApiModel):
    id: UUID
    role_id: UUID
    role_code: str
    role_name: str
    scope_type: Literal["workspace", "legalEntity", "branch"]
    legal_entity_id: UUID | None = None
    branch_id: UUID | None = None


def _assignment_key(assignment: RoleAssignmentInput) -> tuple[UUID, str, UUID | None]:
    if isinstance(assignment, WorkspaceRoleAssignmentInput):
        return assignment.role_id, assignment.scope_type, None
    if isinstance(assignment, LegalEntityRoleAssignmentInput):
        return assignment.role_id, assignment.scope_type, assignment.legal_entity_id
    return assignment.role_id, assignment.scope_type, assignment.branch_id


def _reject_duplicate_assignments(
    assignments: list[RoleAssignmentInput],
) -> list[RoleAssignmentInput]:
    if len(assignments) != len({_assignment_key(assignment) for assignment in assignments}):
        raise ValueError("No repitas asignaciones de rol.")
    return assignments


class UserListItem(ApiModel):
    id: UUID
    user_id: UUID
    display_name: str
    email: EmailStr
    initials: str
    role: RoleReference | None
    branches: list[BranchReference]
    role_assignments: list[UserRoleAssignmentResponse]
    last_access_at: datetime | None
    status: Literal["active", "inactive"]
    version: int


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
    legal_entities: list[LegalEntityReference]
    branches: list[BranchReference]


class CreateUserRequest(ApiModel):
    display_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: SecretStr = Field(min_length=12, max_length=128)
    role_assignments: list[RoleAssignmentInput] = Field(min_length=1, max_length=100)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if len(normalized) < 2:
            raise ValueError("El nombre es demasiado corto.")
        return normalized

    @field_validator("role_assignments")
    @classmethod
    def reject_duplicate_assignments(
        cls,
        value: list[RoleAssignmentInput],
    ) -> list[RoleAssignmentInput]:
        return _reject_duplicate_assignments(value)


UserStatusFilter = Literal["active", "inactive"]
UserSortField = Literal["displayName", "email", "lastAccessAt", "status"]
SortDirection = Literal["asc", "desc"]


class UpdateUserRequest(ApiModel):
    status: Literal["active", "suspended"] | None = None
    role_assignments: list[RoleAssignmentInput] | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )
    version: int = Field(ge=1)

    @field_validator("role_assignments")
    @classmethod
    def reject_duplicate_update_assignments(
        cls,
        value: list[RoleAssignmentInput] | None,
    ) -> list[RoleAssignmentInput] | None:
        return _reject_duplicate_assignments(value) if value is not None else None


class CreateInvitationRequest(ApiModel):
    display_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    role_assignments: list[RoleAssignmentInput] = Field(min_length=1, max_length=100)

    @field_validator("role_assignments")
    @classmethod
    def reject_duplicate_assignments(
        cls,
        value: list[RoleAssignmentInput],
    ) -> list[RoleAssignmentInput]:
        return _reject_duplicate_assignments(value)


class InvitationResponse(ApiModel):
    id: UUID
    membership_id: UUID
    email: EmailStr
    expires_at: datetime
    status: Literal["pending", "accepted", "revoked", "expired"]
    accept_token: str | None = None


class AcceptInvitationRequest(ApiModel):
    token: SecretStr = Field(min_length=40, max_length=256)
    password: SecretStr | None = Field(default=None, min_length=12, max_length=128)


class PasswordResetRequest(ApiModel):
    new_password: SecretStr = Field(min_length=12, max_length=128)
