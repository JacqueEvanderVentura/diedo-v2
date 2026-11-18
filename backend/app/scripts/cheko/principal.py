"""Build AuthPrincipal + grants for workspace import scripts."""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.identity import WorkspaceMembership
from app.services.auth import AuthPrincipal


def load_import_principal(
    session: Session,
    *,
    workspace_id: UUID,
    membership_id: UUID | None = None,
    platform_user_id: UUID | None = None,
) -> AuthPrincipal:
    if membership_id is not None:
        membership = session.scalar(
            select(WorkspaceMembership).where(
                WorkspaceMembership.id == membership_id,
                WorkspaceMembership.workspace_id == workspace_id,
            )
        )
    elif platform_user_id is not None:
        membership = session.scalar(
            select(WorkspaceMembership).where(
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.platform_user_id == platform_user_id,
                WorkspaceMembership.status == "active",
            )
        )
    else:
        membership = None
    if membership is None:
        raise RuntimeError("No se encontró membresía activa para importación.")
    return AuthPrincipal(
        platform_user_id=membership.platform_user_id,
        membership_id=membership.id,
        workspace_id=workspace_id,
        session_id=uuid4(),
        email="import-script@local",
        display_name="Cheko Import",
        is_platform_operator=False,
    )
