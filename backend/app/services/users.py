from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from math import ceil
from uuid import UUID, uuid7

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.core.security import hash_password, normalize_email
from app.db.models import PlatformUser, UserInvitation, WorkspaceMembership
from app.repositories.users import (
    BranchRecord,
    LegalEntityRecord,
    RoleAssignmentSpec,
    RoleRecord,
    UserRecord,
    UsersRepository,
)
from app.services.auth import AuthPrincipal
from app.services.authorization import AuthorizationService, PermissionGrant
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)


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
    legal_entities: tuple[LegalEntityRecord, ...]
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
            visible_legal_entity_ids=grant.allowed_legal_entity_ids,
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
            roles=self.assignable_roles(grant),
            legal_entities=tuple(
                self._repository.list_legal_entities(
                    grant.workspace_id,
                    grant.allowed_legal_entity_ids,
                )
            ),
            branches=self.assignable_branches(grant),
        )

    def assignable_roles(self, grant: PermissionGrant) -> tuple[RoleRecord, ...]:
        roles = self._repository.list_roles(grant.workspace_id)
        if not grant.workspace_wide:
            roles = [role for role in roles if role.code != "workspace_admin"]
        return tuple(roles)

    def assignable_branches(self, grant: PermissionGrant) -> tuple[BranchRecord, ...]:
        return tuple(self._repository.list_branches(grant.workspace_id, grant.allowed_branch_ids))

    def create_user(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        display_name: str,
        email: str,
        password: str,
        role_assignments: list[RoleAssignmentSpec],
    ) -> UserRecord:
        validated_assignments, _ = self._validate_assignments(
            principal,
            grant,
            role_assignments,
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
                assignments=validated_assignments,
                now=datetime.now(UTC),
                request_id=get_request_id(),
            )
            self._session.commit()
            return user
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo crear el usuario por un conflicto de datos.") from exc

    def get_user(self, grant: PermissionGrant, membership_id: UUID) -> UserRecord:
        user = self._repository.get_user(
            workspace_id=grant.workspace_id,
            membership_id=membership_id,
            visible_branch_ids=grant.allowed_branch_ids,
            visible_legal_entity_ids=grant.allowed_legal_entity_ids,
        )
        if user is None:
            raise ResourceNotFoundError("El usuario no existe.", "membershipId")
        return user

    def update_user(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        membership_id: UUID,
        version: int,
        status: str | None,
        role_assignments: list[RoleAssignmentSpec] | None,
    ) -> UserRecord:
        self.get_user(grant, membership_id)
        if not self._repository.lock_workspace(grant.workspace_id):
            raise ResourceNotFoundError("El workspace no existe.", "workspaceId")
        membership = self._repository.membership_for_update(grant.workspace_id, membership_id)
        if membership is None:
            raise ResourceNotFoundError("El usuario no existe.", "membershipId")
        current = self._repository.get_user_for_authorization(
            workspace_id=grant.workspace_id,
            membership_id=membership_id,
        )
        if current is None:
            raise ResourceNotFoundError("El usuario no existe.", "membershipId")
        self._require_target_within_grant(grant, current)
        if membership.version != version:
            raise ConflictError("El usuario fue modificado por otra sesión.", "version")
        status_changed = status is not None and membership.status != status

        validated_assignments: list[RoleAssignmentSpec] | None = None
        roles_by_id: dict[UUID, RoleRecord] = {}
        assignments_changed = False
        if role_assignments is not None:
            validated_assignments, roles_by_id = self._validate_assignments(
                principal,
                grant,
                role_assignments,
            )
            current_keys = {assignment.key for assignment in current.role_assignments}
            requested_keys = {assignment.key for assignment in validated_assignments}
            assignments_changed = current_keys != requested_keys

        remains_workspace_admin = role_assignments is None or any(
            assignment.scope_type == "workspace"
            and roles_by_id[assignment.role_id].code == "workspace_admin"
            for assignment in validated_assignments or []
        )
        removes_workspace_admin = self._repository.is_workspace_admin(
            grant.workspace_id,
            membership_id,
        ) and (status == "suspended" or not remains_workspace_admin)
        if (
            removes_workspace_admin
            and self._repository.active_workspace_admin_count(grant.workspace_id) <= 1
        ):
            raise ConflictError("No se puede suspender o degradar al último administrador.")

        now = datetime.now(UTC)
        try:
            if status is not None:
                membership.status = status
                if status == "suspended":
                    membership.revoked_at = now
                    self._repository.revoke_membership_sessions(membership.id, now)
                else:
                    membership.revoked_at = None
                    membership.activated_at = membership.activated_at or now

            if assignments_changed and validated_assignments is not None:
                self._repository.replace_assignments(
                    workspace_id=grant.workspace_id,
                    membership_id=membership_id,
                    assignments=validated_assignments,
                    now=now,
                )
                self._repository.revoke_membership_sessions(membership.id, now)

            if status_changed or assignments_changed:
                self._repository.add_membership_update_audit(
                    workspace_id=grant.workspace_id,
                    membership_id=membership.id,
                    actor_platform_user_id=principal.platform_user_id,
                    status=status if status_changed else None,
                    assignments=validated_assignments if assignments_changed else None,
                    request_id=get_request_id(),
                )

            membership.version += 1
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError(
                "No se pudo actualizar el usuario por un conflicto de datos."
            ) from exc
        updated = self._repository.get_user(
            workspace_id=grant.workspace_id,
            membership_id=membership_id,
            visible_branch_ids=grant.allowed_branch_ids,
            visible_legal_entity_ids=grant.allowed_legal_entity_ids,
        )
        if updated is None:
            raise ResourceNotFoundError("El usuario ya no está dentro de tu alcance.")
        return updated

    def reset_password(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        membership_id: UUID,
        new_password: str,
    ) -> None:
        self.get_user(grant, membership_id)
        membership = self._repository.membership_for_update(grant.workspace_id, membership_id)
        if membership is None:
            raise ResourceNotFoundError("El usuario no existe.", "membershipId")
        current = self._repository.get_user_for_authorization(
            workspace_id=grant.workspace_id,
            membership_id=membership_id,
        )
        if current is None:
            raise ResourceNotFoundError("El usuario no existe.", "membershipId")
        self._require_target_within_grant(grant, current)
        user = self._repository.platform_user(current.platform_user_id, lock=True)
        if user is None:
            raise ResourceNotFoundError("El usuario no existe.", "membershipId")
        if membership.status not in {"active", "suspended"}:
            raise ConflictError(
                "Solo se puede restablecer la contraseña de un membership activado.",
                "membershipId",
            )
        if self._repository.platform_user_membership_count(user.id) > 1:
            raise ConflictError(
                "La identidad pertenece a varios workspaces; usa un flujo global verificado.",
                "membershipId",
            )
        now = datetime.now(UTC)
        user.password_hash = hash_password(new_password)
        user.password_changed_at = now
        user.version += 1
        membership.version += 1
        self._repository.revoke_platform_user_sessions(user.id, now)
        self._repository.add_security_audit(
            workspace_id=grant.workspace_id,
            actor_platform_user_id=principal.platform_user_id,
            action="platform_user.password.admin_reset",
            target_type="platform_user",
            target_id=user.id,
            request_id=get_request_id(),
            details={
                "membershipId": str(membership.id),
                "revokedAllIdentitySessions": True,
            },
        )
        self._session.commit()

    def create_invitation(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        display_name: str,
        email: str,
        role_assignments: list[RoleAssignmentSpec],
    ) -> tuple[UserInvitation, str, str]:
        validated_assignments, _ = self._validate_assignments(
            principal,
            grant,
            role_assignments,
        )
        normalized_email = normalize_email(email)
        user = self._repository.platform_user_by_email(normalized_email, lock=True)
        existing_identity = user is not None
        if user is not None and self._repository.membership_exists(grant.workspace_id, user.id):
            raise ConflictError("La identidad ya pertenece a este workspace.", "email")
        if (
            user is not None
            and user.password_hash is None
            and user.external_subject == f"invitation:{user.id}"
        ):
            raise ConflictError(
                "La identidad todavía tiene una invitación inicial pendiente.",
                "email",
            )
        now = datetime.now(UTC)
        try:
            if user is None:
                user_id = uuid7()
                user = PlatformUser(
                    id=user_id,
                    external_subject=f"invitation:{user_id}",
                    email=normalized_email,
                    normalized_email=normalized_email,
                    display_name=" ".join(display_name.split()),
                    password_hash=None,
                    status="active",
                )
                self._session.add(user)
                self._session.flush()

            membership = WorkspaceMembership(
                workspace_id=grant.workspace_id,
                platform_user_id=user.id,
                status="invited",
                invited_at=now,
                is_default=not self._repository.has_default_membership(user.id),
            )
            self._session.add(membership)
            self._session.flush()
            self._repository.replace_assignments(
                workspace_id=grant.workspace_id,
                membership_id=membership.id,
                assignments=validated_assignments,
                now=now,
            )
            raw_token = secrets.token_urlsafe(48)
            invitation = UserInvitation(
                workspace_id=grant.workspace_id,
                membership_id=membership.id,
                invited_by_platform_user_id=principal.platform_user_id,
                token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
                expires_at=now + timedelta(days=7),
            )
            self._repository.add_invitation(invitation)
            self._repository.add_security_audit(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action="membership.invitation.create",
                target_type="workspace_membership",
                target_id=membership.id,
                request_id=get_request_id(),
                details={
                    "invitationId": str(invitation.id),
                    "identityType": "existing" if existing_identity else "new",
                },
            )
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError(
                "No se pudo crear la invitación por un conflicto de datos."
            ) from exc
        return invitation, normalized_email, raw_token

    def accept_invitation(self, token: str, password: str | None) -> UserRecord:
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        invitation = self._repository.invitation_by_token_hash(token_hash, lock=True)
        now = datetime.now(UTC)
        if (
            invitation is None
            or invitation.accepted_at is not None
            or invitation.revoked_at is not None
            or invitation.expires_at <= now
        ):
            raise ResourceNotFoundError("La invitación no existe o expiró.", "token")
        membership = self._repository.membership_for_update(
            invitation.workspace_id,
            invitation.membership_id,
        )
        if membership is None or membership.status != "invited":
            raise ConflictError("La invitación ya no está pendiente.")
        user = self._repository.platform_user(membership.platform_user_id, lock=True)
        if user is None:
            raise ResourceNotFoundError("La identidad invitada no existe.")
        creates_identity = (
            user.password_hash is None
            and user.external_subject == f"invitation:{user.id}"
            and self._repository.platform_user_membership_count(user.id) == 1
        )
        if creates_identity:
            if password is None:
                raise InvalidOperationError(
                    "La nueva identidad debe definir una contraseña.",
                    "password",
                )
            user.password_hash = hash_password(password)
            user.password_changed_at = now
            user.version += 1
        elif password is not None:
            raise InvalidOperationError(
                "Una identidad existente conserva su credencial global; omite password.",
                "password",
            )
        membership.status = "active"
        membership.activated_at = now
        membership.version += 1
        invitation.accepted_at = now
        invitation.version += 1
        self._repository.add_security_audit(
            workspace_id=membership.workspace_id,
            actor_platform_user_id=user.id,
            action="membership.invitation.accept",
            target_type="workspace_membership",
            target_id=membership.id,
            request_id=get_request_id(),
            details={
                "invitationId": str(invitation.id),
                "identityType": "new" if creates_identity else "existing",
            },
        )
        self._session.commit()
        result = self._repository.get_user(
            workspace_id=membership.workspace_id,
            membership_id=membership.id,
            visible_branch_ids=None,
            visible_legal_entity_ids=None,
        )
        if result is None:
            raise ResourceNotFoundError("El usuario invitado no pudo activarse.")
        return result

    def revoke_invitation(
        self,
        grant: PermissionGrant,
        invitation_id: UUID,
    ) -> None:
        invitation = self._repository.invitation_for_update(grant.workspace_id, invitation_id)
        if invitation is None:
            raise ResourceNotFoundError("La invitación no existe.", "invitationId")
        self.get_user(grant, invitation.membership_id)
        membership = self._repository.membership_for_update(
            invitation.workspace_id,
            invitation.membership_id,
        )
        if membership is None:
            raise ResourceNotFoundError("El usuario no existe.", "membershipId")
        invited_user = self._repository.get_user_for_authorization(
            workspace_id=invitation.workspace_id,
            membership_id=invitation.membership_id,
        )
        if invited_user is None:
            raise ResourceNotFoundError("El usuario no existe.", "membershipId")
        self._require_target_within_grant(grant, invited_user)
        if invitation.accepted_at is not None:
            raise ConflictError("La invitación ya fue aceptada.")
        if invitation.revoked_at is not None:
            return
        now = datetime.now(UTC)
        invitation.revoked_at = now
        invitation.version += 1
        if membership.status == "invited":
            membership.status = "revoked"
            membership.revoked_at = now
            membership.version += 1
        self._session.commit()

    def _validate_assignments(
        self,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        assignments: list[RoleAssignmentSpec],
    ) -> tuple[list[RoleAssignmentSpec], dict[UUID, RoleRecord]]:
        if not assignments:
            raise ConflictError("El usuario debe conservar al menos una asignación de rol.")
        if len(assignments) != len({assignment.key for assignment in assignments}):
            raise ConflictError("No repitas asignaciones de rol.", "roleAssignments")

        role_ids = {assignment.role_id for assignment in assignments}
        roles_by_id = {
            role_id: role
            for role_id in role_ids
            if (role := self._repository.get_role(principal.workspace_id, role_id)) is not None
        }
        if len(roles_by_id) != len(role_ids):
            raise ResourceNotFoundError(
                "Uno o más roles no existen o no están activos.",
                "roleAssignments",
            )

        requested_legal_entity_ids = {
            assignment.legal_entity_id
            for assignment in assignments
            if assignment.scope_type == "legal_entity" and assignment.legal_entity_id is not None
        }
        legal_entities_by_id = {
            entity.id: entity
            for entity in self._repository.get_legal_entities(
                principal.workspace_id,
                requested_legal_entity_ids,
            )
        }
        if len(legal_entities_by_id) != len(requested_legal_entity_ids):
            raise ResourceNotFoundError(
                "Una o más entidades legales no existen o no están activas.",
                "roleAssignments",
            )

        requested_branch_ids = {
            assignment.branch_id
            for assignment in assignments
            if assignment.scope_type == "branch" and assignment.branch_id is not None
        }
        branches_by_id = {
            branch.id: branch
            for branch in self._repository.get_branches(
                principal.workspace_id,
                requested_branch_ids,
            )
        }
        if len(branches_by_id) != len(requested_branch_ids):
            raise ResourceNotFoundError(
                "Una o más sucursales no existen o no están activas.",
                "roleAssignments",
            )

        authorization = AuthorizationService(self._session)
        validated: list[RoleAssignmentSpec] = []
        for assignment in assignments:
            role = roles_by_id[assignment.role_id]
            legal_entity_id: UUID | None = None
            branch_id: UUID | None = None
            if assignment.scope_type == "workspace":
                if assignment.legal_entity_id is not None or assignment.branch_id is not None:
                    raise ConflictError(
                        "Una asignación workspace no acepta IDs de alcance.",
                        "roleAssignments",
                    )
                if not grant.workspace_wide:
                    raise AuthorizationError(
                        "Solo un actor con alcance workspace puede asignar ese alcance."
                    )
            elif assignment.scope_type == "legal_entity":
                if assignment.legal_entity_id is None or assignment.branch_id is not None:
                    raise ConflictError(
                        "Una asignación de entidad legal requiere solo legalEntityId.",
                        "roleAssignments",
                    )
                legal_entity_id = assignment.legal_entity_id
                if (
                    grant.allowed_legal_entity_ids is not None
                    and legal_entity_id not in grant.allowed_legal_entity_ids
                ):
                    raise AuthorizationError(
                        "No puedes asignar una entidad legal fuera de tu alcance."
                    )
            elif assignment.scope_type == "branch":
                if assignment.branch_id is None or assignment.legal_entity_id is not None:
                    raise ConflictError(
                        "Una asignación de sucursal requiere branchId.",
                        "roleAssignments",
                    )
                branch = branches_by_id[assignment.branch_id]
                legal_entity_id = branch.legal_entity_id
                branch_id = branch.id
                if (
                    grant.allowed_branch_ids is not None
                    and branch_id not in grant.allowed_branch_ids
                ):
                    raise AuthorizationError("No puedes asignar una sucursal fuera de tu alcance.")
            else:
                raise ConflictError("El tipo de alcance no es válido.", "roleAssignments")

            role_permissions = self._repository.role_permission_codes(
                principal.workspace_id,
                assignment.role_id,
            )
            actor_permissions = authorization.assigned_permission_codes_for_scope(
                principal,
                scope_type=assignment.scope_type,
                legal_entity_id=legal_entity_id,
                branch_id=branch_id,
            )
            if not role_permissions.issubset(actor_permissions):
                raise AuthorizationError(
                    "No puedes asignar un rol con permisos superiores a los tuyos."
                )
            if role.code == "workspace_admin" and assignment.scope_type != "workspace":
                raise ConflictError(
                    "El rol Administrador solo admite alcance workspace.",
                    "roleAssignments",
                )
            validated.append(
                RoleAssignmentSpec(
                    role_id=assignment.role_id,
                    scope_type=assignment.scope_type,
                    legal_entity_id=legal_entity_id,
                    branch_id=branch_id,
                )
            )
        return validated, roles_by_id

    def _require_target_within_grant(
        self,
        grant: PermissionGrant,
        user: UserRecord,
    ) -> None:
        if grant.workspace_wide:
            return
        for assignment in user.role_assignments:
            if assignment.scope_type == "workspace":
                raise AuthorizationError(
                    "No puedes administrar un usuario con alcance superior al tuyo."
                )
            if assignment.scope_type == "legal_entity" and (
                grant.allowed_legal_entity_ids is None
                or assignment.legal_entity_id not in grant.allowed_legal_entity_ids
            ):
                raise AuthorizationError("No puedes administrar un usuario fuera de tu alcance.")
            if assignment.scope_type == "branch" and (
                grant.allowed_branch_ids is None
                or assignment.branch_id not in grant.allowed_branch_ids
            ):
                raise AuthorizationError("No puedes administrar un usuario fuera de tu alcance.")


def user_initials(display_name: str) -> str:
    parts = display_name.split()
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return f"{parts[0][0]}{parts[-1][0]}".upper()
