import hmac
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Security, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer

from app.api.deps import DatabaseSession
from app.config import settings
from app.core.errors import raise_api_error
from app.repositories.auth import AuthRepository
from app.repositories.backoffice import (
    BackofficeRepository,
    BackofficeUserRecord,
    BackofficeWorkspaceRecord,
)
from app.schemas.backoffice import (
    BackofficeBranchResponse,
    BackofficeContextResponse,
    BackofficeModuleListResponse,
    BackofficeModuleResponse,
    BackofficeOverviewResponse,
    BackofficeOwnerResponse,
    BackofficePlanCountResponse,
    BackofficePlanListResponse,
    BackofficePlanResponse,
    BackofficeUserListResponse,
    BackofficeUserResponse,
    BackofficeWorkspaceDetailResponse,
    BackofficeWorkspaceListResponse,
    BackofficeWorkspaceSummaryResponse,
    CreateBackofficeUserRequest,
    CreateWorkspaceRequest,
    ProvisionedOwnerResponse,
    ProvisionedWorkspaceResponse,
    UpdateBackofficePlanRequest,
    UpdateBackofficeUserRequest,
    UpdateBackofficeWorkspaceRequest,
)
from app.schemas.common import ErrorResponse
from app.services.auth import AuthService
from app.services.backoffice import BackofficeService
from app.services.errors import AuthenticationError
from app.services.subscription_plans import PlanRecord

_backoffice_key = APIKeyHeader(
    name="X-Backoffice-Key",
    scheme_name="BackofficeKey",
    description="Clave de plataforma para aprovisionar workspaces; no es un token de usuario.",
    auto_error=False,
)
_bearer = HTTPBearer(
    auto_error=False,
    scheme_name="BearerAuth",
    description="JWT de un operador de plataforma con is_platform_operator.",
)


def require_backoffice_access(
    supplied_key: Annotated[str | None, Security(_backoffice_key)],
    database: DatabaseSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> None:
    if credentials is not None and credentials.scheme.casefold() == "bearer":
        try:
            principal = AuthService(database).authenticate_access_token(credentials.credentials)
        except AuthenticationError:
            pass
        else:
            if AuthRepository(database).is_platform_operator(principal.platform_user_id):
                return

    configured = settings.backoffice_api_key
    if (
        configured is not None
        and supplied_key is not None
        and hmac.compare_digest(
            supplied_key,
            configured.get_secret_value(),
        )
    ):
        return
    if configured is None:
        raise_api_error(503, "El aprovisionamiento de workspaces no está habilitado.")
    raise_api_error(401, "La clave de backoffice no es válida.", "X-Backoffice-Key")


BackofficeAccess = Annotated[None, Depends(require_backoffice_access)]


def get_backoffice_operator_id(
    database: DatabaseSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> UUID | None:
    if credentials is None or credentials.scheme.casefold() != "bearer":
        return None
    try:
        principal = AuthService(database).authenticate_access_token(credentials.credentials)
    except AuthenticationError:
        return None
    if AuthRepository(database).is_platform_operator(principal.platform_user_id):
        return principal.platform_user_id
    return None


BackofficeOperatorId = Annotated[UUID | None, Depends(get_backoffice_operator_id)]

router = APIRouter(prefix="/api/v1/backoffice", tags=["backoffice"])

_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse},
    401: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
}


def _owner_response(record: BackofficeWorkspaceRecord) -> BackofficeOwnerResponse | None:
    if record.owner is None:
        return None
    return BackofficeOwnerResponse(
        user_id=record.owner.user_id,
        email=record.owner.email,
        display_name=record.owner.display_name,
    )


def _plan_label(record: BackofficeWorkspaceRecord) -> str | None:
    if record.plan_name is None:
        return None
    if record.plan_customized:
        return f"{record.plan_name} · personalizado"
    return record.plan_name


def _summary_response(record: BackofficeWorkspaceRecord) -> BackofficeWorkspaceSummaryResponse:
    return BackofficeWorkspaceSummaryResponse(
        workspace_id=record.id,
        slug=record.slug,
        name=record.name,
        status=record.status,
        default_currency=record.default_currency,
        timezone=record.timezone,
        locale=record.locale,
        version=record.version,
        created_at=record.created_at,
        branch_count=record.branch_count,
        owner=_owner_response(record),
        plan_code=record.plan_code,
        plan_name=record.plan_name,
        plan_label=_plan_label(record),
        subscription_status=record.subscription_status,
        enabled_modules=list(record.enabled_modules),
        plan_customized=record.plan_customized,
    )


def _detail_response(
    database: DatabaseSession,
    record: BackofficeWorkspaceRecord,
) -> BackofficeWorkspaceDetailResponse:
    branches = BackofficeRepository(database).list_branches(record.id)
    return BackofficeWorkspaceDetailResponse(
        workspace_id=record.id,
        slug=record.slug,
        name=record.name,
        status=record.status,
        default_currency=record.default_currency,
        timezone=record.timezone,
        locale=record.locale,
        version=record.version,
        created_at=record.created_at,
        branch_count=record.branch_count,
        owner=_owner_response(record),
        plan_code=record.plan_code,
        plan_name=record.plan_name,
        plan_label=_plan_label(record),
        subscription_status=record.subscription_status,
        enabled_modules=list(record.enabled_modules),
        plan_customized=record.plan_customized,
        branches=[
            BackofficeBranchResponse(
                id=branch.id,
                code=branch.code,
                name=branch.name,
                status=branch.status,
            )
            for branch in branches
        ],
    )


@router.get(
    "/context",
    responses=_RESPONSES,
    summary="Verify backoffice access for the current session or API key",
)
def backoffice_context(_access: BackofficeAccess) -> BackofficeContextResponse:
    return BackofficeContextResponse(ready=True)


@router.get(
    "/workspaces",
    responses=_RESPONSES,
    summary="List customer workspaces",
)
def list_workspaces(
    database: DatabaseSession,
    _access: BackofficeAccess,
) -> BackofficeWorkspaceListResponse:
    records = BackofficeService(database).list_workspaces()
    return BackofficeWorkspaceListResponse(items=[_summary_response(record) for record in records])


@router.get(
    "/workspaces/{workspace_id}",
    responses=_RESPONSES,
    summary="Get a customer workspace",
)
def get_workspace(
    workspace_id: UUID,
    database: DatabaseSession,
    _access: BackofficeAccess,
) -> BackofficeWorkspaceDetailResponse:
    record = BackofficeService(database).get_workspace(workspace_id)
    return _detail_response(database, record)


@router.patch(
    "/workspaces/{workspace_id}",
    responses=_RESPONSES,
    summary="Update a customer workspace",
)
def update_workspace(
    workspace_id: UUID,
    payload: UpdateBackofficeWorkspaceRequest,
    database: DatabaseSession,
    _access: BackofficeAccess,
) -> BackofficeWorkspaceDetailResponse:
    record = BackofficeService(database).update_workspace(
        workspace_id,
        name=payload.name,
        status=payload.status,
        plan_code=payload.plan_code,
        enabled_modules=payload.enabled_modules,
        expected_version=payload.version,
    )
    return _detail_response(database, record)


@router.post(
    "/workspaces",
    status_code=status.HTTP_201_CREATED,
    responses=_RESPONSES,
    summary="Create an isolated workspace and its owner",
)
def create_workspace(
    payload: CreateWorkspaceRequest,
    database: DatabaseSession,
    _access: BackofficeAccess,
) -> ProvisionedWorkspaceResponse:
    result = BackofficeService(database).provision_workspace(
        slug=payload.slug,
        name=payload.name,
        default_currency=payload.default_currency,
        timezone=payload.timezone,
        locale=payload.locale,
        tax_default_rate=payload.tax_default_rate,
        owner_email=str(payload.owner.email),
        owner_display_name=payload.owner.display_name,
        owner_password=(
            payload.owner.password.get_secret_value()
            if payload.owner.password is not None
            else None
        ),
        plan_code=payload.plan_code,
        enabled_modules=payload.enabled_modules,
    )
    return ProvisionedWorkspaceResponse(
        workspace_id=result.workspace_id,
        slug=result.slug,
        name=result.name,
        status="active",
        owner=ProvisionedOwnerResponse(
            user_id=result.owner.user_id,
            membership_id=result.owner.membership_id,
            email=result.owner.email,
            display_name=result.owner.display_name,
            existing_identity=result.owner.existing_identity,
            is_default_workspace=result.owner.is_default_workspace,
        ),
        administrator_role_id=result.administrator_role_id,
        enabled_modules=list(result.enabled_modules),
    )


def _plan_response(record: PlanRecord) -> BackofficePlanResponse:
    return BackofficePlanResponse(
        plan_id=record.id,
        code=record.code,
        name=record.name,
        description=record.description,
        status=record.status,
        module_codes=list(record.module_codes),
        sort_order=record.sort_order,
        version=record.version,
    )


def _user_response(record: BackofficeUserRecord) -> BackofficeUserResponse:
    return BackofficeUserResponse(
        user_id=record.user_id,
        membership_id=record.membership_id,
        email=record.email,
        display_name=record.display_name,
        workspace_id=record.workspace_id,
        workspace_name=record.workspace_name,
        workspace_slug=record.workspace_slug,
        membership_status=record.membership_status,
        platform_status=record.platform_status,  # type: ignore[arg-type]
        role_name=record.role_name,
        version=record.version,
        is_platform_operator=record.is_platform_operator,
    )


@router.get(
    "/overview",
    responses=_RESPONSES,
    summary="Platform overview metrics",
)
def get_overview(
    database: DatabaseSession,
    _access: BackofficeAccess,
) -> BackofficeOverviewResponse:
    overview = BackofficeService(database).overview()
    return BackofficeOverviewResponse(
        active_workspaces=overview.active_workspaces,
        suspended_workspaces=overview.suspended_workspaces,
        total_users=overview.total_users,
        active_users=overview.active_users,
        disabled_users=overview.disabled_users,
        workspaces_by_plan=[
            BackofficePlanCountResponse(
                plan_code=code,
                plan_name=name,
                workspace_count=count,
            )
            for code, name, count in overview.workspaces_by_plan
        ],
    )


@router.get(
    "/users",
    responses=_RESPONSES,
    summary="List end users across customer workspaces",
)
def list_users(
    database: DatabaseSession,
    _access: BackofficeAccess,
    search: str | None = None,
    workspace_id: UUID | None = None,
    status: Literal["active", "disabled"] | None = None,
    page: int = 1,
    page_size: int = 25,
) -> BackofficeUserListResponse:
    result, total_pages = BackofficeService(database).list_users(
        search=search,
        workspace_id=workspace_id,
        status=status,
        page=page,
        page_size=page_size,
    )
    return BackofficeUserListResponse(
        items=[_user_response(item) for item in result.items],
        page=max(page, 1),
        page_size=min(max(page_size, 1), 100),
        total_items=result.total_items,
        total_pages=total_pages,
    )


@router.post(
    "/users",
    status_code=status.HTTP_201_CREATED,
    responses=_RESPONSES,
    summary="Register a user in a customer workspace",
)
def create_user(
    payload: CreateBackofficeUserRequest,
    database: DatabaseSession,
    _access: BackofficeAccess,
) -> BackofficeUserResponse:
    record = BackofficeService(database).create_user(
        workspace_id=payload.workspace_id,
        display_name=payload.display_name,
        email=str(payload.email),
        password=payload.password.get_secret_value(),
        role_code=payload.role_code,
    )
    return _user_response(record)


@router.patch(
    "/users/{user_id}",
    responses=_RESPONSES,
    summary="Activate or disable a platform user",
)
def update_user(
    user_id: UUID,
    payload: UpdateBackofficeUserRequest,
    database: DatabaseSession,
    _access: BackofficeAccess,
    operator_id: BackofficeOperatorId,
) -> BackofficeUserResponse:
    record = BackofficeService(database).update_platform_user(
        user_id,
        status=payload.status,
        expected_version=payload.version,
        actor_platform_user_id=operator_id,
    )
    return _user_response(record)


@router.get(
    "/workspaces/{workspace_id}/members",
    responses=_RESPONSES,
    summary="List members of a customer workspace",
)
def list_workspace_members(
    workspace_id: UUID,
    database: DatabaseSession,
    _access: BackofficeAccess,
) -> BackofficeUserListResponse:
    items = BackofficeService(database).list_workspace_members(workspace_id)
    return BackofficeUserListResponse(
        items=[_user_response(item) for item in items],
        page=1,
        page_size=len(items),
        total_items=len(items),
        total_pages=1 if items else 0,
    )


@router.get(
    "/modules",
    responses=_RESPONSES,
    summary="List available ERP modules",
)
def list_modules(
    database: DatabaseSession,
    _access: BackofficeAccess,
) -> BackofficeModuleListResponse:
    modules = BackofficeService(database).list_modules()
    return BackofficeModuleListResponse(
        items=[BackofficeModuleResponse(code=code, name=name) for code, name in modules]
    )


@router.get(
    "/plans",
    responses=_RESPONSES,
    summary="List subscription plans",
)
def list_plans(
    database: DatabaseSession,
    _access: BackofficeAccess,
) -> BackofficePlanListResponse:
    plans = BackofficeService(database).list_plans()
    return BackofficePlanListResponse(items=[_plan_response(plan) for plan in plans])


@router.patch(
    "/plans/{plan_id}",
    responses=_RESPONSES,
    summary="Update a subscription plan",
)
def update_plan(
    plan_id: UUID,
    payload: UpdateBackofficePlanRequest,
    database: DatabaseSession,
    _access: BackofficeAccess,
) -> BackofficePlanResponse:
    service = BackofficeService(database)
    record = service.update_plan(
        plan_id,
        name=payload.name,
        description=payload.description,
        module_codes=payload.module_codes,
        status=payload.status,
        expected_version=payload.version,
    )
    return _plan_response(record)
