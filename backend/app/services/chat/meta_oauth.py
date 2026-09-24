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
from app.services.chat.channel_account_service import ChatChannelAccountService
from app.services.chat.graph_clients import GraphApiError, GraphHttpClient, _default_graph_client
from app.services.errors import InvalidOperationError, ResourceNotFoundError

logger = logging.getLogger(__name__)

Channel = Literal["instagram", "whatsapp"]

_OAUTH_TTL = timedelta(minutes=20)

_SCOPES: dict[Channel, str] = {
    # Match Meta App Dashboard Instagram Login button (www.instagram.com/oauth/authorize).
    "instagram": (
        "instagram_business_basic,instagram_business_manage_messages,"
        "instagram_business_manage_comments,instagram_business_content_publish,"
        "instagram_business_manage_insights"
    ),
    "whatsapp": "whatsapp_business_management,whatsapp_business_messaging,business_management",
}

_WA_PHONE_FIELDS = "id,display_phone_number,verified_name"
_WA_WABA_FIELDS = f"id,name,phone_numbers{{{_WA_PHONE_FIELDS}}}"
_INSTAGRAM_APP_MISSING = (
    "Instagram Login no configurada (META_INSTAGRAM_APP_ID / META_INSTAGRAM_APP_SECRET)."
)
_OAUTH_EXCHANGE_FAILED = "No se pudo intercambiar el código OAuth."


@dataclass(frozen=True, slots=True)
class OauthCandidate:
    provider_account_id: str
    display_name: str
    phone_number: str = ""
    waba_id: str = ""


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
        if channel == "instagram":
            self._require_instagram_app_configured()
        else:
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
                "force_reauth": "true",
            }
            url = f"https://www.instagram.com/oauth/authorize?{urlencode(params)}"
            logger.info("meta oauth start channel=instagram client_id=%s", params["client_id"])
        else:
            params = {
                "client_id": app_id,
                "redirect_uri": settings.meta_oauth_redirect_uri,
                "state": str(state.id),
                "response_type": "code",
                "display": "popup",
            }
            config_id = (settings.meta_whatsapp_config_id or "").strip()
            if config_id:
                params["config_id"] = config_id
                params["override_default_response_type"] = "true"
            else:
                params["scope"] = _SCOPES[channel]
                params["auth_type"] = "rerequest"
            version = settings.meta_graph_api_version
            url = f"https://www.facebook.com/{version}/dialog/oauth?{urlencode(params)}"
            logger.info(
                "meta oauth start channel=whatsapp client_id=%s embedded_signup=%s",
                app_id,
                bool(config_id),
            )
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
            raise InvalidOperationError(
                f"Meta OAuth cancelado: {error}",
                "oauth",
                public_code="cancelled",
            )
        if not code:
            raise InvalidOperationError(
                "Meta OAuth no devolvió código.",
                "oauth",
                public_code="missing_code",
            )

        state = self._load_state(state_id)
        channel = _as_channel(state.channel)
        short_token = self._exchange_code(code, channel)
        access_token = self._to_long_lived_token(short_token, channel)
        candidates, tokens = self._discover_accounts(channel, access_token)
        if not candidates:
            logger.warning("meta oauth no candidates channel=%s", channel)
            raise InvalidOperationError(
                "No se encontró ninguna cuenta de Meta para este canal.",
                "channel",
                public_code="no_accounts",
            )

        state.candidates_json = [
            {
                "provider_account_id": c.provider_account_id,
                "display_name": c.display_name,
                "phone_number": c.phone_number,
                "waba_id": c.waba_id,
            }
            for c in candidates
        ]
        state.tokens_json = json.dumps(tokens)

        if len(candidates) == 1:
            candidate = candidates[0]
            token = tokens[candidate.provider_account_id]
            account = self._upsert_connected_account(
                workspace_id=state.workspace_id,
                channel=channel,
                provider_account_id=candidate.provider_account_id,
                display_name=candidate.display_name,
                access_token=token,
            )
            ChatChannelAccountService(self._session).ensure_default_branch_assignments(account)
            self._subscribe_channel_webhooks(
                channel,
                provider_account_id=candidate.provider_account_id,
                access_token=token,
                waba_id=candidate.waba_id,
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
        waba_id = str((candidate or {}).get("waba_id") or "")

        channel = _as_channel(state.channel)
        account = self._upsert_connected_account(
            workspace_id=workspace_id,
            channel=channel,
            provider_account_id=provider_account_id,
            display_name=display_name,
            access_token=token,
        )
        ChatChannelAccountService(self._session).ensure_default_branch_assignments(account)
        self._subscribe_channel_webhooks(
            channel,
            provider_account_id=provider_account_id,
            access_token=token,
            waba_id=waba_id,
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
                phone_number=str(item.get("phone_number") or ""),
                waba_id=str(item.get("waba_id") or ""),
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

    def _require_instagram_app_configured(self) -> None:
        if not settings.meta_instagram_app_id or settings.meta_instagram_app_secret is None:
            raise InvalidOperationError(_INSTAGRAM_APP_MISSING, "meta")

    def _instagram_app_id(self) -> str:
        app_id = settings.meta_instagram_app_id
        if not app_id:
            raise InvalidOperationError(_INSTAGRAM_APP_MISSING, "meta")
        return app_id

    def _instagram_app_secret(self) -> str:
        secret = settings.meta_instagram_app_secret
        if secret is None:
            raise InvalidOperationError(_INSTAGRAM_APP_MISSING, "meta")
        return secret.get_secret_value()

    def _subscribe_channel_webhooks(
        self,
        channel: Channel,
        *,
        provider_account_id: str,
        access_token: str,
        waba_id: str = "",
    ) -> None:
        if channel == "instagram":
            self._subscribe_instagram_messages(provider_account_id, access_token)
            return
        resolved_waba = waba_id.strip() or self._lookup_waba_id(provider_account_id, access_token)
        self._subscribe_whatsapp_messages(resolved_waba, access_token)

    def _subscribe_instagram_messages(self, ig_user_id: str, access_token: str) -> None:
        version = settings.meta_graph_api_version
        url = f"https://graph.instagram.com/{version}/{ig_user_id}/subscribed_apps"
        try:
            self._http.request(
                "POST",
                url,
                params={"subscribed_fields": "messages"},
                headers={"Authorization": f"Bearer {access_token}"},
            )
        except GraphApiError as exc:
            logger.warning(
                "meta oauth instagram webhook subscribe failed ig_user_id=%s status=%s code=%s",
                ig_user_id,
                exc.status_code,
                exc.graph_code,
            )

    def _subscribe_whatsapp_messages(self, waba_id: str, access_token: str) -> None:
        if not waba_id:
            logger.warning("meta oauth whatsapp webhook subscribe skipped missing_waba_id=1")
            return
        version = settings.meta_graph_api_version
        url = f"https://graph.facebook.com/{version}/{waba_id}/subscribed_apps"
        try:
            self._http.request(
                "POST",
                url,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            logger.info("meta oauth whatsapp webhook subscribed waba_id=%s", waba_id)
        except GraphApiError as exc:
            logger.warning(
                "meta oauth whatsapp webhook subscribe failed waba_id=%s status=%s code=%s",
                waba_id,
                exc.status_code,
                exc.graph_code,
            )

    def _lookup_waba_id(self, phone_number_id: str, access_token: str) -> str:
        payload = self._graph_get_optional(
            "me/whatsapp_business_accounts",
            access_token,
            {"fields": "id,phone_numbers{id}"},
        )
        for waba in payload.get("data") or []:
            if not isinstance(waba, dict):
                continue
            phones = (waba.get("phone_numbers") or {}).get("data") or []
            for phone in phones:
                if isinstance(phone, dict) and str(phone.get("id") or "") == phone_number_id:
                    return str(waba.get("id") or "")
        return ""

    def _facebook_app_secret(self) -> str:
        secret = settings.meta_app_secret
        if not settings.meta_app_id or secret is None:
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

    def _graph_get_optional(
        self,
        path: str,
        access_token: str,
        params: dict[str, Any] | None = None,
        *,
        host: str = "graph.facebook.com",
    ) -> dict:
        try:
            return self._graph_get(path, access_token, params, host=host)
        except GraphApiError as exc:
            logger.warning(
                "meta oauth graph GET failed path=%s status=%s code=%s",
                path.split("?")[0],
                exc.status_code,
                exc.graph_code,
            )
            return {}

    def _exchange_code(self, code: str, channel: Channel) -> str:
        try:
            if channel == "instagram":
                return self._exchange_instagram_code(code)
            app_secret = self._facebook_app_secret()
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
                raise InvalidOperationError(
                    _OAUTH_EXCHANGE_FAILED, "oauth", public_code="exchange_empty"
                )
            return str(token)
        except GraphApiError as exc:
            raise InvalidOperationError(
                _OAUTH_EXCHANGE_FAILED,
                "oauth",
                public_code="graph_failed",
                graph_status=exc.status_code,
                graph_code=exc.graph_code,
                graph_type=exc.graph_type,
                graph_message=exc.graph_message,
            ) from exc

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
            raise InvalidOperationError(
                _OAUTH_EXCHANGE_FAILED, "oauth", public_code="exchange_empty"
            )
        return str(token)

    def _to_long_lived_token(self, short_token: str, channel: Channel) -> str:
        try:
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
            app_secret = self._facebook_app_secret()
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
        except GraphApiError:
            logger.warning("meta oauth long-lived token exchange failed channel=%s", channel)
            return short_token

    def _discover_accounts(
        self, channel: Channel, access_token: str
    ) -> tuple[list[OauthCandidate], dict[str, str]]:
        try:
            if channel == "whatsapp":
                return self._discover_whatsapp(access_token)
            return self._discover_instagram(access_token)
        except GraphApiError as exc:
            raise InvalidOperationError(
                "No se encontró ninguna cuenta de Meta para este canal.",
                "channel",
                public_code="no_accounts",
                graph_status=exc.status_code,
                graph_code=exc.graph_code,
                graph_type=exc.graph_type,
                graph_message=exc.graph_message,
            ) from exc

    def _discover_whatsapp(self, access_token: str) -> tuple[list[OauthCandidate], dict[str, str]]:
        nested_fields = (
            f"id,name,owned_whatsapp_business_accounts{{{_WA_WABA_FIELDS}}},"
            f"client_whatsapp_business_accounts{{{_WA_WABA_FIELDS}}}"
        )
        try:
            payload = self._graph_get("me/businesses", access_token, {"fields": nested_fields})
        except GraphApiError as exc:
            logger.warning(
                "meta oauth: nested WABA expansion failed status=%s code=%s",
                exc.status_code,
                exc.graph_code,
            )
            payload = self._graph_get_optional("me/businesses", access_token, {"fields": "id,name"})

        candidates, tokens = self._collect_whatsapp_from_businesses(payload, access_token)
        if candidates:
            return candidates, tokens

        for business in payload.get("data") or []:
            business_id = str(business.get("id") or "")
            if not business_id:
                continue
            for edge in (
                "owned_whatsapp_business_accounts",
                "client_whatsapp_business_accounts",
            ):
                wabas = self._graph_get_optional(
                    f"{business_id}/{edge}",
                    access_token,
                    {"fields": _WA_WABA_FIELDS},
                )
                more, more_tokens = self._collect_whatsapp_from_wabas(
                    wabas.get("data") or [],
                    access_token,
                )
                candidates.extend(more)
                tokens.update(more_tokens)
        if candidates:
            return candidates, tokens

        wabas = self._graph_get_optional(
            "me/whatsapp_business_accounts",
            access_token,
            {"fields": _WA_WABA_FIELDS},
        )
        more, more_tokens = self._collect_whatsapp_from_wabas(
            wabas.get("data") or [],
            access_token,
        )
        candidates.extend(more)
        tokens.update(more_tokens)
        return candidates, tokens

    def _collect_whatsapp_from_businesses(
        self, payload: dict[str, Any], access_token: str
    ) -> tuple[list[OauthCandidate], dict[str, str]]:
        candidates: list[OauthCandidate] = []
        tokens: dict[str, str] = {}
        for business in payload.get("data") or []:
            for edge in (
                "owned_whatsapp_business_accounts",
                "client_whatsapp_business_accounts",
            ):
                wabas = (business.get(edge) or {}).get("data") or []
                more, more_tokens = self._collect_whatsapp_from_wabas(wabas, access_token)
                candidates.extend(more)
                tokens.update(more_tokens)
        return candidates, tokens

    def _collect_whatsapp_from_wabas(
        self, wabas: list[Any], access_token: str
    ) -> tuple[list[OauthCandidate], dict[str, str]]:
        candidates: list[OauthCandidate] = []
        tokens: dict[str, str] = {}
        for waba in wabas:
            if not isinstance(waba, dict):
                continue
            phones = (waba.get("phone_numbers") or {}).get("data") or []
            if not phones:
                waba_id = str(waba.get("id") or "")
                if waba_id:
                    listed = self._graph_get_optional(
                        f"{waba_id}/phone_numbers",
                        access_token,
                        {"fields": _WA_PHONE_FIELDS},
                    )
                    phones = listed.get("data") or []
            for phone in phones:
                if not isinstance(phone, dict):
                    continue
                phone_id = str(phone.get("id") or "")
                if not phone_id:
                    continue
                label = str(
                    phone.get("verified_name")
                    or phone.get("display_phone_number")
                    or waba.get("name")
                    or phone_id
                )
                phone_number = str(phone.get("display_phone_number") or "").strip()
                candidates.append(
                    OauthCandidate(
                        provider_account_id=phone_id,
                        display_name=label,
                        phone_number=phone_number,
                        waba_id=str(waba.get("id") or ""),
                    )
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
