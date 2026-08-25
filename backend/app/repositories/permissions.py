from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db.models import AuditEntry, ModuleDefinition, Permission, Role, RolePermission


@dataclass(frozen=True)
class RoleRecord:
    id: UUID
    code: str
    name: str
    version: int
    is_system: bool
    permission_count: int = 0


@dataclass(frozen=True)
class PermissionRecord:
    id: UUID
    code: str
    module_code: str
    module_name: str
    action: str
    name: str
    description: str
    sort_order: int
    granted_role_ids: tuple[UUID, ...]


class PermissionsRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_roles(self, workspace_id: UUID) -> list[RoleRecord]:
        permission_counts = (
            select(
                RolePermission.role_id,
                func.count(RolePermission.permission_id).label("count"),
            )
            .join(Permission, Permission.id == RolePermission.permission_id)
            .join(ModuleDefinition, ModuleDefinition.code == Permission.module_code)
            .where(RolePermission.workspace_id == workspace_id)
            .where(
                Permission.is_platform_only.is_(False),
                ModuleDefinition.status != "deprecated",
            )
            .group_by(RolePermission.role_id)
            .subquery()
        )
        rows = self._session.execute(
            select(
                Role.id,
                Role.code,
                Role.name,
                Role.version,
                Role.is_system,
                func.coalesce(permission_counts.c.count, 0),
            )
            .outerjoin(permission_counts, permission_counts.c.role_id == Role.id)
            .where(Role.workspace_id == workspace_id, Role.status == "active")
            .order_by(Role.is_system.desc(), Role.name, Role.id)
        )
        return [RoleRecord(*row) for row in rows]

    def count_available_permissions(self) -> int:
        return (
            self._session.scalar(
                select(func.count(Permission.id))
                .join(ModuleDefinition, ModuleDefinition.code == Permission.module_code)
                .where(
                    Permission.is_platform_only.is_(False),
                    ModuleDefinition.status != "deprecated",
                )
            )
            or 0
        )

    def list_permissions(
        self,
        workspace_id: UUID,
        active_role_ids: set[UUID],
    ) -> list[PermissionRecord]:
        rows = self._session.execute(
            select(
                Permission.id,
                Permission.code,
                Permission.module_code,
                ModuleDefinition.name,
                Permission.action,
                Permission.name,
                Permission.description,
                Permission.sort_order,
                RolePermission.role_id,
            )
            .join(ModuleDefinition, ModuleDefinition.code == Permission.module_code)
            .outerjoin(
                RolePermission,
                (RolePermission.permission_id == Permission.id)
                & (RolePermission.workspace_id == workspace_id),
            )
            .where(
                Permission.is_platform_only.is_(False),
                ModuleDefinition.status != "deprecated",
            )
            .order_by(
                ModuleDefinition.name,
                Permission.sort_order,
                Permission.name,
                Permission.id,
            )
        ).all()
        grouped: dict[UUID, PermissionRecord] = {}
        grants: dict[UUID, set[UUID]] = {}
        for row in rows:
            if row[0] not in grouped:
                grouped[row[0]] = PermissionRecord(
                    id=row[0],
                    code=row[1],
                    module_code=row[2],
                    module_name=row[3],
                    action=row[4],
                    name=row[5],
                    description=row[6],
                    sort_order=row[7],
                    granted_role_ids=(),
                )
                grants[row[0]] = set()
            if row[8] in active_role_ids:
                grants[row[0]].add(row[8])
        return [
            PermissionRecord(
                id=record.id,
                code=record.code,
                module_code=record.module_code,
                module_name=record.module_name,
                action=record.action,
                name=record.name,
                description=record.description,
                sort_order=record.sort_order,
                granted_role_ids=tuple(sorted(grants[record.id])),
            )
            for record in grouped.values()
        ]

    def get_role_for_update(self, workspace_id: UUID, role_id: UUID) -> Role | None:
        return self._session.scalar(
            select(Role)
            .where(
                Role.workspace_id == workspace_id,
                Role.id == role_id,
                Role.status == "active",
            )
            .with_for_update()
        )

    def permissions_by_ids(self, permission_ids: set[UUID]) -> dict[UUID, str]:
        if not permission_ids:
            return {}
        rows = self._session.execute(
            select(Permission.id, Permission.code).where(
                Permission.id.in_(permission_ids),
                Permission.is_platform_only.is_(False),
            )
        )
        return {row[0]: row[1] for row in rows}

    def replace_role_permissions(
        self,
        *,
        role: Role,
        permission_ids: set[UUID],
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> RoleRecord:
        self._session.execute(
            delete(RolePermission).where(
                RolePermission.workspace_id == role.workspace_id,
                RolePermission.role_id == role.id,
            )
        )
        self._session.add_all(
            RolePermission(
                workspace_id=role.workspace_id,
                role_id=role.id,
                permission_id=permission_id,
            )
            for permission_id in sorted(permission_ids)
        )
        role.version += 1
        self._session.add(
            AuditEntry(
                workspace_id=role.workspace_id,
                actor_platform_user_id=actor_platform_user_id,
                action="role.permissions.replace",
                target_type="role",
                target_id=role.id,
                outcome="success",
                request_id=request_id or None,
                details={
                    "permissionIds": [
                        str(permission_id) for permission_id in sorted(permission_ids)
                    ],
                    "version": role.version,
                },
            )
        )
        self._session.flush()
        return RoleRecord(
            id=role.id,
            code=role.code,
            name=role.name,
            version=role.version,
            is_system=role.is_system,
            permission_count=len(permission_ids),
        )
