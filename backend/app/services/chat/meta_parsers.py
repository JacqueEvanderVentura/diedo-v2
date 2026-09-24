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
    participant_username: str
    provider_message_id: str
    body_text: str
    sent_at: datetime | None
    direction: Literal["inbound", "outbound"]


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


def _wa_digits(value: str) -> str:
    return "".join(character for character in value if character.isdigit())


def _whatsapp_text_event(
    message: dict[str, Any],
    *,
    phone_number_id: str,
    display_phone_number: str,
    contacts: dict[str, str],
    prefer_outbound: bool,
) -> InboundTextMessage | None:
    if message.get("type") != "text":
        return None
    text_body = (message.get("text") or {}).get("body")
    if not isinstance(text_body, str) or not text_body.strip():
        return None
    sender = str(message.get("from") or "")
    recipient = str(message.get("to") or "")
    message_id = str(message.get("id") or "")
    if not message_id:
        return None

    business_digits = _wa_digits(display_phone_number)
    sender_is_business = bool(business_digits) and _wa_digits(sender) == business_digits
    outbound = prefer_outbound or sender_is_business
    if outbound:
        participant = recipient
        direction: Literal["inbound", "outbound"] = "outbound"
    else:
        participant = sender
        direction = "inbound"
    if not participant:
        return None

    return InboundTextMessage(
        channel="whatsapp",
        provider_account_id=str(phone_number_id),
        provider_thread_id=participant,
        participant_provider_id=participant,
        participant_display_name=contacts.get(participant, ""),
        participant_username="",
        provider_message_id=message_id,
        body_text=text_body.strip(),
        sent_at=_unix_to_datetime(message.get("timestamp")),
        direction=direction,
    )


def _parse_whatsapp(payload: dict[str, Any]) -> list[InboundTextMessage]:
    events: list[InboundTextMessage] = []
    for entry in payload.get("entry") or []:
        if not isinstance(entry, dict):
            continue
        for change in entry.get("changes") or []:
            if not isinstance(change, dict):
                continue
            field = str(change.get("field") or "")
            value = change.get("value") or {}
            if not isinstance(value, dict):
                continue
            raw_metadata = value.get("metadata")
            metadata = raw_metadata if isinstance(raw_metadata, dict) else {}
            phone_number_id = metadata.get("phone_number_id")
            if not phone_number_id:
                continue
            display_phone = str(metadata.get("display_phone_number") or "")
            contacts = {
                str(contact.get("wa_id", "")): str((contact.get("profile") or {}).get("name") or "")
                for contact in value.get("contacts") or []
                if isinstance(contact, dict) and contact.get("wa_id")
            }
            if field == "smb_message_echoes":
                raw_messages = value.get("message_echoes") or value.get("smb_message_echoes") or []
                prefer_outbound = True
            elif field == "messages":
                raw_messages = value.get("messages") or []
                prefer_outbound = False
            else:
                continue
            if not isinstance(raw_messages, list):
                continue
            for message in raw_messages:
                if not isinstance(message, dict):
                    continue
                event = _whatsapp_text_event(
                    message,
                    phone_number_id=str(phone_number_id),
                    display_phone_number=display_phone,
                    contacts=contacts,
                    prefer_outbound=prefer_outbound,
                )
                if event is not None:
                    events.append(event)
    return events


def _instagram_party_username(party: dict[str, Any]) -> str:
    raw = party.get("username")
    if not isinstance(raw, str):
        return ""
    return raw.strip().lstrip("@")


def _instagram_party_name(party: dict[str, Any]) -> str:
    raw = party.get("name")
    if not isinstance(raw, str):
        return ""
    return raw.strip()


def _instagram_text_event(
    messaging: dict[str, Any],
    *,
    fallback_account_id: str,
) -> InboundTextMessage | None:
    message = messaging.get("message") or {}
    text_body = message.get("text")
    if not isinstance(text_body, str) or not text_body.strip():
        return None
    sender = messaging.get("sender") or {}
    recipient = messaging.get("recipient") or {}
    sender_id = str(sender.get("id") or "")
    recipient_id = str(recipient.get("id") or "")
    message_id = str(message.get("mid") or "")
    if not sender_id or not message_id:
        return None

    is_echo = bool(message.get("is_echo"))
    is_self = bool(message.get("is_self") or messaging.get("is_self"))
    # Echo of a DM the professional account sent from Instagram itself.
    if is_echo and not is_self:
        provider_account_id = sender_id
        participant_id = recipient_id
        direction: Literal["inbound", "outbound"] = "outbound"
        display_name = _instagram_party_name(recipient)
        username = _instagram_party_username(recipient)
    else:
        provider_account_id = recipient_id or fallback_account_id
        participant_id = sender_id
        direction = "inbound"
        display_name = _instagram_party_name(sender)
        username = _instagram_party_username(sender)

    if not provider_account_id or not participant_id:
        return None
    return InboundTextMessage(
        channel="instagram",
        provider_account_id=provider_account_id,
        provider_thread_id=participant_id,
        participant_provider_id=participant_id,
        participant_display_name=display_name,
        participant_username=username,
        provider_message_id=message_id,
        body_text=text_body.strip(),
        sent_at=_unix_to_datetime(messaging.get("timestamp")),
        direction=direction,
    )


def _parse_instagram(payload: dict[str, Any]) -> list[InboundTextMessage]:
    events: list[InboundTextMessage] = []
    for entry in payload.get("entry") or []:
        if not isinstance(entry, dict):
            continue
        page_or_ig_id = str(entry.get("id") or "")
        for messaging in entry.get("messaging") or []:
            if not isinstance(messaging, dict):
                continue
            event = _instagram_text_event(messaging, fallback_account_id=page_or_ig_id)
            if event is not None:
                events.append(event)
        for change in entry.get("changes") or []:
            if not isinstance(change, dict) or change.get("field") != "messages":
                continue
            value = change.get("value")
            if not isinstance(value, dict):
                continue
            event = _instagram_text_event(value, fallback_account_id=page_or_ig_id)
            if event is not None:
                events.append(event)
    return events


def message_preview(text: str) -> str:
    return _preview(text)


def whatsapp_webhook_shape(payload: dict[str, Any]) -> str:
    """Short, non-sensitive description used when nothing was stored."""
    entries = payload.get("entry")
    if not isinstance(entries, list) or not entries:
        return "no_entry"
    parts: list[str] = []
    for entry in entries[:3]:
        if not isinstance(entry, dict):
            parts.append("entry_not_object")
            continue
        changes = entry.get("changes")
        fields: list[str] = []
        message_count = 0
        echo_count = 0
        status_count = 0
        if isinstance(changes, list):
            for change in changes[:5]:
                if not isinstance(change, dict):
                    continue
                fields.append(str(change.get("field") or "?"))
                value = change.get("value")
                if not isinstance(value, dict):
                    continue
                messages = value.get("messages")
                echoes = value.get("message_echoes") or value.get("smb_message_echoes")
                statuses = value.get("statuses")
                if isinstance(messages, list):
                    message_count += len(messages)
                if isinstance(echoes, list):
                    echo_count += len(echoes)
                if isinstance(statuses, list):
                    status_count += len(statuses)
        parts.append(
            f"changes={','.join(fields) or '0'} messages={message_count} "
            f"echoes={echo_count} statuses={status_count}"
        )
    return " ".join(parts)


def instagram_webhook_shape(payload: dict[str, Any]) -> str:
    """Short, non-sensitive description used when nothing was stored."""
    entries = payload.get("entry")
    if not isinstance(entries, list) or not entries:
        return "no_entry"
    parts: list[str] = []
    for entry in entries[:3]:
        if not isinstance(entry, dict):
            parts.append("entry_not_object")
            continue
        messaging = entry.get("messaging")
        changes = entry.get("changes")
        messaging_count = len(messaging) if isinstance(messaging, list) else 0
        change_fields: list[str] = []
        if isinstance(changes, list):
            for change in changes[:5]:
                if isinstance(change, dict):
                    change_fields.append(str(change.get("field") or "?"))
        parts.append(f"messaging={messaging_count} changes={','.join(change_fields) or '0'}")
    return " ".join(parts)
