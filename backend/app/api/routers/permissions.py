from typing import Any
from uuid import UUID

from fastapi import APIRouter

from app.api.deps import (
    CurrentPrincipal,
    DatabaseSession,
    RoleManageGrant,
    RoleReadGrant,
)
from app.repositories.permissions import PermissionRecord, RoleRecord
from app.schemas.common import ErrorResponse
from app.schemas.permissions import (
    PermissionMatrixItem,
    PermissionMatrixResponse,
    PermissionModule,
    ReplaceRolePermissionsRequest,
    RoleResponse,
)
from app.services.permissions import PermissionsService

roles_router = APIRouter(prefix="/api/v1/roles", tags=["roles and permissions"])
permissions_router = APIRouter(prefix="/api/v1/permissions", tags=["roles and permissions"])

_SECURITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
}


def _role_response(role: RoleRecord) -> RoleResponse:
    return RoleResponse(
        id=role.id,
        code=role.code,
        name=role.name,
        version=role.version,
        is_system=role.is_system,
        permission_count=role.permission_count,
    )


def _permission_response(permission: PermissionRecord) -> PermissionMatrixItem:
    return PermissionMatrixItem(
        id=permission.id,
        code=permission.code,
        action=permission.action,
        name=permission.name,
        description=permission.description,
        granted_role_ids=list(permission.granted_role_ids),
    )


@roles_router.get(
    "",
    summary="Listar roles activos del workspace",
    responses=_SECURITY_RESPONSES,
)
def list_roles(
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: RoleReadGrant,
) -> list[RoleResponse]:
    del grant
    return [
        _role_response(role)
        for role in PermissionsService(database).list_roles(principal.workspace_id)
    ]


@permissions_router.get(
    "/matrix",
    summary="Obtener módulos, acciones y concesiones por rol",
    responses=_SECURITY_RESPONSES,
)
def permission_matrix(
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: RoleReadGrant,
) -> PermissionMatrixResponse:
    del grant
    matrix = PermissionsService(database).matrix(principal.workspace_id)
    return PermissionMatrixResponse(
        roles=[_role_response(role) for role in matrix.roles],
        modules=[
            PermissionModule(
                code=module.code,
                name=module.name,
                permissions=[_permission_response(permission) for permission in module.permissions],
            )
            for module in matrix.modules
        ],
        total_permissions=matrix.total_permissions,
    )


@roles_router.put(
    "/{role_id}/permissions",
    summary="Reemplazar de forma idempotente los permisos de un rol",
    responses={
        **_SECURITY_RESPONSES,
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def replace_role_permissions(
    role_id: UUID,
    payload: ReplaceRolePermissionsRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: RoleManageGrant,
) -> RoleResponse:
    role = PermissionsService(database).replace_role_permissions(
        principal=principal,
        grant=grant,
        role_id=role_id,
        permission_ids=payload.permission_ids,
        expected_version=payload.version,
    )
    return _role_response(role)
