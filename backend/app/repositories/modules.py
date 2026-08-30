from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.db.models import ModuleDefinition, ModuleEntitlement, Permission


@dataclass(frozen=True)
class ModuleAccessRecord:
    code: str
    definition_status: str
    dependency_codes: tuple[str, ...]
    entitlement_status: str | None
    effective_from: datetime | None
    effective_until: datetime | None


class ModuleAccessRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_access_records(self, workspace_id: UUID) -> list[ModuleAccessRecord]:
        rows = self._session.execute(
            select(
                ModuleDefinition.code,
                ModuleDefinition.status,
                ModuleDefinition.dependency_codes,
                ModuleEntitlement.status,
                ModuleEntitlement.effective_from,
                ModuleEntitlement.effective_until,
            )
            .outerjoin(
                ModuleEntitlement,
                and_(
                    ModuleEntitlement.module_definition_id == ModuleDefinition.id,
                    ModuleEntitlement.workspace_id == workspace_id,
                ),
            )
            .order_by(ModuleDefinition.code)
        )
        return [
            ModuleAccessRecord(
                code=row[0],
                definition_status=row[1],
                dependency_codes=tuple(row[2] or ()),
                entitlement_status=row[3],
                effective_from=row[4],
                effective_until=row[5],
            )
            for row in rows
        ]

    def module_code_for_permission(self, permission_code: str) -> str | None:
        return self._session.scalar(
            select(Permission.module_code).where(
                Permission.code == permission_code,
                Permission.is_platform_only.is_(False),
            )
        )
