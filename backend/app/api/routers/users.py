from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.api.deps import (
    CurrentPrincipal,
    DatabaseSession,
    MembershipManageGrant,
    MembershipReadGrant,
)
from app.repositories.users import BranchRecord, RoleRecord, UserRecord
from app.schemas.common import ErrorResponse
from app.schemas.users import (
    BranchReference,
    CreateUserRequest,
    PaginatedUsersResponse,
    RoleReference,
    SortDirection,
    UserFormOptionsResponse,
    UserListItem,
    UserSortField,
    UserStatusFilter,
    UserSummaryResponse,
)
from app.services.users import UsersService, user_initials

router = APIRouter(prefix="/api/v1/users", tags=["users"])

_SECURITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
}


def _role_response(role: RoleRecord) -> RoleReference:
    return RoleReference(id=role.id, code=role.code, name=role.name)


def _branch_response(branch: BranchRecord) -> BranchReference:
    return BranchReference(id=branch.id, code=branch.code, name=branch.name)


def _user_response(user: UserRecord) -> UserListItem:
    return UserListItem(
        id=user.membership_id,
        user_id=user.platform_user_id,
        display_name=user.display_name,
        email=user.email,
        initials=user_initials(user.display_name),
        role=_role_response(user.role) if user.role is not None else None,
        branches=[_branch_response(branch) for branch in user.branches],
        last_access_at=user.last_access_at,
        status=user.status,
    )


@router.get(
    "",
    summary="Listar usuarios visibles con filtros y paginación",
    responses=_SECURITY_RESPONSES,
)
def list_users(
    database: DatabaseSession,
    grant: MembershipReadGrant,
    search: Annotated[str | None, Query(max_length=100)] = None,
    status_filter: Annotated[
        UserStatusFilter | None,
        Query(alias="status"),
    ] = None,
    role_id: Annotated[UUID | None, Query(alias="roleId")] = None,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
    sort_by: Annotated[UserSortField, Query(alias="sortBy")] = "displayName",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "asc",
) -> PaginatedUsersResponse:
    result = UsersService(database).list_users(
        grant=grant,
        search=search,
        status=status_filter,
        role_id=role_id,
        branch_id=branch_id,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return PaginatedUsersResponse(
        items=[_user_response(user) for user in result.items],
        page=result.page,
        page_size=result.page_size,
        total_items=result.total_items,
        total_pages=result.total_pages,
    )


@router.get(
    "/summary",
    summary="Obtener métricas de usuarios dentro del alcance visible",
    responses=_SECURITY_RESPONSES,
)
def user_summary(
    database: DatabaseSession,
    grant: MembershipReadGrant,
) -> UserSummaryResponse:
    summary = UsersService(database).summary(grant)
    return UserSummaryResponse(
        total_users=summary.total_users,
        active_users=summary.active_users,
        administrators=summary.administrators,
        inactive_users=summary.inactive_users,
    )


@router.get(
    "/form-options",
    summary="Obtener roles y sucursales asignables en el formulario de usuario",
    responses=_SECURITY_RESPONSES,
)
def user_form_options(
    database: DatabaseSession,
    grant: MembershipManageGrant,
) -> UserFormOptionsResponse:
    options = UsersService(database).form_options(grant)
    return UserFormOptionsResponse(
        roles=[_role_response(role) for role in options.roles],
        branches=[_branch_response(branch) for branch in options.branches],
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Crear una identidad, membership y asignaciones de rol por sucursal",
    responses={
        **_SECURITY_RESPONSES,
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def create_user(
    payload: CreateUserRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: MembershipManageGrant,
) -> UserListItem:
    user = UsersService(database).create_user(
        principal=principal,
        grant=grant,
        display_name=payload.display_name,
        email=str(payload.email),
        password=payload.password.get_secret_value(),
        role_id=payload.role_id,
        branch_ids=payload.branch_ids,
    )
    return _user_response(user)
