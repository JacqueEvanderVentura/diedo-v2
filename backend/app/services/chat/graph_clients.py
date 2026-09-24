from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

from app.config import settings

GraphRequestFn = Callable[..., dict[str, Any]]


class GraphApiError(Exception):
    """Graph HTTP failure without embedding tokens or response bodies."""

    def __init__(
        self,
        *,
        status_code: int | None,
        graph_code: int | str | None = None,
        graph_type: str | None = None,
        graph_message: str | None = None,
    ) -> None:
        self.status_code = status_code
        self.graph_code = graph_code
        self.graph_type = graph_type
        self.graph_message = graph_message
        super().__init__("graph_request_failed")


def _graph_error_fields(payload: object) -> tuple[int | str | None, str | None, str | None]:
    if not isinstance(payload, dict):
        return None, None, None
    error = payload.get("error")
    if isinstance(error, str):
        return None, None, error.replace("?", " ")[:160]
    if not isinstance(error, dict):
        return None, None, None
    code = error.get("code")
    error_type = error.get("type")
    message = error.get("message")
    safe_type = str(error_type)[:40] if isinstance(error_type, str) else None
    safe_message = None
    if isinstance(message, str):
        safe_message = message.replace("?", " ")[:160]
    return code, safe_type, safe_message


class GraphHttpClient(Protocol):
    def request(self, method: str, url: str, **kwargs: Any) -> dict[str, Any]: ...


class _HttpxGraphClient:
    def request(self, method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        import httpx

        timeout = kwargs.pop("timeout", 30.0)
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.request(method, url, **kwargs)
        except httpx.RequestError as exc:
            raise GraphApiError(status_code=None) from exc
        if response.status_code >= 400:
            graph_code, graph_type, graph_message = None, None, None
            try:
                graph_code, graph_type, graph_message = _graph_error_fields(response.json())
            except ValueError, TypeError:
                graph_code, graph_type, graph_message = None, None, None
            raise GraphApiError(
                status_code=response.status_code,
                graph_code=graph_code,
                graph_type=graph_type,
                graph_message=graph_message,
            )
        payload = response.json()
        if not isinstance(payload, dict):
            raise TypeError("Graph API response must be a JSON object.")
        return payload


def _default_graph_client() -> GraphHttpClient:
    return _HttpxGraphClient()


class WhatsAppCloudClient:
    def __init__(
        self,
        *,
        graph_api_version: str | None = None,
        http_client: GraphHttpClient | None = None,
    ) -> None:
        self._version = graph_api_version or settings.meta_graph_api_version
        self._http = http_client or _default_graph_client()

    def send_text(
        self,
        *,
        phone_number_id: str,
        access_token: str,
        to: str,
        body: str,
    ) -> str:
        url = f"https://graph.facebook.com/{self._version}/{phone_number_id}/messages"
        payload = self._http.request(
            "POST",
            url,
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "messaging_product": "whatsapp",
                "to": to,
                "type": "text",
                "text": {"body": body},
            },
        )
        messages = payload.get("messages") or []
        if not messages:
            raise ValueError("WhatsApp send response did not include message ids.")
        message_id = messages[0].get("id")
        if not message_id:
            raise ValueError("WhatsApp send response message id is missing.")
        return str(message_id)


@dataclass(frozen=True, slots=True)
class InstagramUserProfile:
    name: str
    username: str


class InstagramMessagingClient:
    def __init__(
        self,
        *,
        graph_api_version: str | None = None,
        http_client: GraphHttpClient | None = None,
    ) -> None:
        self._version = graph_api_version or settings.meta_graph_api_version
        self._http = http_client or _default_graph_client()

    def send_text(
        self,
        *,
        ig_user_id: str,
        access_token: str,
        recipient_id: str,
        body: str,
    ) -> str:
        url = f"https://graph.instagram.com/{self._version}/{ig_user_id}/messages"
        payload = self._http.request(
            "POST",
            url,
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "recipient": {"id": recipient_id},
                "message": {"text": body},
            },
        )
        message_id = payload.get("message_id")
        if not message_id:
            raise ValueError("Instagram send response message_id is missing.")
        return str(message_id)

    def fetch_user_profile(self, *, igsid: str, access_token: str) -> InstagramUserProfile:
        url = f"https://graph.instagram.com/{self._version}/{igsid}"
        payload = self._http.request(
            "GET",
            url,
            headers={"Authorization": f"Bearer {access_token}"},
            params={"fields": "name,username"},
        )
        name = str(payload.get("name") or "").strip()
        username = str(payload.get("username") or "").strip().lstrip("@")
        return InstagramUserProfile(name=name, username=username)
