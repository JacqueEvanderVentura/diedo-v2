from __future__ import annotations

from collections.abc import Callable
from typing import Any, Protocol

from app.config import settings

GraphRequestFn = Callable[..., dict[str, Any]]


class GraphHttpClient(Protocol):
    def request(self, method: str, url: str, **kwargs: Any) -> dict[str, Any]: ...


class _HttpxGraphClient:
    def request(self, method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        import httpx

        timeout = kwargs.pop("timeout", 30.0)
        with httpx.Client(timeout=timeout) as client:
            response = client.request(method, url, **kwargs)
            response.raise_for_status()
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
        url = f"https://graph.facebook.com/{self._version}/{ig_user_id}/messages"
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
