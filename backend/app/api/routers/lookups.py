from typing import Any

from fastapi import APIRouter

from app.api.deps import DatabaseSession, MembershipManageGrant
from app.schemas.common import ErrorResponse, SimpleOptionResponse
from app.services.users import UsersService

router = APIRouter(prefix="/api/v1/lookups", tags=["lookups"])

_SECURITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
}


@router.get(
    "/roles",
    summary="Listar roles asignables para controles de selección",
    responses=_SECURITY_RESPONSES,
)
def role_options(
    database: DatabaseSession,
    grant: MembershipManageGrant,
) -> list[SimpleOptionResponse]:
    return [
        SimpleOptionResponse(id=role.id, name=role.name)
        for role in UsersService(database).assignable_roles(grant)
    ]


@router.get(
    "/branches",
    summary="Listar sucursales asignables dentro del alcance de la sesión",
    responses=_SECURITY_RESPONSES,
)
def branch_options(
    database: DatabaseSession,
    grant: MembershipManageGrant,
) -> list[SimpleOptionResponse]:
    return [
        SimpleOptionResponse(id=branch.id, name=branch.name)
        for branch in UsersService(database).assignable_branches(grant)
    ]
