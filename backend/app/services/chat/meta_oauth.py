from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal, cast
from urllib.parse import urlencode
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models.chat import ChatChannelAccount, ChatOauthState
from app.services.chat.graph_clients import GraphHttpClient, _default_graph_client
from app.services.errors import InvalidOperationError, ResourceNotFoundError

logger = logging.getLogger(__name__)

Channel = Literal["instagram", "whatsapp"]

_OAUTH_TTL = timedelta(minutes=20)

_SCOPES: dict[Channel, str] = {
    "instagram": (
        "pages_show_list,pages_messaging,"
        "instagram_business_basic,instagram_business_manage_messages"
    ),
    "whatsapp": "whatsapp_business_management,whatsapp_business_messaging,business_management",
}


@dataclass(frozen=True, slots=True)
class OauthCandidate:
    provider_account_id: str
    display_name: str


@dataclass(frozen=True, slots=True)
class OauthStartResult:
    authorization_url: str
    state_id: UUID


def _as_channel(value: str) -> Channel:
    if value not in ("instagram", "whatsapp"):
        raise InvalidOperationError("Canal de chat no soportado.", "channel")
    return cast(Channel, value)


class MetaOauthService:
    def __init__(
        self,
        session: Session,
        *,
        http_client: GraphHttpClient | None = None,
    ) -> None:
        self._session = session
        self._http = http_client or _default_graph_client()

    def start(
        self,
        *,
        workspace_id: UUID,
        channel: Channel,
        return_origin: str | None = None,
    ) -> OauthStartResult:
        self._require_meta_app_configured()
        bootstrap: dict[str, str] = {}
        if return_origin:
            bootstrap["return_origin"] = return_origin
        state = ChatOauthState(
            workspace_id=workspace_id,
            channel=channel,
            candidates_json=[],
            tokens_json=json.dumps(bootstrap) if bootstrap else None,
            expires_at=datetime.now(UTC) + _OAUTH_TTL,
        )
        self._session.add(state)
        self._session.flush()
        app_id = settings.meta_app_id or ""
        if channel == "instagram":
            params = {
                "client_id": self._instagram_app_id(),
                "redirect_uri": settings.meta_oauth_redirect_uri,
                "state": str(state.id),
                "scope": _SCOPES[channel],
                "response_type": "code",
            }
            url = f"https://www.instagram.com/oauth/authorize?{urlencode(params)}"
        else:
            params = {
                "client_id": app_id,
                "redirect_uri": settings.meta_oauth_redirect_uri,
                "state": str(state.id),
                "scope": _SCOPES[channel],
                "response_type": "code",
            }
            version = settings.meta_graph_api_version
            url = f"https://www.facebook.com/{version}/dialog/oauth?{urlencode(params)}"
        return OauthStartResult(authorization_url=url, state_id=state.id)

    def handle_callback(
        self,
        *,
        state_id: UUID,
        code: str | None,
        error: str | None,
    ) -> tuple[UUID, Channel, list[OauthCandidate], bool]:
        """Returns workspace_id, channel, candidates, auto_connected."""
        if error:
            raise InvalidOperationError(f"Meta OAuth cancelado: {error}", "oauth")
        if not code:
            raise InvalidOperationError("Meta OAuth no devolvió código.", "oauth")

        state = self._load_state(state_id)
        channel = _as_channel(state.channel)
        short_token = self._exchange_code(code, channel)
        access_token = self._to_long_lived_token(short_token, channel)
        candidates, tokens = self._discover_accounts(channel, access_token)
        if not candidates:
            raise InvalidOperationError(
                "No se encontró ninguna cuenta de Meta para este canal.",
                "channel",
            )

        state.candidates_json = [
            {"provider_account_id": c.provider_account_id, "display_name": c.display_name}
            for c in candidates
        ]
        state.tokens_json = json.dumps(tokens)

        if len(candidates) == 1:
            candidate = candidates[0]
            self._upsert_connected_account(
                workspace_id=state.workspace_id,
                channel=channel,
                provider_account_id=candidate.provider_account_id,
                display_name=candidate.display_name,
                access_token=tokens[candidate.provider_account_id],
            )
            self._session.delete(state)
            return state.workspace_id, channel, candidates, True

        return state.workspace_id, channel, candidates, False

    def complete_selection(
        self,
        *,
        workspace_id: UUID,
        state_id: UUID,
        provider_account_id: str,
    ) -> ChatChannelAccount:
        state = self._load_state(state_id)
        if state.workspace_id != workspace_id:
            raise ResourceNotFoundError("La sesión OAuth no existe.", "oauthStateId")

        tokens = self._tokens_from_state(state)
        token = tokens.get(provider_account_id)
        if token is None:
            raise InvalidOperationError(
                "Cuenta no válida para esta sesión OAuth.",
                "providerAccountId",
            )

        candidate = next(
            (
                item
                for item in state.candidates_json
                if str(item.get("provider_account_id")) == provider_account_id
            ),
            None,
        )
        display_name = str((candidate or {}).get("display_name") or provider_account_id)

        channel = _as_channel(state.channel)
        account = self._upsert_connected_account(
            workspace_id=workspace_id,
            channel=channel,
            provider_account_id=provider_account_id,
            display_name=display_name,
            access_token=token,
        )
        self._session.delete(state)
        return account

    def peek_return_origin(self, state_id: UUID) -> str | None:
        state = self._session.scalar(select(ChatOauthState).where(ChatOauthState.id == state_id))
        if state is None or not state.tokens_json:
            return None
        try:
            payload = json.loads(state.tokens_json)
        except json.JSONDecodeError:
            return None
        if not isinstance(payload, dict):
            return None
        origin = payload.get("return_origin")
        return origin if isinstance(origin, str) and origin else None

    def oauth_state_candidates(
        self, *, workspace_id: UUID, state_id: UUID
    ) -> tuple[Channel, list[OauthCandidate]]:
        state = self._load_state(state_id)
        if state.workspace_id != workspace_id:
            raise ResourceNotFoundError("La sesión OAuth no existe.", "oauthStateId")
        return _as_channel(state.channel), [
            OauthCandidate(
                provider_account_id=str(item["provider_account_id"]),
                display_name=str(item.get("display_name") or item["provider_account_id"]),
            )
            for item in state.candidates_json
        ]

    def _upsert_connected_account(
        self,
        *,
        workspace_id: UUID,
        channel: Channel,
        provider_account_id: str,
        display_name: str,
        access_token: str,
    ) -> ChatChannelAccount:
        account = self._session.scalar(
            select(ChatChannelAccount).where(
                ChatChannelAccount.workspace_id == workspace_id,
                ChatChannelAccount.channel == channel,
                ChatChannelAccount.provider_account_id == provider_account_id,
            )
        )
        if account is None:
            account = ChatChannelAccount(
                workspace_id=workspace_id,
                channel=channel,
                provider_account_id=provider_account_id,
                display_name=display_name,
            )
            self._session.add(account)
        account.display_name = display_name
        account.access_token_ciphertext = access_token
        account.connection_status = "connected"
        account.token_expires_at = None
        self._session.flush()
        return account

    def _load_state(self, state_id: UUID) -> ChatOauthState:
        state = self._session.scalar(select(ChatOauthState).where(ChatOauthState.id == state_id))
        if state is None:
            raise ResourceNotFoundError("La sesión OAuth no existe o expiró.", "oauthStateId")
        if state.expires_at < datetime.now(UTC):
            self._session.delete(state)
            self._session.flush()
            raise ResourceNotFoundError("La sesión OAuth expiró.", "oauthStateId")
        return state

    def _tokens_from_state(self, state: ChatOauthState) -> dict[str, str]:
        if not state.tokens_json:
            return {}
        payload = json.loads(state.tokens_json)
        if not isinstance(payload, dict):
            return {}
        return {str(key): str(value) for key, value in payload.items()}

    def _require_meta_app_configured(self) -> None:
        if not settings.meta_app_id or settings.meta_app_secret is None:
            raise InvalidOperationError(
                "Meta App no configurada (META_APP_ID / META_APP_SECRET).",
                "meta",
            )

    def _instagram_app_id(self) -> str:
        return settings.meta_instagram_app_id or settings.meta_app_id or ""

    def _instagram_app_secret(self) -> str:
        secret = settings.meta_instagram_app_secret or settings.meta_app_secret
        if secret is None:
            raise InvalidOperationError(
                "Meta App no configurada (META_APP_ID / META_APP_SECRET).",
                "meta",
            )
        return secret.get_secret_value()

    def _graph_get(
        self,
        path: str,
        access_token: str,
        params: dict[str, Any] | None = None,
        *,
        host: str = "graph.facebook.com",
    ) -> dict:
        version = settings.meta_graph_api_version
        query = urlencode(params or {})
        suffix = f"?{query}" if query else ""
        url = f"https://{host}/{version}/{path}{suffix}"
        return self._http.request(
            "GET",
            url,
            headers={"Authorization": f"Bearer {access_token}"},
        )

    def _exchange_code(self, code: str, channel: Channel) -> str:
        if channel == "instagram":
            return self._exchange_instagram_code(code)
        app_secret = settings.meta_app_secret.get_secret_value()  # type: ignore[union-attr]
        version = settings.meta_graph_api_version
        params = urlencode(
            {
                "client_id": settings.meta_app_id,
                "client_secret": app_secret,
                "redirect_uri": settings.meta_oauth_redirect_uri,
                "code": code,
            }
        )
        url = f"https://graph.facebook.com/{version}/oauth/access_token?{params}"
        payload = self._http.request("GET", url)
        token = payload.get("access_token")
        if not token:
            raise InvalidOperationError("No se pudo intercambiar el código OAuth.", "oauth")
        return str(token)

    def _exchange_instagram_code(self, code: str) -> str:
        payload = self._http.request(
            "POST",
            "https://api.instagram.com/oauth/access_token",
            data={
                "client_id": self._instagram_app_id(),
                "client_secret": self._instagram_app_secret(),
                "grant_type": "authorization_code",
                "redirect_uri": settings.meta_oauth_redirect_uri,
                "code": code,
            },
        )
        token = payload.get("access_token")
        if not token:
            entries = payload.get("data") or []
            if entries and isinstance(entries[0], dict):
                token = entries[0].get("access_token")
        if not token:
            raise InvalidOperationError("No se pudo intercambiar el código OAuth.", "oauth")
        return str(token)

    def _to_long_lived_token(self, short_token: str, channel: Channel) -> str:
        if channel == "instagram":
            app_secret = self._instagram_app_secret()
            params = urlencode(
                {
                    "grant_type": "ig_exchange_token",
                    "client_secret": app_secret,
                    "access_token": short_token,
                }
            )
            payload = self._http.request(
                "GET",
                f"https://graph.instagram.com/access_token?{params}",
            )
            token = payload.get("access_token")
            return str(token or short_token)
        version = settings.meta_graph_api_version
        app_secret = settings.meta_app_secret.get_secret_value()  # type: ignore[union-attr]
        params = urlencode(
            {
                "grant_type": "fb_exchange_token",
                "client_id": settings.meta_app_id,
                "client_secret": app_secret,
                "fb_exchange_token": short_token,
            }
        )
        url = f"https://graph.facebook.com/{version}/oauth/access_token?{params}"
        payload = self._http.request("GET", url)
        token = payload.get("access_token")
        return str(token or short_token)

    def _discover_accounts(
        self, channel: Channel, access_token: str
    ) -> tuple[list[OauthCandidate], dict[str, str]]:
        if channel == "whatsapp":
            return self._discover_whatsapp(access_token)
        return self._discover_instagram(access_token)

    def _discover_whatsapp(self, access_token: str) -> tuple[list[OauthCandidate], dict[str, str]]:
        payload = self._graph_get(
            "me/businesses",
            access_token,
            {
                "fields": (
                    "owned_whatsapp_business_accounts{"
                    "id,name,phone_numbers{id,display_phone_number,verified_name}"
                    "}"
                ),
            },
        )
        candidates: list[OauthCandidate] = []
        tokens: dict[str, str] = {}
        for business in payload.get("data") or []:
            for waba in (business.get("owned_whatsapp_business_accounts") or {}).get("data") or []:
                for phone in waba.get("phone_numbers", {}).get("data") or []:
                    phone_id = str(phone.get("id") or "")
                    if not phone_id:
                        continue
                    label = str(
                        phone.get("verified_name")
                        or phone.get("display_phone_number")
                        or waba.get("name")
                        or phone_id
                    )
                    candidates.append(
                        OauthCandidate(provider_account_id=phone_id, display_name=label)
                    )
                    tokens[phone_id] = access_token
        return candidates, tokens

    def _discover_instagram(self, access_token: str) -> tuple[list[OauthCandidate], dict[str, str]]:
        payload = self._graph_get(
            "me",
            access_token,
            {"fields": "user_id,id,username,name"},
            host="graph.instagram.com",
        )
        ig_id = str(payload.get("user_id") or payload.get("id") or "")
        if not ig_id:
            return [], {}
        username = str(payload.get("username") or payload.get("name") or ig_id)
        display = f"@{username}" if username and not username.startswith("@") else username
        candidate = OauthCandidate(provider_account_id=ig_id, display_name=display)
        return [candidate], {ig_id: access_token}

    @staticmethod
    def purge_expired(session: Session) -> int:
        now = datetime.now(UTC)
        result = session.execute(delete(ChatOauthState).where(ChatOauthState.expires_at < now))
        return int(getattr(result, "rowcount", 0) or 0)
