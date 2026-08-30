from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy.orm import Session

from app.repositories.authorization import AuthorizationRepository
from app.services.errors import AuthorizationError
from app.services.modules import ModuleAccessService

if TYPE_CHECKING:
    from app.services.auth import AuthPrincipal


@dataclass(frozen=True)
class PermissionGrant:
    permission_code: str
    workspace_id: UUID
    membership_id: UUID
    allowed_legal_entity_ids: frozenset[UUID] | None
    allowed_branch_ids: frozenset[UUID] | None

    @property
    def workspace_wide(self) -> bool:
        return self.allowed_branch_ids is None


@dataclass(frozen=True)
class EffectiveScope:
    workspace_wide: bool
    legal_entity_ids: frozenset[UUID]
    branch_ids: frozenset[UUID]


class AuthorizationService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = AuthorizationRepository(session)
        self._module_access = ModuleAccessService(session)

    def require_permission(
        self,
        principal: AuthPrincipal,
        permission_code: str,
    ) -> PermissionGrant:
        module_code = self._module_access.module_for_permission(permission_code)
        if module_code is None:
            raise AuthorizationError("No tienes permiso para realizar esta acción.")
        self._module_access.require_module(principal.workspace_id, module_code)
        scopes = self._repository.permission_scopes(
            workspace_id=principal.workspace_id,
            membership_id=principal.membership_id,
            permission_code=permission_code,
        )
        if not scopes:
            raise AuthorizationError("No tienes permiso para realizar esta acción.")
        if any(scope.scope_type == "workspace" for scope in scopes):
            allowed_legal_entity_ids: frozenset[UUID] | None = None
            allowed_branch_ids: frozenset[UUID] | None = None
        else:
            branch_ids = {
                scope.branch_id
                for scope in scopes
                if scope.scope_type == "branch" and scope.branch_id is not None
            }
            legal_entity_ids = {
                scope.legal_entity_id
                for scope in scopes
                if scope.scope_type == "legal_entity" and scope.legal_entity_id is not None
            }
            allowed_legal_entity_ids = frozenset(legal_entity_ids)
            branch_ids.update(
                self._repository.branch_ids_for_legal_entities(
                    principal.workspace_id,
                    legal_entity_ids,
                )
            )
            allowed_branch_ids = frozenset(branch_ids)
        return PermissionGrant(
            permission_code=permission_code,
            workspace_id=principal.workspace_id,
            membership_id=principal.membership_id,
            allowed_legal_entity_ids=allowed_legal_entity_ids,
            allowed_branch_ids=allowed_branch_ids,
        )

    def permission_codes_for_branches(
        self,
        principal: AuthPrincipal,
        branch_ids: set[UUID],
    ) -> dict[UUID, set[str]]:
        branch_entities = self._repository.branch_legal_entities(
            principal.workspace_id,
            branch_ids,
        )
        result: dict[UUID, set[str]] = {branch_id: set() for branch_id in branch_ids}
        enabled_modules = self._module_access.enabled_modules(principal.workspace_id)
        for record in self._repository.effective_permission_records(
            workspace_id=principal.workspace_id,
            membership_id=principal.membership_id,
        ):
            if record.module_code not in enabled_modules:
                continue
            for branch_id, legal_entity_id in branch_entities.items():
                if (
                    record.scope_type == "workspace"
                    or (record.scope_type == "branch" and record.branch_id == branch_id)
                    or (
                        record.scope_type == "legal_entity"
                        and record.legal_entity_id == legal_entity_id
                    )
                ):
                    result[branch_id].add(record.permission_code)
        return result

    def effective_scope(self, principal: AuthPrincipal) -> EffectiveScope:
        scopes = self._repository.assignment_scopes(
            workspace_id=principal.workspace_id,
            membership_id=principal.membership_id,
        )
        workspace_wide = any(scope.scope_type == "workspace" for scope in scopes)
        legal_entity_ids = frozenset(
            scope.legal_entity_id
            for scope in scopes
            if scope.scope_type == "legal_entity" and scope.legal_entity_id is not None
        )
        branch_ids = {
            scope.branch_id for scope in scopes if scope.scope_type == "branch" and scope.branch_id
        }
        branch_ids.update(
            self._repository.branch_ids_for_legal_entities(
                principal.workspace_id,
                set(legal_entity_ids),
            )
        )
        return EffectiveScope(
            workspace_wide=workspace_wide,
            legal_entity_ids=legal_entity_ids,
            branch_ids=frozenset(branch_ids),
        )

    def all_permission_codes(self, principal: AuthPrincipal) -> set[str]:
        enabled_modules = self._module_access.enabled_modules(principal.workspace_id)
        return {
            record.permission_code
            for record in self._repository.effective_permission_records(
                workspace_id=principal.workspace_id,
                membership_id=principal.membership_id,
            )
            if record.module_code in enabled_modules
        }

    def workspace_permission_codes(self, principal: AuthPrincipal) -> set[str]:
        """Return permissions effective specifically at workspace scope.

        ``all_permission_codes`` is intentionally the union of every visible scope so it can
        drive branch and legal-entity features.  Global mutations need a separate capability
        signal: inferring it from that union would let a branch grant look workspace-wide in
        clients that cannot inspect the grant behind each permission.
        """
        enabled_modules = self._module_access.enabled_modules(principal.workspace_id)
        return {
            record.permission_code
            for record in self._repository.effective_permission_records(
                workspace_id=principal.workspace_id,
                membership_id=principal.membership_id,
            )
            if record.scope_type == "workspace" and record.module_code in enabled_modules
        }

    def assigned_permission_codes(self, principal: AuthPrincipal) -> set[str]:
        """Return grants from active assignments, including dormant module grants.

        Entitlements decide whether a permission is currently effective at an endpoint. They do
        not erase the role's durable grants or prevent a workspace-wide role administrator from
        preserving those grants while editing the permission matrix.
        """
        return {
            record.permission_code
            for record in self._repository.effective_permission_records(
                workspace_id=principal.workspace_id,
                membership_id=principal.membership_id,
            )
        }

    def assigned_permission_codes_for_scope(
        self,
        principal: AuthPrincipal,
        *,
        scope_type: str,
        legal_entity_id: UUID | None = None,
        branch_id: UUID | None = None,
    ) -> set[str]:
        """Return durable grants the actor holds at the requested delegation scope."""
        return {
            record.permission_code
            for record in self._repository.effective_permission_records(
                workspace_id=principal.workspace_id,
                membership_id=principal.membership_id,
            )
            if (
                record.scope_type == "workspace"
                or (
                    scope_type == "legal_entity"
                    and record.scope_type == "legal_entity"
                    and record.legal_entity_id == legal_entity_id
                )
                or (
                    scope_type == "branch"
                    and (
                        (
                            record.scope_type == "legal_entity"
                            and record.legal_entity_id == legal_entity_id
                        )
                        or (record.scope_type == "branch" and record.branch_id == branch_id)
                    )
                )
            )
        }
