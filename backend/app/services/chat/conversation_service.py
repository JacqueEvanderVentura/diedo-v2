from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models.chat import ChatMessage
from app.repositories.chat import (
    ChatRepository,
    ConversationListRecord,
    ConversationPage,
    MessagePage,
)
from app.services.authorization import PermissionGrant
from app.services.chat.graph_clients import InstagramMessagingClient, WhatsAppCloudClient
from app.services.chat.meta_parsers import message_preview
from app.services.errors import InvalidOperationError, ResourceNotFoundError

_MESSAGING_WINDOW = timedelta(hours=24)


class ChatService:
    def __init__(
        self,
        session: Session,
        *,
        whatsapp_client: WhatsAppCloudClient | None = None,
        instagram_client: InstagramMessagingClient | None = None,
    ) -> None:
        self._session = session
        self._repository = ChatRepository(session)
        self._whatsapp = whatsapp_client or WhatsAppCloudClient()
        self._instagram = instagram_client or InstagramMessagingClient()

    def list_conversations(
        self,
        *,
        grant: PermissionGrant,
        branch_id: UUID | None,
        channel: str | None,
        search: str | None,
        page: int,
        page_size: int,
    ) -> ConversationPage:
        self._require_visible_branch(grant, branch_id)
        account_ids = self._repository.list_visible_account_ids(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
        )
        normalized_search = self._normalize_optional_text(search)
        return self._repository.list_conversations(
            workspace_id=grant.workspace_id,
            account_ids=account_ids,
            channel=channel,
            search=normalized_search,
            page=page,
            page_size=page_size,
        )

    def list_messages(
        self,
        *,
        grant: PermissionGrant,
        conversation_id: UUID,
        page: int,
        page_size: int,
    ) -> MessagePage:
        record = self._require_visible_conversation(grant, conversation_id)
        return self._repository.list_messages(
            workspace_id=grant.workspace_id,
            conversation_id=record.conversation.id,
            page=page,
            page_size=page_size,
        )

    def send_message(
        self,
        *,
        grant: PermissionGrant,
        conversation_id: UUID,
        body: str,
    ) -> ChatMessage:
        record = self._require_visible_conversation(grant, conversation_id)
        conversation = record.conversation
        account = self._repository.get_channel_account(
            workspace_id=grant.workspace_id,
            account_id=conversation.channel_account_id,
        )
        if account is None:
            raise ResourceNotFoundError("La conversación no existe.", "conversationId")

        self._require_messaging_window(grant.workspace_id, conversation.id)
        token = account.access_token_ciphertext
        if account.connection_status != "connected" or not token:
            raise InvalidOperationError(
                "La cuenta de mensajería no está conectada.", "channelAccount"
            )

        recipient = conversation.participant_provider_id
        if record.channel == "whatsapp":
            provider_message_id = self._whatsapp.send_text(
                phone_number_id=account.provider_account_id,
                access_token=token,
                to=recipient,
                body=body,
            )
        elif record.channel == "instagram":
            provider_message_id = self._instagram.send_text(
                ig_user_id=account.provider_account_id,
                access_token=token,
                recipient_id=recipient,
                body=body,
            )
        else:
            raise InvalidOperationError("Canal de chat no soportado.", "channel")

        message = ChatMessage(
            workspace_id=grant.workspace_id,
            conversation_id=conversation.id,
            provider_message_id=provider_message_id,
            direction="outbound",
            body_text=body,
            delivery_status="sent",
        )
        self._session.add(message)
        conversation.last_message_at = datetime.now(UTC)
        conversation.last_message_preview = message_preview(body)
        conversation.version += 1
        self._session.flush()
        return message

    def messaging_window_open(self, workspace_id: UUID, conversation_id: UUID) -> bool:
        last_inbound = self._repository.last_inbound_at(
            workspace_id=workspace_id,
            conversation_id=conversation_id,
        )
        if last_inbound is None:
            return False
        return datetime.now(UTC) - last_inbound <= _MESSAGING_WINDOW

    def assigned_branch_ids(self, workspace_id: UUID, channel_account_id: UUID) -> list[UUID]:
        return self._repository.assigned_branch_ids(
            workspace_id=workspace_id,
            channel_account_id=channel_account_id,
        )

    def _require_visible_conversation(
        self,
        grant: PermissionGrant,
        conversation_id: UUID,
    ) -> ConversationListRecord:
        record = self._repository.get_conversation_with_channel(
            workspace_id=grant.workspace_id,
            conversation_id=conversation_id,
        )
        if record is None:
            raise ResourceNotFoundError("La conversación no existe.", "conversationId")

        assigned = self._repository.assigned_branch_ids(
            workspace_id=grant.workspace_id,
            channel_account_id=record.conversation.channel_account_id,
        )
        if not assigned:
            raise ResourceNotFoundError("La conversación no existe.", "conversationId")

        if grant.allowed_branch_ids is None:
            return record

        if not set(assigned).intersection(grant.allowed_branch_ids):
            raise ResourceNotFoundError("La conversación no existe.", "conversationId")
        return record

    def _require_messaging_window(self, workspace_id: UUID, conversation_id: UUID) -> None:
        if not self.messaging_window_open(workspace_id, conversation_id):
            raise InvalidOperationError(
                "La ventana de 24 horas para responder expiró o el cliente aún no ha escrito.",
                "messagingWindow",
            )

    @staticmethod
    def _require_visible_branch(grant: PermissionGrant, branch_id: UUID | None) -> None:
        if (
            branch_id is not None
            and grant.allowed_branch_ids is not None
            and branch_id not in grant.allowed_branch_ids
        ):
            raise ResourceNotFoundError(
                "La sucursal no existe o no está dentro de tu alcance.", "branchId"
            )

    @staticmethod
    def _normalize_optional_text(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        return normalized or None
