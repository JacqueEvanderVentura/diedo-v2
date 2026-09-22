from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Query, Response, status

from app.api.deps import ChatReadGrant, ChatSendGrant, DatabaseSession
from app.db.models.chat import ChatMessage
from app.repositories.chat import ConversationListRecord
from app.schemas.chat import (
    ChatChannel,
    ChatConversationResponse,
    ChatDeliveryStatus,
    ChatDirection,
    ChatMessageResponse,
    PaginatedChatConversationsResponse,
    PaginatedChatMessagesResponse,
    SendChatMessageRequest,
)
from app.schemas.common import ErrorResponse
from app.services.chat.conversation_service import ChatService
from app.services.incidents import page_count

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


def _conversation_response(
    service: ChatService, record: ConversationListRecord
) -> ChatConversationResponse:
    conversation = record.conversation
    return ChatConversationResponse(
        id=conversation.id,
        channel_account_id=conversation.channel_account_id,
        channel=cast(ChatChannel, record.channel),
        participant_provider_id=conversation.participant_provider_id,
        participant_display_name=conversation.participant_display_name,
        last_message_at=conversation.last_message_at,
        last_message_preview=conversation.last_message_preview,
        messaging_window_open=service.messaging_window_open(
            conversation.workspace_id,
            conversation.id,
        ),
        assigned_branch_ids=service.assigned_branch_ids(
            conversation.workspace_id,
            conversation.channel_account_id,
        ),
        version=conversation.version,
    )


def _message_response(message: ChatMessage) -> ChatMessageResponse:
    return ChatMessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        direction=cast(ChatDirection, message.direction),
        body_text=message.body_text,
        delivery_status=cast(ChatDeliveryStatus, message.delivery_status),
        created_at=message.created_at,
    )


@router.get(
    "/conversations",
    responses={**_SECURITY_RESPONSES, 404: {"model": ErrorResponse}},
)
def list_conversations(
    response: Response,
    database: DatabaseSession,
    grant: ChatReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    channel: ChatChannel | None = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 50,
) -> PaginatedChatConversationsResponse:
    response.headers["Cache-Control"] = "no-store"
    service = ChatService(database)
    result = service.list_conversations(
        grant=grant,
        branch_id=branch_id,
        channel=channel,
        search=search,
        page=page,
        page_size=page_size,
    )
    return PaginatedChatConversationsResponse(
        items=[_conversation_response(service, item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=page_count(result.total_items, page_size),
    )


@router.get(
    "/conversations/{conversation_id}/messages",
    responses=_SECURITY_RESPONSES,
)
def list_messages(
    response: Response,
    database: DatabaseSession,
    grant: ChatReadGrant,
    conversation_id: UUID,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 50,
) -> PaginatedChatMessagesResponse:
    response.headers["Cache-Control"] = "no-store"
    service = ChatService(database)
    result = service.list_messages(
        grant=grant,
        conversation_id=conversation_id,
        page=page,
        page_size=page_size,
    )
    return PaginatedChatMessagesResponse(
        items=[_message_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=page_count(result.total_items, page_size),
    )


@router.post(
    "/conversations/{conversation_id}/messages",
    status_code=status.HTTP_201_CREATED,
    responses=_WRITE_RESPONSES,
)
def send_message(
    conversation_id: UUID,
    payload: SendChatMessageRequest,
    database: DatabaseSession,
    grant: ChatSendGrant,
) -> ChatMessageResponse:
    service = ChatService(database)
    message = service.send_message(
        grant=grant,
        conversation_id=conversation_id,
        body=payload.body,
    )
    database.commit()
    return _message_response(message)
