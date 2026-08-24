from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.orm import Session

from app.repositories.authorization import AuthorizationRepository
from app.services.auth import AuthPrincipal
from app.services.errors import AuthorizationError


@dataclass(frozen=True)
class PermissionGrant:
    permission_code: str
    workspace_id: UUID
    membership_id: UUID
    allowed_branch_ids: frozenset[UUID] | None

    @property
    def workspace_wide(self) -> bool:
        return self.allowed_branch_ids is None


class AuthorizationService:
    def __init__(self, session: Session) -> None:
        self._repository = AuthorizationRepository(session)

    def require_permission(
        self,
        principal: AuthPrincipal,
        permission_code: str,
    ) -> PermissionGrant:
        scopes = self._repository.permission_scopes(
            workspace_id=principal.workspace_id,
            membership_id=principal.membership_id,
            permission_code=permission_code,
        )
        if not scopes:
            raise AuthorizationError("No tienes permiso para realizar esta acción.")
        if any(scope.scope_type == "workspace" for scope in scopes):
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
        for record in self._repository.effective_permission_records(
            workspace_id=principal.workspace_id,
            membership_id=principal.membership_id,
        ):
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

    def all_permission_codes(self, principal: AuthPrincipal) -> set[str]:
        return {
            record.permission_code
            for record in self._repository.effective_permission_records(
                workspace_id=principal.workspace_id,
                membership_id=principal.membership_id,
            )
        }
