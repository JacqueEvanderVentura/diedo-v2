from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.repositories.permissions import PermissionRecord, PermissionsRepository, RoleRecord
from app.services.auth import AuthPrincipal
from app.services.authorization import AuthorizationService, PermissionGrant
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    ResourceNotFoundError,
)
from app.services.modules import ModuleAccessService


@dataclass(frozen=True)
class PermissionModule:
    code: str
    name: str
    enabled: bool
    permissions: tuple[PermissionRecord, ...]


@dataclass(frozen=True)
class PermissionMatrix:
    roles: tuple[RoleRecord, ...]
    modules: tuple[PermissionModule, ...]
    total_permissions: int


@dataclass(frozen=True)
class RolePermissionSummary:
    roles: tuple[RoleRecord, ...]
    total_permissions: int


@dataclass(frozen=True)
class RolePermissionReplacement:
    role_id: UUID
    permission_ids: frozenset[UUID]
    expected_version: int


class PermissionsService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = PermissionsRepository(session)

    def list_roles(self, workspace_id: UUID) -> tuple[RoleRecord, ...]:
        return tuple(self._repository.list_roles(workspace_id))

    def role_summary(self, workspace_id: UUID) -> RolePermissionSummary:
        return RolePermissionSummary(
            roles=tuple(self._repository.list_roles(workspace_id)),
            total_permissions=self._repository.count_available_permissions(),
        )

    def matrix(self, workspace_id: UUID) -> PermissionMatrix:
        roles = tuple(self._repository.list_roles(workspace_id))
        enabled_modules = ModuleAccessService(self._session).enabled_modules(workspace_id)
        permissions = self._repository.list_permissions(
            workspace_id,
            {role.id for role in roles},
        )
        grouped: dict[tuple[str, str], list[PermissionRecord]] = {}
        for permission in permissions:
            grouped.setdefault(
                (permission.module_code, permission.module_name),
                [],
            ).append(permission)
        modules = tuple(
            PermissionModule(
                code=key[0],
                name=key[1],
                enabled=key[0] in enabled_modules,
                permissions=tuple(items),
            )
            for key, items in grouped.items()
        )
        return PermissionMatrix(
            roles=roles,
            modules=modules,
            total_permissions=len(permissions),
        )

    def replace_role_permissions(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        role_id: UUID,
        permission_ids: list[UUID],
        expected_version: int,
    ) -> RoleRecord:
        return self.replace_role_permissions_batch(
            principal=principal,
            grant=grant,
            replacements=[
                RolePermissionReplacement(
                    role_id=role_id,
                    permission_ids=frozenset(permission_ids),
                    expected_version=expected_version,
                )
            ],
        )[0]

    def replace_role_permissions_batch(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        replacements: list[RolePermissionReplacement],
    ) -> tuple[RoleRecord, ...]:
        if not grant.workspace_wide:
            raise AuthorizationError(
                "Gestionar permisos de roles requiere alcance sobre todo el workspace."
            )
        if not replacements:
            raise ConflictError("Selecciona al menos un rol.", "roles")
        role_ids = {replacement.role_id for replacement in replacements}
        if len(role_ids) != len(replacements):
            raise ConflictError("No repitas roles.", "roles")
        if any(len(replacement.permission_ids) > 500 for replacement in replacements):
            raise ConflictError("Un rol contiene demasiados permisos.", "permissionIds")

        roles = self._repository.get_roles_for_update(principal.workspace_id, role_ids)
        roles_by_id = {role.id: role for role in roles}
        if len(roles_by_id) != len(role_ids):
            raise ResourceNotFoundError("Uno o más roles no existen.", "roleId")

        replacements_by_id = {replacement.role_id: replacement for replacement in replacements}
        for role_id in sorted(role_ids):
            role = roles_by_id[role_id]
            if role.version != replacements_by_id[role_id].expected_version:
                raise ConflictError(
                    "Un rol cambió; vuelve a cargar la matriz antes de guardar.",
                    "version",
                )

        requested_ids = {
            permission_id
            for replacement in replacements
            for permission_id in replacement.permission_ids
        }
        requested_permissions = self._repository.permissions_by_ids(requested_ids)
        if len(requested_permissions) != len(requested_ids):
            raise ResourceNotFoundError(
                "Uno o más permisos no existen.",
                "permissionIds",
            )
        required_admin_permissions = {
            "membership.read",
            "membership.manage",
            "role.read",
            "role.manage",
        }
        actor_permissions = AuthorizationService(self._session).assigned_permission_codes_for_scope(
            principal,
            scope_type="workspace",
        )
        for role_id in sorted(role_ids):
            role = roles_by_id[role_id]
            replacement = replacements_by_id[role_id]
            requested_codes = {
                requested_permissions[permission_id] for permission_id in replacement.permission_ids
            }
            if role.code == "workspace_admin" and not required_admin_permissions.issubset(
                requested_codes
            ):
                raise ConflictError(
                    "El rol Administrador debe conservar los permisos básicos de usuarios y roles.",
                    "permissionIds",
                )
            if not requested_codes.issubset(actor_permissions):
                raise AuthorizationError("No puedes conceder permisos que tú no posees.")

        try:
            request_id = get_request_id()
            results_by_id = {
                role_id: self._repository.replace_role_permissions(
                    role=roles_by_id[role_id],
                    permission_ids=set(replacements_by_id[role_id].permission_ids),
                    actor_platform_user_id=principal.platform_user_id,
                    request_id=request_id,
                )
                for role_id in sorted(role_ids)
            }
            self._session.commit()
            return tuple(results_by_id[item.role_id] for item in replacements)
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudieron actualizar los permisos de los roles.") from exc
