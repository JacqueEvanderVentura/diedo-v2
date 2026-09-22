from uuid import uuid7

import pytest
from app.db.models import Branch, ChatChannelAccount, ChatChannelAccountBranch
from app.db.session import session_scope
from app.services.local_bootstrap import bootstrap_local_foundation
from sqlalchemy import func, select


@pytest.mark.integration
def test_chat_account_can_be_assigned_to_multiple_branches() -> None:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        branch_ids = session.scalars(
            select(Branch.id)
            .where(Branch.workspace_id == summary.workspace_id)
            .order_by(Branch.created_at)
            .limit(2)
        ).all()
        if len(branch_ids) < 2:
            second = Branch(
                workspace_id=summary.workspace_id,
                legal_entity_id=summary.legal_entity_id,
                code=str(uuid7()).replace("-", "")[:32],
                name="Sucursal prueba chat",
                timezone="America/Santo_Domingo",
            )
            session.add(second)
            session.flush()
            branch_ids = [summary.branch_id, second.id]

        account = ChatChannelAccount(
            workspace_id=summary.workspace_id,
            channel="whatsapp",
            provider_account_id=f"demo-phone-{uuid7()}",
            display_name="WA compartido",
            connection_status="disconnected",
        )
        session.add(account)
        session.flush()

        for branch_id in branch_ids[:2]:
            session.add(
                ChatChannelAccountBranch(
                    workspace_id=summary.workspace_id,
                    channel_account_id=account.id,
                    branch_id=branch_id,
                )
            )
        session.flush()

        count = session.scalar(
            select(func.count())
            .select_from(ChatChannelAccountBranch)
            .where(ChatChannelAccountBranch.channel_account_id == account.id)
        )
        assert count == 2


@pytest.mark.integration
def test_chat_permissions_and_module_installed() -> None:
    with session_scope() as session:
        bootstrap_local_foundation(session)
        from app.db.models import ModuleDefinition, Permission

        module = session.scalar(select(ModuleDefinition).where(ModuleDefinition.code == "chat"))
        assert module is not None
        assert module.status == "available"

        codes = session.scalars(
            select(Permission.code)
            .where(Permission.module_code == "chat")
            .order_by(Permission.code)
        ).all()
        assert list(codes) == ["chat.read", "chat.send"]
