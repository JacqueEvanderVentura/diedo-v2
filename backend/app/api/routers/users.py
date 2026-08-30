from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, Response, status

from app.api.deps import (
    CurrentPrincipal,
    DatabaseSession,
    MembershipManageGrant,
    MembershipReadGrant,
)
from app.config import settings
from app.repositories.users import (
    BranchRecord,
    LegalEntityRecord,
    RoleAssignmentRecord,
    RoleAssignmentSpec,
    RoleRecord,
    UserRecord,
)
from app.schemas.common import ErrorResponse
from app.schemas.users import (
    AcceptInvitationRequest,
    BranchReference,
    BranchRoleAssignmentInput,
    CreateInvitationRequest,
    CreateUserRequest,
    InvitationResponse,
    LegalEntityReference,
    LegalEntityRoleAssignmentInput,
    PaginatedUsersResponse,
    PasswordResetRequest,
    RoleAssignmentInput,
    RoleReference,
    SortDirection,
    UpdateUserRequest,
    UserFormOptionsResponse,
    UserListItem,
    UserRoleAssignmentResponse,
    UserSortField,
    UserStatusFilter,
    UserSummaryResponse,
    WorkspaceRoleAssignmentInput,
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
    return BranchReference(
        id=branch.id,
        legal_entity_id=branch.legal_entity_id,
        code=branch.code,
        name=branch.name,
    )


def _legal_entity_response(entity: LegalEntityRecord) -> LegalEntityReference:
    return LegalEntityReference(id=entity.id, code=entity.code, name=entity.name)


def _assignment_spec(assignment: RoleAssignmentInput) -> RoleAssignmentSpec:
    if isinstance(assignment, WorkspaceRoleAssignmentInput):
        return RoleAssignmentSpec(role_id=assignment.role_id, scope_type="workspace")
    if isinstance(assignment, LegalEntityRoleAssignmentInput):
        return RoleAssignmentSpec(
            role_id=assignment.role_id,
            scope_type="legal_entity",
            legal_entity_id=assignment.legal_entity_id,
        )
    if isinstance(assignment, BranchRoleAssignmentInput):
        return RoleAssignmentSpec(
            role_id=assignment.role_id,
            scope_type="branch",
            branch_id=assignment.branch_id,
        )
    raise TypeError("Unsupported role assignment input.")


def _assignment_response(assignment: RoleAssignmentRecord) -> UserRoleAssignmentResponse:
    scope_type = "legalEntity" if assignment.scope_type == "legal_entity" else assignment.scope_type
    return UserRoleAssignmentResponse(
        id=assignment.id,
        role_id=assignment.role_id,
        role_code=assignment.role.code,
        role_name=assignment.role.name,
        scope_type=scope_type,
        legal_entity_id=assignment.legal_entity_id,
        branch_id=assignment.branch_id,
    )


def _user_response(user: UserRecord) -> UserListItem:
    return UserListItem(
        id=user.membership_id,
        user_id=user.platform_user_id,
        display_name=user.display_name,
        email=user.email,
        initials=user_initials(user.display_name),
        role=_role_response(user.role) if user.role is not None else None,
        branches=[_branch_response(branch) for branch in user.branches],
        role_assignments=[_assignment_response(assignment) for assignment in user.role_assignments],
        last_access_at=user.last_access_at,
        status=user.status,
        version=user.version,
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
        legal_entities=[_legal_entity_response(entity) for entity in options.legal_entities],
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
        role_assignments=[_assignment_spec(item) for item in payload.role_assignments],
    )
    return _user_response(user)


@router.post(
    "/invitations",
    status_code=status.HTTP_201_CREATED,
    response_model_exclude_none=True,
    summary="Crear una invitación verificable para un workspace",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def create_invitation(
    payload: CreateInvitationRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: MembershipManageGrant,
) -> InvitationResponse:
    invitation, email, raw_token = UsersService(database).create_invitation(
        principal=principal,
        grant=grant,
        display_name=payload.display_name,
        email=str(payload.email),
        role_assignments=[_assignment_spec(item) for item in payload.role_assignments],
    )
    return InvitationResponse(
        id=invitation.id,
        membership_id=invitation.membership_id,
        email=email,
        expires_at=invitation.expires_at,
        status="pending",
        accept_token=raw_token if settings.expose_demo_invitation_tokens else None,
    )


@router.post(
    "/invitations/accept",
    summary="Aceptar una invitación mediante su secreto de un solo uso",
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def accept_invitation(
    payload: AcceptInvitationRequest,
    database: DatabaseSession,
) -> UserListItem:
    user = UsersService(database).accept_invitation(
        payload.token.get_secret_value(),
        payload.password.get_secret_value() if payload.password is not None else None,
    )
    return _user_response(user)


@router.delete(
    "/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revocar una invitación pendiente",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def revoke_invitation(
    invitation_id: UUID,
    database: DatabaseSession,
    grant: MembershipManageGrant,
) -> Response:
    UsersService(database).revoke_invitation(grant, invitation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{membership_id}",
    summary="Obtener el detalle de un membership visible",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def get_user(
    membership_id: UUID,
    database: DatabaseSession,
    grant: MembershipReadGrant,
) -> UserListItem:
    return _user_response(UsersService(database).get_user(grant, membership_id))


@router.patch(
    "/{membership_id}",
    summary="Actualizar estado y asignaciones de un membership",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def update_user(
    membership_id: UUID,
    payload: UpdateUserRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: MembershipManageGrant,
) -> UserListItem:
    user = UsersService(database).update_user(
        principal=principal,
        grant=grant,
        membership_id=membership_id,
        version=payload.version,
        status=payload.status,
        role_assignments=(
            [_assignment_spec(item) for item in payload.role_assignments]
            if payload.role_assignments is not None
            else None
        ),
    )
    return _user_response(user)


@router.post(
    "/{membership_id}/password-reset",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Restablecer la contraseña y revocar todas las sesiones de la identidad",
    responses={
        **_SECURITY_RESPONSES,
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def reset_user_password(
    membership_id: UUID,
    payload: PasswordResetRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: MembershipManageGrant,
) -> Response:
    UsersService(database).reset_password(
        principal=principal,
        grant=grant,
        membership_id=membership_id,
        new_password=payload.new_password.get_secret_value(),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
