from collections.abc import Callable
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.services.auth import AuthPrincipal, AuthService
from app.services.authorization import AuthorizationService, PermissionGrant
from app.services.errors import AuthenticationError

DatabaseSession = Annotated[Session, Depends(get_session)]

_bearer = HTTPBearer(
    auto_error=False,
    scheme_name="BearerAuth",
    description="JWT de acceso obtenido en POST /api/v1/auth/login.",
)


def get_current_principal(
    database: DatabaseSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AuthPrincipal:
    if credentials is None or credentials.scheme.casefold() != "bearer":
        raise AuthenticationError("Debes enviar un Bearer token válido.")
    return AuthService(database).authenticate_access_token(credentials.credentials)


CurrentPrincipal = Annotated[AuthPrincipal, Depends(get_current_principal)]


def require_permission(permission_code: str) -> Callable[..., PermissionGrant]:
    def dependency(
        database: DatabaseSession,
        principal: CurrentPrincipal,
    ) -> PermissionGrant:
        return AuthorizationService(database).require_permission(principal, permission_code)

    return dependency


MembershipReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("membership.read")),
]
MembershipManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("membership.manage")),
]
RoleReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("role.read")),
]
RoleManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("role.manage")),
]
