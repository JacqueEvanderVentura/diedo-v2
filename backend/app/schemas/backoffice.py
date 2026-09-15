from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AwareDatetime, EmailStr, Field, field_validator, model_validator

from app.schemas.common import ApiModel
from app.schemas.passwords import NewPassword
from app.schemas.users import RoleAssignmentInput, UpdateUserRequest, UserRoleAssignmentResponse


class WorkspaceOwnerInput(ApiModel):
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=160)
    password: NewPassword | None = None

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
    plan_code: str = Field(default="completo", min_length=2, max_length=48)
    enabled_modules: list[str] | None = None
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


class BackofficeContextResponse(ApiModel):
    ready: bool = True


class BackofficeSubscriptionResponse(ApiModel):
    version: int
    status: str
    effective_status: str
    started_at: datetime
    ends_at: datetime | None = None
    notes: str | None = None


class UpdateBackofficeSubscriptionRequest(ApiModel):
    version: int = Field(ge=1)
    status: Literal["trial", "active", "cancelled", "expired"]
    started_at: AwareDatetime
    ends_at: AwareDatetime | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_period(self) -> UpdateBackofficeSubscriptionRequest:
        if self.ends_at is not None and self.ends_at < self.started_at:
            raise ValueError("La fecha final no puede ser anterior a la inicial.")
        return self


class BackofficeOwnerResponse(ApiModel):
    user_id: UUID
    email: EmailStr
    display_name: str


class BackofficeBranchResponse(ApiModel):
    id: UUID
    code: str
    name: str
    status: str


class BackofficeWorkspaceSummaryResponse(ApiModel):
    workspace_id: UUID
    slug: str
    name: str
    status: str
    default_currency: str
    timezone: str
    locale: str
    version: int
    created_at: datetime
    branch_count: int
    owner: BackofficeOwnerResponse | None = None
    plan_code: str | None = None
    plan_name: str | None = None
    plan_label: str | None = None
    subscription_status: str | None = None
    enabled_modules: list[str] = Field(default_factory=list)
    configured_modules: list[str] = Field(default_factory=list)
    subscription: BackofficeSubscriptionResponse | None = None
    plan_customized: bool = False


class BackofficeWorkspaceListResponse(ApiModel):
    items: list[BackofficeWorkspaceSummaryResponse]


class BackofficeWorkspaceDetailResponse(BackofficeWorkspaceSummaryResponse):
    branches: list[BackofficeBranchResponse]


class UpdateBackofficeWorkspaceRequest(ApiModel):
    version: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=2, max_length=160)
    status: Literal["active", "suspended"] | None = None
    plan_code: str | None = Field(default=None, min_length=2, max_length=48)
    enabled_modules: list[str] | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        if len(normalized) < 2:
            raise ValueError("El nombre es demasiado corto.")
        return normalized

    @model_validator(mode="after")
    def require_a_change(self) -> UpdateBackofficeWorkspaceRequest:
        if (
            self.name is None
            and self.status is None
            and self.plan_code is None
            and self.enabled_modules is None
        ):
            raise ValueError("Indica al menos un campo para actualizar.")
        return self


class BackofficeModuleResponse(ApiModel):
    code: str
    name: str
    dependency_codes: list[str] = Field(default_factory=list)


class BackofficeModuleListResponse(ApiModel):
    items: list[BackofficeModuleResponse]


class BackofficePlanResponse(ApiModel):
    plan_id: UUID
    code: str
    name: str
    description: str
    status: str
    module_codes: list[str]
    sort_order: int
    version: int


class BackofficePlanListResponse(ApiModel):
    items: list[BackofficePlanResponse]


class UpdateBackofficePlanRequest(ApiModel):
    version: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=400)
    module_codes: list[str] | None = None
    status: Literal["active", "archived"] | None = None

    @model_validator(mode="after")
    def require_a_change(self) -> UpdateBackofficePlanRequest:
        if (
            self.name is None
            and self.description is None
            and self.module_codes is None
            and self.status is None
        ):
            raise ValueError("Indica al menos un campo para actualizar.")
        return self


class BackofficePlanCountResponse(ApiModel):
    plan_code: str
    plan_name: str
    workspace_count: int


class BackofficeOverviewResponse(ApiModel):
    active_workspaces: int
    suspended_workspaces: int
    total_users: int
    active_users: int
    disabled_users: int
    active_memberships: int = 0
    inactive_memberships: int = 0
    workspaces_by_plan: list[BackofficePlanCountResponse]


class BackofficeUserResponse(ApiModel):
    user_id: UUID
    membership_id: UUID
    email: EmailStr
    display_name: str
    workspace_id: UUID
    workspace_name: str
    workspace_slug: str
    membership_status: str
    platform_status: Literal["active", "disabled"]
    role_name: str | None = None
    version: int
    membership_version: int = 1
    role_assignments: list[UserRoleAssignmentResponse] = Field(default_factory=list)
    is_platform_operator: bool = False


class BackofficeUserListResponse(ApiModel):
    items: list[BackofficeUserResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int
    total_users: int = 0


class CreateBackofficeUserRequest(ApiModel):
    workspace_id: UUID
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=160)
    password: NewPassword | None = None
    role_code: str = Field(default="seller", min_length=2, max_length=48)
    role_assignments: list[RoleAssignmentInput] | None = Field(
        default=None, min_length=1, max_length=100
    )

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if len(normalized) < 2:
            raise ValueError("El nombre es demasiado corto.")
        return normalized

    @field_validator("role_code")
    @classmethod
    def normalize_role_code(cls, value: str) -> str:
        return value.strip().lower()


class UpdateBackofficeUserRequest(ApiModel):
    version: int = Field(ge=1)
    status: Literal["active", "disabled"]


class UpdateBackofficeMembershipRequest(UpdateUserRequest):
    @model_validator(mode="after")
    def require_change(self) -> UpdateBackofficeMembershipRequest:
        if self.status is None and self.role_assignments is None:
            raise ValueError("Indica un estado o asignaciones de rol.")
        return self


class BackofficeAuditResponse(ApiModel):
    id: UUID
    workspace_id: UUID | None
    actor_platform_user_id: UUID | None
    actor_name: str | None
    actor_type: str
    action: str
    target_type: str
    target_id: UUID | None
    occurred_at: datetime
    request_id: str | None
    details: dict[str, object]


class BackofficeAuditListResponse(ApiModel):
    items: list[BackofficeAuditResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int
