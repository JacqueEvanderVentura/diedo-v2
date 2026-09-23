import logging
import re
from typing import Annotated, Any, cast
from urllib.parse import urlencode, urlparse
from uuid import UUID

from fastapi import APIRouter, Header, Query, Response, status
from fastapi.responses import RedirectResponse

from app.api.deps import DatabaseSession, WorkspaceUpdateGrant
from app.config import settings
from app.core.cors import parse_cors_origins
from app.db.models.chat import ChatChannelAccount
from app.schemas.chat import (
    ChatChannel,
    ChatChannelAccountListResponse,
    ChatChannelAccountResponse,
    ChatConnectionStatus,
    ChatOauthCandidateResponse,
    ChatOauthCompleteRequest,
    ChatOauthPendingResponse,
    ChatOauthStartRequest,
    ChatOauthStartResponse,
    UpdateChatChannelAccountBranchesRequest,
)
from app.schemas.common import ErrorResponse
from app.services.authorization import PermissionGrant
from app.services.chat.channel_account_service import ChatChannelAccountService
from app.services.chat.meta_oauth import MetaOauthService
from app.services.errors import InvalidOperationError, ResourceNotFoundError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

_SECURITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
}
_WRITE_RESPONSES: dict[int | str, dict[str, Any]] = {
    **_SECURITY_RESPONSES,
    400: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
}


def _account_response(
    service: ChatChannelAccountService,
    grant: PermissionGrant,
    account: ChatChannelAccount,
) -> ChatChannelAccountResponse:
    return ChatChannelAccountResponse(
        id=account.id,
        channel=cast(ChatChannel, account.channel),
        provider_account_id=account.provider_account_id,
        display_name=account.display_name,
        connection_status=cast(ChatConnectionStatus, account.connection_status),
        assigned_branch_ids=service.assigned_branch_ids(grant, account.id),
        version=account.version,
    )


@router.get(
    "/channel-accounts",
    responses=_SECURITY_RESPONSES,
)
def list_channel_accounts(
    response: Response,
    database: DatabaseSession,
    grant: WorkspaceUpdateGrant,
) -> ChatChannelAccountListResponse:
    response.headers["Cache-Control"] = "no-store"
    service = ChatChannelAccountService(database)
    accounts = service.list_accounts(grant)
    return ChatChannelAccountListResponse(
        items=[_account_response(service, grant, account) for account in accounts]
    )


@router.put(
    "/channel-accounts/{account_id}/branches",
    responses=_WRITE_RESPONSES,
)
def update_channel_account_branches(
    account_id: UUID,
    payload: UpdateChatChannelAccountBranchesRequest,
    database: DatabaseSession,
    grant: WorkspaceUpdateGrant,
) -> ChatChannelAccountResponse:
    service = ChatChannelAccountService(database)
    branch_ids = service.update_branch_assignments(
        grant,
        account_id,
        payload.branch_ids,
    )
    database.commit()
    account = service.get_account(grant, account_id)
    return ChatChannelAccountResponse(
        id=account.id,
        channel=cast(ChatChannel, account.channel),
        provider_account_id=account.provider_account_id,
        display_name=account.display_name,
        connection_status=cast(ChatConnectionStatus, account.connection_status),
        assigned_branch_ids=branch_ids,
        version=account.version,
    )


@router.post(
    "/channel-accounts/{account_id}/disconnect",
    status_code=status.HTTP_200_OK,
    responses=_WRITE_RESPONSES,
)
def disconnect_channel_account(
    account_id: UUID,
    database: DatabaseSession,
    grant: WorkspaceUpdateGrant,
) -> ChatChannelAccountResponse:
    service = ChatChannelAccountService(database)
    account = service.disconnect(grant, account_id)
    database.commit()
    return _account_response(service, grant, account)


@router.post(
    "/channel-accounts/oauth/start",
    responses=_WRITE_RESPONSES,
)
def start_channel_oauth(
    payload: ChatOauthStartRequest,
    database: DatabaseSession,
    grant: WorkspaceUpdateGrant,
    origin: Annotated[str | None, Header()] = None,
) -> ChatOauthStartResponse:
    result = MetaOauthService(database).start(
        workspace_id=grant.workspace_id,
        channel=payload.channel,
        return_origin=_allowed_return_origin(payload.return_origin or origin),
    )
    database.commit()
    return ChatOauthStartResponse(authorization_url=result.authorization_url)


@router.get(
    "/channel-accounts/oauth/pending",
    responses=_WRITE_RESPONSES,
)
def pending_channel_oauth(
    oauth_state_id: Annotated[UUID, Query(alias="oauthStateId")],
    database: DatabaseSession,
    grant: WorkspaceUpdateGrant,
) -> ChatOauthPendingResponse:
    channel, candidates = MetaOauthService(database).oauth_state_candidates(
        workspace_id=grant.workspace_id,
        state_id=oauth_state_id,
    )
    return ChatOauthPendingResponse(
        channel=channel,
        candidates=[
            ChatOauthCandidateResponse(
                provider_account_id=candidate.provider_account_id,
                display_name=candidate.display_name,
            )
            for candidate in candidates
        ],
    )


@router.post(
    "/channel-accounts/oauth/complete",
    responses=_WRITE_RESPONSES,
)
def complete_channel_oauth(
    payload: ChatOauthCompleteRequest,
    database: DatabaseSession,
    grant: WorkspaceUpdateGrant,
) -> ChatChannelAccountResponse:
    service = ChatChannelAccountService(database)
    account = MetaOauthService(database).complete_selection(
        workspace_id=grant.workspace_id,
        state_id=payload.oauth_state_id,
        provider_account_id=payload.provider_account_id,
    )
    database.commit()
    return _account_response(service, grant, account)


oauth_router = APIRouter(prefix="/api/v1/chat/oauth", tags=["chat"])


def _allowed_frontend_origins() -> set[str]:
    origins = set(parse_cors_origins(settings.cors_origins))
    origins.add(settings.public_app_url.rstrip("/"))
    origins.add("https://app.helios360erp.com")
    return origins


def _normalize_origin(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    if parsed.path not in {"", "/"}:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _allowed_return_origin(origin: str | None) -> str | None:
    normalized = _normalize_origin(origin)
    if normalized and normalized in _allowed_frontend_origins():
        return normalized
    return None


def _oauth_error_detail(exc: InvalidOperationError) -> str:
    parts: list[str] = []
    if exc.graph_status is not None:
        parts.append(f"http{exc.graph_status}")
    if exc.graph_code is not None:
        parts.append(f"code{exc.graph_code}")
    if exc.graph_type:
        safe_type = re.sub(r"[^A-Za-z0-9_]", "", exc.graph_type)[:40]
        if safe_type:
            parts.append(safe_type)
    return "_".join(parts)


def _frontend_oauth_return(return_origin: str | None = None, **params: str) -> str:
    base = (return_origin or settings.public_app_url).rstrip("/")
    query = urlencode({key: value for key, value in params.items() if value})
    path = f"{base}/configuracion?open=chat-canales"
    return f"{path}&{query}" if query else path


@oauth_router.get("/meta/callback")
def meta_oauth_callback(
    database: DatabaseSession,
    state: Annotated[str | None, Query()] = None,
    code: Annotated[str | None, Query()] = None,
    error: Annotated[str | None, Query()] = None,
    error_description: Annotated[str | None, Query(alias="error_description")] = None,
) -> RedirectResponse:
    if not state:
        return RedirectResponse(
            _frontend_oauth_return(chatOauth="error", chatOauthMessage="missing_state"),
            status_code=status.HTTP_302_FOUND,
        )
    try:
        state_id = UUID(state)
    except ValueError:
        return RedirectResponse(
            _frontend_oauth_return(chatOauth="error", chatOauthMessage="invalid_state"),
            status_code=status.HTTP_302_FOUND,
        )

    oauth = MetaOauthService(database)
    return_origin = oauth.peek_return_origin(state_id)
    try:
        _workspace_id, channel, candidates, auto_connected = oauth.handle_callback(
            state_id=state_id,
            code=code,
            error=error or error_description,
        )
        database.commit()
    except InvalidOperationError as exc:
        database.rollback()
        logger.warning(
            "meta oauth callback rejected parameter=%s graph_status=%s graph_code=%s "
            "graph_type=%s graph_message=%s",
            exc.parameter,
            exc.graph_status,
            exc.graph_code,
            exc.graph_type,
            exc.graph_message,
        )
        if exc.graph_status is not None:
            code_hint = "graph_failed"
        else:
            code_hint = {
                "channel": "no_accounts",
                "oauth": "oauth_denied" if error else "oauth_failed",
                "meta": "meta_not_configured",
            }.get(exc.parameter or "", "oauth_failed")
        return RedirectResponse(
            _frontend_oauth_return(
                return_origin,
                chatOauth="error",
                chatOauthMessage=code_hint,
                chatOauthDetail=_oauth_error_detail(exc),
            ),
            status_code=status.HTTP_302_FOUND,
        )
    except ResourceNotFoundError:
        database.rollback()
        logger.warning("meta oauth callback missing or expired state")
        return RedirectResponse(
            _frontend_oauth_return(
                return_origin,
                chatOauth="error",
                chatOauthMessage="invalid_state",
            ),
            status_code=status.HTTP_302_FOUND,
        )
    except Exception:
        database.rollback()
        logger.exception("meta oauth callback unexpected failure")
        return RedirectResponse(
            _frontend_oauth_return(
                return_origin,
                chatOauth="error",
                chatOauthMessage="oauth_failed",
            ),
            status_code=status.HTTP_302_FOUND,
        )

    if auto_connected:
        return RedirectResponse(
            _frontend_oauth_return(return_origin, chatOauth="connected", chatChannel=channel),
            status_code=status.HTTP_302_FOUND,
        )
    return RedirectResponse(
        _frontend_oauth_return(
            return_origin,
            chatOauth="select",
            chatOauthState=state,
            chatChannel=channel,
            chatOauthCount=str(len(candidates)),
        ),
        status_code=status.HTTP_302_FOUND,
    )
