from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Cookie, Response, status

from app.api.deps import CurrentPrincipal, DatabaseSession
from app.config import settings
from app.schemas.auth import (
    AuthSessionResponse,
    ChangePasswordRequest,
    CurrentSessionResponse,
    EffectiveScopeResponse,
    LoginRequest,
    SessionBranchReference,
    SessionRoleAssignment,
    SessionRoleReference,
    SessionScopeReference,
    SwitchWorkspaceRequest,
    TokenResponse,
    UpdateProfileRequest,
    WorkspaceOptionResponse,
    WorkspaceSessionReference,
)
from app.schemas.common import ErrorResponse
from app.services.auth import AuthService, TokenPair
from app.services.errors import AuthenticationError

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])

_AUTH_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse},
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
}


def _token_response(pair: TokenPair, response: Response) -> TokenResponse:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=pair.refresh_token,
        max_age=pair.refresh_expires_in,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        # Keep the credential on authentication routes only. Development
        # proxies rewrite this path to their public prefix in Set-Cookie.
        path=settings.refresh_cookie_path,
    )
    return TokenResponse(
        access_token=pair.access_token,
        expires_in=pair.expires_in,
        refresh_expires_in=pair.refresh_expires_in,
    )


@router.post(
    "/login",
    summary="Iniciar sesión y emitir tokens rotables",
    responses=_AUTH_RESPONSES,
)
def login(
    payload: LoginRequest,
    response: Response,
    database: DatabaseSession,
) -> TokenResponse:
    pair = AuthService(database).login(
        email=str(payload.email),
        password=payload.password.get_secret_value(),
    )
    return _token_response(pair, response)


@router.post(
    "/refresh",
    summary="Rotar el refresh token y emitir un nuevo access token",
    responses={401: {"model": ErrorResponse}},
)
def refresh(
    response: Response,
    database: DatabaseSession,
    refresh_token: Annotated[
        str | None,
        Cookie(alias=settings.refresh_cookie_name),
    ] = None,
) -> TokenResponse:
    if refresh_token is None:
        raise AuthenticationError("Refresh token inválido o expirado.")
    pair = AuthService(database).refresh(refresh_token)
    return _token_response(pair, response)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revocar la sesión actual",
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def logout(principal: CurrentPrincipal, database: DatabaseSession) -> Response:
    AuthService(database).logout(principal)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=settings.refresh_cookie_path,
    )
    return response


@router.get(
    "/me",
    summary="Obtener el usuario y workspace de la sesión",
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def current_session(
    principal: CurrentPrincipal,
    database: DatabaseSession,
) -> CurrentSessionResponse:
    context = AuthService(database).current_session_context(principal)
    primary = context.assignments[0] if context.assignments else None
    return CurrentSessionResponse(
        user_id=principal.platform_user_id,
        membership_id=principal.membership_id,
        workspace_id=principal.workspace_id,
        display_name=principal.display_name,
        email=principal.email,
        workspace=WorkspaceSessionReference(
            id=context.workspace.id,
            slug=context.workspace.slug,
            name=context.workspace.name,
            default_currency=context.workspace.default_currency,
            timezone=context.workspace.timezone,
            locale=context.workspace.locale,
            version=context.workspace.version,
        ),
        role_assignments=[
            SessionRoleAssignment(
                id=assignment.id,
                role=SessionRoleReference(
                    id=assignment.role_id,
                    code=assignment.role_code,
                    name=assignment.role_name,
                ),
                scope=SessionScopeReference(
                    type=assignment.scope_type,  # type: ignore[arg-type]
                    legal_entity_id=assignment.legal_entity_id,
                    branch_id=assignment.branch_id,
                ),
            )
            for assignment in context.assignments
        ],
        primary_role=(
            SessionRoleReference(
                id=primary.role_id,
                code=primary.role_code,
                name=primary.role_name,
            )
            if primary is not None
            else None
        ),
        visible_branches=[
            SessionBranchReference(
                id=branch.id,
                legal_entity_id=branch.legal_entity_id,
                code=branch.code,
                name=branch.name,
            )
            for branch in context.visible_branches
        ],
        effective_scope=EffectiveScopeResponse(
            workspace_wide=context.effective_scope.workspace_wide,
            legal_entity_ids=sorted(context.effective_scope.legal_entity_ids),
            branch_ids=sorted(branch.id for branch in context.visible_branches),
        ),
        effective_permission_codes=list(context.permission_codes),
        workspace_permission_codes=list(context.workspace_permission_codes),
        enabled_modules=list(context.enabled_modules),
    )


@router.get(
    "/workspaces",
    summary="Listar workspaces disponibles para la identidad actual",
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def list_workspaces(
    principal: CurrentPrincipal,
    database: DatabaseSession,
) -> list[WorkspaceOptionResponse]:
    return [
        WorkspaceOptionResponse(
            workspace_id=record.workspace_id,
            membership_id=record.membership_id,
            slug=record.workspace_slug,
            name=record.workspace_name,
            is_default=record.is_default,
        )
        for record in AuthService(database).list_workspaces(principal)
    ]


@router.post(
    "/switch-workspace",
    summary="Cambiar el workspace activo y rotar la sesión",
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def switch_workspace(
    payload: SwitchWorkspaceRequest,
    response: Response,
    principal: CurrentPrincipal,
    database: DatabaseSession,
) -> TokenResponse:
    pair = AuthService(database).switch_workspace(principal, payload.workspace_id)
    return _token_response(pair, response)


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cambiar la contraseña de la identidad actual",
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
)
def change_password(
    payload: ChangePasswordRequest,
    principal: CurrentPrincipal,
    database: DatabaseSession,
) -> Response:
    AuthService(database).change_password(
        principal,
        current_password=payload.current_password.get_secret_value(),
        new_password=payload.new_password.get_secret_value(),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch(
    "/profile",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Actualizar el nombre global de la identidad actual",
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
)
def update_profile(
    payload: UpdateProfileRequest,
    principal: CurrentPrincipal,
    database: DatabaseSession,
) -> Response:
    AuthService(database).update_profile(principal, payload.display_name)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/sessions",
    summary="Listar sesiones activas de la identidad actual",
    responses={401: {"model": ErrorResponse}},
)
def list_sessions(
    principal: CurrentPrincipal,
    database: DatabaseSession,
) -> list[AuthSessionResponse]:
    return [
        AuthSessionResponse(
            id=record.id,
            workspace_id=record.workspace_id,
            current=record.id == principal.session_id,
            created_at=record.created_at,
            last_used_at=record.last_used_at,
            expires_at=record.expires_at,
        )
        for record in AuthService(database).list_sessions(principal)
    ]


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revocar una sesión propia",
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def revoke_session(
    session_id: UUID,
    principal: CurrentPrincipal,
    database: DatabaseSession,
) -> Response:
    AuthService(database).revoke_owned_session(principal, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
