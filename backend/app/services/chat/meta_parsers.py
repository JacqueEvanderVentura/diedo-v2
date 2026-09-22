from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal


@dataclass(frozen=True, slots=True)
class InboundTextMessage:
    channel: Literal["instagram", "whatsapp"]
    provider_account_id: str
    provider_thread_id: str
    participant_provider_id: str
    participant_display_name: str
    provider_message_id: str
    body_text: str
    sent_at: datetime | None


def _preview(text: str, limit: int = 280) -> str:
    normalized = text.replace("\n", " ").strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 1] + "…"


def _unix_to_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    try:
        seconds = float(value)
    except TypeError:
        return None
    except ValueError:
        return None
    if seconds > 1_000_000_000_000:
        seconds /= 1000.0
    return datetime.fromtimestamp(seconds, tz=UTC)


def parse_meta_webhook_payload(payload: dict[str, Any]) -> list[InboundTextMessage]:
    object_type = payload.get("object")
    if object_type == "whatsapp_business_account":
        return _parse_whatsapp(payload)
    if object_type in {"instagram", "page"}:
        return _parse_instagram(payload)
    return []


def _parse_whatsapp(payload: dict[str, Any]) -> list[InboundTextMessage]:
    events: list[InboundTextMessage] = []
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            if change.get("field") != "messages":
                continue
            value = change.get("value") or {}
            metadata = value.get("metadata") or {}
            phone_number_id = metadata.get("phone_number_id")
            if not phone_number_id:
                continue
            contacts = {
                str(contact.get("wa_id", "")): str((contact.get("profile") or {}).get("name") or "")
                for contact in value.get("contacts") or []
                if contact.get("wa_id")
            }
            for message in value.get("messages") or []:
                if message.get("type") != "text":
                    continue
                text_body = (message.get("text") or {}).get("body")
                if not isinstance(text_body, str) or not text_body.strip():
                    continue
                sender = str(message.get("from") or "")
                message_id = str(message.get("id") or "")
                if not sender or not message_id:
                    continue
                events.append(
                    InboundTextMessage(
                        channel="whatsapp",
                        provider_account_id=str(phone_number_id),
                        provider_thread_id=sender,
                        participant_provider_id=sender,
                        participant_display_name=contacts.get(sender, ""),
                        provider_message_id=message_id,
                        body_text=text_body.strip(),
                        sent_at=_unix_to_datetime(message.get("timestamp")),
                    )
                )
    return events


def _parse_instagram(payload: dict[str, Any]) -> list[InboundTextMessage]:
    events: list[InboundTextMessage] = []
    for entry in payload.get("entry") or []:
        page_or_ig_id = str(entry.get("id") or "")
        for messaging in entry.get("messaging") or []:
            message = messaging.get("message") or {}
            if message.get("is_echo"):
                continue
            text_body = message.get("text")
            if not isinstance(text_body, str) or not text_body.strip():
                continue
            sender = messaging.get("sender") or {}
            sender_id = str(sender.get("id") or "")
            message_id = str(message.get("mid") or "")
            if not sender_id or not message_id:
                continue
            recipient = messaging.get("recipient") or {}
            provider_account_id = str(recipient.get("id") or page_or_ig_id)
            if not provider_account_id:
                continue
            events.append(
                InboundTextMessage(
                    channel="instagram",
                    provider_account_id=provider_account_id,
                    provider_thread_id=sender_id,
                    participant_provider_id=sender_id,
                    participant_display_name="",
                    provider_message_id=message_id,
                    body_text=text_body.strip(),
                    sent_at=_unix_to_datetime(messaging.get("timestamp")),
                )
            )
    return events


def message_preview(text: str) -> str:
    return _preview(text)
