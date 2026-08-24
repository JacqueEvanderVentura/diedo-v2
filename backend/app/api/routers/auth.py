from typing import Any

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentPrincipal, DatabaseSession
from app.schemas.auth import (
    CurrentSessionResponse,
    LoginRequest,
    RefreshTokenRequest,
    TokenResponse,
)
from app.schemas.common import ErrorResponse
from app.services.auth import AuthService, TokenPair

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
    return TokenResponse(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
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
    payload: RefreshTokenRequest,
    response: Response,
    database: DatabaseSession,
) -> TokenResponse:
    pair = AuthService(database).refresh(payload.refresh_token.get_secret_value())
    return _token_response(pair, response)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revocar la sesión actual",
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def logout(principal: CurrentPrincipal, database: DatabaseSession) -> Response:
    AuthService(database).logout(principal)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/me",
    summary="Obtener el usuario y workspace de la sesión",
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def current_session(principal: CurrentPrincipal) -> CurrentSessionResponse:
    return CurrentSessionResponse(
        user_id=principal.platform_user_id,
        membership_id=principal.membership_id,
        workspace_id=principal.workspace_id,
        display_name=principal.display_name,
        email=principal.email,
    )
