import hmac
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Security, status
from fastapi.security import APIKeyHeader

from app.api.deps import DatabaseSession
from app.config import settings
from app.core.errors import raise_api_error
from app.schemas.backoffice import (
    CreateWorkspaceRequest,
    ProvisionedOwnerResponse,
    ProvisionedWorkspaceResponse,
)
from app.schemas.common import ErrorResponse
from app.services.workspace_provisioning import WorkspaceProvisioningService

_backoffice_key = APIKeyHeader(
    name="X-Backoffice-Key",
    scheme_name="BackofficeKey",
    description="Clave de plataforma para aprovisionar workspaces; no es un token de usuario.",
    auto_error=False,
)


def require_backoffice_access(
    supplied_key: Annotated[str | None, Security(_backoffice_key)],
) -> None:
    configured = settings.backoffice_api_key
    if configured is None:
        raise_api_error(503, "El aprovisionamiento de workspaces no está habilitado.")
    if supplied_key is None or not hmac.compare_digest(
        supplied_key,
        configured.get_secret_value(),
    ):
        raise_api_error(401, "La clave de backoffice no es válida.", "X-Backoffice-Key")


BackofficeAccess = Annotated[None, Depends(require_backoffice_access)]

router = APIRouter(prefix="/api/v1/backoffice", tags=["backoffice"])

_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse},
    401: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
}


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
    result = WorkspaceProvisioningService(database).provision(
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
