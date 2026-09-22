from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models.chat import ChatChannelAccount, ChatChannelAccountBranch
from app.repositories.chat import ChatRepository
from app.services.authorization import PermissionGrant
from app.services.errors import InvalidOperationError, ResourceNotFoundError


class ChatChannelAccountService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = ChatRepository(session)

    def list_accounts(self, grant: PermissionGrant) -> list[ChatChannelAccount]:
        return list(
            self._session.scalars(
                select(ChatChannelAccount)
                .where(ChatChannelAccount.workspace_id == grant.workspace_id)
                .order_by(ChatChannelAccount.channel, ChatChannelAccount.display_name)
            ).all()
        )

    def assigned_branch_ids(self, grant: PermissionGrant, account_id: UUID) -> list[UUID]:
        account = self._require_account(grant, account_id)
        return self._repository.assigned_branch_ids(
            workspace_id=account.workspace_id,
            channel_account_id=account.id,
        )

    def update_branch_assignments(
        self,
        grant: PermissionGrant,
        account_id: UUID,
        branch_ids: list[UUID],
    ) -> list[UUID]:
        account = self._require_account(grant, account_id)
        if account.connection_status != "connected":
            raise InvalidOperationError(
                "Conecta la cuenta antes de asignar sucursales.",
                "channelAccount",
            )
        unique_ids = list(dict.fromkeys(branch_ids))
        self._session.execute(
            delete(ChatChannelAccountBranch).where(
                ChatChannelAccountBranch.workspace_id == grant.workspace_id,
                ChatChannelAccountBranch.channel_account_id == account.id,
            )
        )
        for branch_id in unique_ids:
            self._session.add(
                ChatChannelAccountBranch(
                    workspace_id=grant.workspace_id,
                    channel_account_id=account.id,
                    branch_id=branch_id,
                )
            )
        self._session.flush()
        return self._repository.assigned_branch_ids(
            workspace_id=grant.workspace_id,
            channel_account_id=account.id,
        )

    def get_account(self, grant: PermissionGrant, account_id: UUID) -> ChatChannelAccount:
        return self._require_account(grant, account_id)

    def disconnect(self, grant: PermissionGrant, account_id: UUID) -> ChatChannelAccount:
        account = self._require_account(grant, account_id)
        account.connection_status = "disconnected"
        account.access_token_ciphertext = None
        account.token_expires_at = None
        self._session.flush()
        return account

    def _require_account(self, grant: PermissionGrant, account_id: UUID) -> ChatChannelAccount:
        account = self._repository.get_channel_account(
            workspace_id=grant.workspace_id,
            account_id=account_id,
        )
        if account is None:
            raise ResourceNotFoundError("La cuenta de chat no existe.", "channelAccountId")
        return account
