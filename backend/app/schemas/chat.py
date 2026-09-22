from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.common import ApiModel

ChatChannel = Literal["instagram", "whatsapp"]
ChatDirection = Literal["inbound", "outbound"]
ChatDeliveryStatus = Literal["received", "sent", "failed", "pending"]


class ChatConversationResponse(ApiModel):
    id: UUID
    channel_account_id: UUID
    channel: ChatChannel
    participant_provider_id: str
    participant_display_name: str
    last_message_at: datetime | None
    last_message_preview: str
    messaging_window_open: bool
    assigned_branch_ids: list[UUID]
    version: int


class PaginatedChatConversationsResponse(ApiModel):
    items: list[ChatConversationResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class ChatMessageResponse(ApiModel):
    id: UUID
    conversation_id: UUID
    direction: ChatDirection
    body_text: str
    delivery_status: ChatDeliveryStatus
    created_at: datetime


class PaginatedChatMessagesResponse(ApiModel):
    items: list[ChatMessageResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class SendChatMessageRequest(ApiModel):
    body: str = Field(min_length=1, max_length=4096)

    @field_validator("body")
    @classmethod
    def normalize_body(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("El mensaje no puede estar vacío.")
        return normalized


ChatConnectionStatus = Literal["disconnected", "connected", "error"]


class ChatChannelAccountResponse(ApiModel):
    id: UUID
    channel: ChatChannel
    provider_account_id: str
    display_name: str
    connection_status: ChatConnectionStatus
    assigned_branch_ids: list[UUID]
    version: int


class ChatChannelAccountListResponse(ApiModel):
    items: list[ChatChannelAccountResponse]


class UpdateChatChannelAccountBranchesRequest(ApiModel):
    branch_ids: list[UUID]


class ChatOauthStartRequest(ApiModel):
    channel: ChatChannel


class ChatOauthStartResponse(ApiModel):
    authorization_url: str


class ChatOauthCandidateResponse(ApiModel):
    provider_account_id: str
    display_name: str


class ChatOauthPendingResponse(ApiModel):
    channel: ChatChannel
    candidates: list[ChatOauthCandidateResponse]


class ChatOauthCompleteRequest(ApiModel):
    oauth_state_id: UUID
    provider_account_id: str
