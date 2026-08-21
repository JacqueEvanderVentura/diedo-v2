from dataclasses import dataclass

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.models import (
    Branch,
    LegalEntity,
    ModuleDefinition,
    ModuleEntitlement,
    Workspace,
    WorkspaceMembership,
)


@dataclass(frozen=True)
class FoundationSnapshot:
    workspace_count: int
    legal_entity_count: int
    branch_count: int
    active_membership_count: int
    enabled_modules: list[str]


class FoundationRepository:
    """Read-only queries over the installed foundation schema."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def snapshot(self) -> FoundationSnapshot:
        enabled_modules = self._session.scalars(
            select(ModuleDefinition.code)
            .join(
                ModuleEntitlement,
                ModuleEntitlement.module_definition_id == ModuleDefinition.id,
            )
            .where(ModuleEntitlement.status == "enabled")
            .distinct()
            .order_by(ModuleDefinition.code)
        ).all()

        return FoundationSnapshot(
            workspace_count=self._count(Workspace),
            legal_entity_count=self._count(LegalEntity),
            branch_count=self._count(Branch),
            active_membership_count=self._count(
                WorkspaceMembership, WorkspaceMembership.status == "active"
            ),
            enabled_modules=list(enabled_modules),
        )

    def _count(
        self,
        model: type[Base],
        condition: ColumnElement[bool] | None = None,
    ) -> int:
        statement = select(func.count()).select_from(model)
        if condition is not None:
            statement = statement.where(condition)
        return self._session.execute(statement).scalar_one()
