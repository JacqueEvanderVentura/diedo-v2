from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ModuleDefinition, Permission, PlatformUser, Workspace, WorkspaceMembership


class WorkspaceProvisioningRepository:
    """Cross-workspace lookups needed by the platform provisioning use case."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def workspace_by_slug(self, slug: str) -> Workspace | None:
        return self._session.scalar(select(Workspace).where(Workspace.slug == slug))

    def platform_user_by_email(self, normalized_email: str) -> PlatformUser | None:
        return self._session.scalar(
            select(PlatformUser)
            .where(PlatformUser.normalized_email == normalized_email)
            .with_for_update()
        )

    def has_default_membership(self, platform_user_id: UUID) -> bool:
        return (
            self._session.scalar(
                select(WorkspaceMembership.id).where(
                    WorkspaceMembership.platform_user_id == platform_user_id,
                    WorkspaceMembership.is_default.is_(True),
                )
            )
            is not None
        )

    def available_modules(self) -> tuple[ModuleDefinition, ...]:
        return tuple(
            self._session.scalars(
                select(ModuleDefinition)
                .where(ModuleDefinition.status == "available")
                .order_by(ModuleDefinition.code)
            )
        )

    def assignable_permissions(self) -> tuple[Permission, ...]:
        return tuple(
            self._session.scalars(
                select(Permission)
                .where(Permission.is_platform_only.is_(False))
                .order_by(Permission.code)
            )
        )
