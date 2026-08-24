from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from math import ceil
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.core.security import hash_password, normalize_email
from app.repositories.users import BranchRecord, RoleRecord, UserRecord, UsersRepository
from app.services.auth import AuthPrincipal
from app.services.authorization import AuthorizationService, PermissionGrant
from app.services.errors import AuthorizationError, ConflictError, ResourceNotFoundError


@dataclass(frozen=True)
class UserListResult:
    items: tuple[UserRecord, ...]
    page: int
    page_size: int
    total_items: int
    total_pages: int


@dataclass(frozen=True)
class UserSummary:
    total_users: int
    active_users: int
    administrators: int
    inactive_users: int


@dataclass(frozen=True)
class UserFormOptions:
    roles: tuple[RoleRecord, ...]
    branches: tuple[BranchRecord, ...]


class UsersService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = UsersRepository(session)

    def list_users(
        self,
        *,
        grant: PermissionGrant,
        search: str | None,
        status: str | None,
        role_id: UUID | None,
        branch_id: UUID | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> UserListResult:
        if (
            branch_id is not None
            and grant.allowed_branch_ids is not None
            and branch_id not in grant.allowed_branch_ids
        ):
            raise AuthorizationError("No puedes consultar una sucursal fuera de tu alcance.")
        result = self._repository.list_users(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
            search=search.strip() if search else None,
            status=status,
            role_id=role_id,
            branch_id=branch_id,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )
        return UserListResult(
            items=result.items,
            page=page,
            page_size=page_size,
            total_items=result.total_items,
            total_pages=ceil(result.total_items / page_size) if result.total_items else 0,
        )

    def summary(self, grant: PermissionGrant) -> UserSummary:
        counts = self._repository.user_counts(
            workspace_id=grant.workspace_id,
            visible_branch_ids=grant.allowed_branch_ids,
        )
        return UserSummary(
            total_users=counts.total_users,
            active_users=counts.active_users,
            administrators=counts.administrators,
            inactive_users=counts.total_users - counts.active_users,
        )

    def form_options(self, grant: PermissionGrant) -> UserFormOptions:
        return UserFormOptions(
            roles=tuple(self._repository.list_roles(grant.workspace_id)),
            branches=tuple(
                self._repository.list_branches(grant.workspace_id, grant.allowed_branch_ids)
            ),
        )

    def create_user(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        display_name: str,
        email: str,
        password: str,
        role_id: UUID,
        branch_ids: list[UUID],
    ) -> UserRecord:
        requested_branches = set(branch_ids)
        if grant.allowed_branch_ids is not None and not requested_branches.issubset(
            grant.allowed_branch_ids
        ):
            raise AuthorizationError("No puedes asignar una sucursal fuera de tu alcance.")

        role = self._repository.get_role(principal.workspace_id, role_id)
        if role is None:
            raise ResourceNotFoundError("El rol no existe.", "roleId")
        branches = self._repository.get_branches(principal.workspace_id, requested_branches)
        if len(branches) != len(requested_branches):
            raise ResourceNotFoundError(
                "Una o más sucursales no existen o no están activas.",
                "branchIds",
            )

        role_permissions = self._repository.role_permission_codes(principal.workspace_id, role.id)
        actor_permissions = AuthorizationService(self._session).permission_codes_for_branches(
            principal,
            requested_branches,
        )
        if any(
            not role_permissions.issubset(actor_permissions.get(branch_id, set()))
            for branch_id in requested_branches
        ):
            raise AuthorizationError(
                "No puedes asignar un rol con permisos superiores a los tuyos."
            )

        normalized_email = normalize_email(email)
        if self._repository.normalized_email_exists(normalized_email):
            raise ConflictError("Ya existe un usuario con este email.", "email")
        try:
            user = self._repository.create_user(
                actor_platform_user_id=principal.platform_user_id,
                workspace_id=principal.workspace_id,
                display_name=display_name,
                email=normalized_email,
                password_hash=hash_password(password),
                role=role,
                branches=branches,
                now=datetime.now(UTC),
                request_id=get_request_id(),
            )
            self._session.commit()
            return user
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo crear el usuario por un conflicto de datos.") from exc


def user_initials(display_name: str) -> str:
    parts = display_name.split()
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return f"{parts[0][0]}{parts[-1][0]}".upper()
