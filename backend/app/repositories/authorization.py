from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db.models import AccessScope, Branch, Permission, Role, RoleAssignment, RolePermission


@dataclass(frozen=True)
class PermissionScopeRecord:
    scope_type: str
    legal_entity_id: UUID | None
    branch_id: UUID | None


@dataclass(frozen=True)
class EffectivePermissionRecord(PermissionScopeRecord):
    permission_code: str


class AuthorizationRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def permission_scopes(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        permission_code: str,
    ) -> list[PermissionScopeRecord]:
        now = datetime.now(UTC)
        rows = self._session.execute(
            select(
                AccessScope.scope_type,
                AccessScope.legal_entity_id,
                AccessScope.branch_id,
            )
            .join(
                RoleAssignment,
                (RoleAssignment.workspace_id == AccessScope.workspace_id)
                & (RoleAssignment.access_scope_id == AccessScope.id),
            )
            .join(
                Role,
                (Role.workspace_id == RoleAssignment.workspace_id)
                & (Role.id == RoleAssignment.role_id),
            )
            .join(
                RolePermission,
                (RolePermission.workspace_id == RoleAssignment.workspace_id)
                & (RolePermission.role_id == RoleAssignment.role_id),
            )
            .join(Permission, Permission.id == RolePermission.permission_id)
            .where(
                RoleAssignment.workspace_id == workspace_id,
                RoleAssignment.membership_id == membership_id,
                RoleAssignment.status == "active",
                RoleAssignment.valid_from <= now,
                or_(RoleAssignment.valid_until.is_(None), RoleAssignment.valid_until >= now),
                Role.status == "active",
                Permission.code == permission_code,
                Permission.is_platform_only.is_(False),
            )
            .distinct()
        )
        return [PermissionScopeRecord(*row) for row in rows]

    def branch_ids_for_legal_entities(
        self,
        workspace_id: UUID,
        legal_entity_ids: set[UUID],
    ) -> set[UUID]:
        if not legal_entity_ids:
            return set()
        return set(
            self._session.scalars(
                select(Branch.id).where(
                    Branch.workspace_id == workspace_id,
                    Branch.legal_entity_id.in_(legal_entity_ids),
                )
            )
        )

    def effective_permission_records(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
    ) -> list[EffectivePermissionRecord]:
        now = datetime.now(UTC)
        rows = self._session.execute(
            select(
                AccessScope.scope_type,
                AccessScope.legal_entity_id,
                AccessScope.branch_id,
                Permission.code,
            )
            .join(
                RoleAssignment,
                (RoleAssignment.workspace_id == AccessScope.workspace_id)
                & (RoleAssignment.access_scope_id == AccessScope.id),
            )
            .join(
                Role,
                (Role.workspace_id == RoleAssignment.workspace_id)
                & (Role.id == RoleAssignment.role_id),
            )
            .join(
                RolePermission,
                (RolePermission.workspace_id == RoleAssignment.workspace_id)
                & (RolePermission.role_id == RoleAssignment.role_id),
            )
            .join(Permission, Permission.id == RolePermission.permission_id)
            .where(
                RoleAssignment.workspace_id == workspace_id,
                RoleAssignment.membership_id == membership_id,
                RoleAssignment.status == "active",
                RoleAssignment.valid_from <= now,
                or_(RoleAssignment.valid_until.is_(None), RoleAssignment.valid_until >= now),
                Role.status == "active",
                Permission.is_platform_only.is_(False),
            )
            .distinct()
        )
        return [
            EffectivePermissionRecord(
                permission_code=row.code,
                scope_type=row.scope_type,
                legal_entity_id=row.legal_entity_id,
                branch_id=row.branch_id,
            )
            for row in rows
        ]

    def branch_legal_entities(
        self,
        workspace_id: UUID,
        branch_ids: set[UUID],
    ) -> dict[UUID, UUID]:
        if not branch_ids:
            return {}
        rows = self._session.execute(
            select(Branch.id, Branch.legal_entity_id).where(
                Branch.workspace_id == workspace_id,
                Branch.id.in_(branch_ids),
            )
        )
        return {row[0]: row[1] for row in rows}
