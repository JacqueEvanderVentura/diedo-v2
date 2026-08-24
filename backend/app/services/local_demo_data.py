from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import (
    AccessScope,
    Branch,
    Permission,
    PlatformUser,
    Role,
    RoleAssignment,
    RolePermission,
    WorkspaceMembership,
)
from app.services.local_bootstrap import bootstrap_local_foundation


@dataclass(frozen=True)
class DemoUserSpec:
    key: str
    display_name: str
    email: str
    role_code: str
    branch_codes: tuple[str, ...]
    membership_status: str = "active"
    workspace_wide: bool = False
    last_access_days_ago: int | None = None


@dataclass(frozen=True)
class DemoSeedSummary:
    workspace_id: UUID
    branch_count: int
    demo_user_count: int
    active_demo_user_count: int
    inactive_demo_user_count: int
    demo_emails: tuple[str, ...]


_DEMO_BRANCHES = (
    ("NORTH", "Sucursal Norte"),
    ("DOWNTOWN", "Sucursal Centro"),
    ("EAST", "Sucursal Este"),
)

_ROLE_PERMISSION_CODES: dict[str, tuple[str, ...]] = {
    "manager": (
        "workspace.read",
        "legal_entity.read",
        "branch.read",
        "membership.read",
        "membership.manage",
        "role.read",
    ),
    "supervisor": (
        "workspace.read",
        "branch.read",
        "membership.read",
    ),
    "cashier": ("branch.read",),
    "seller": ("branch.read",),
}

_DEMO_USERS = (
    DemoUserSpec(
        key="lucia-mendez",
        display_name="Lucía Méndez",
        email="lucia.admin.demo@erp.dev",
        role_code="workspace_admin",
        branch_codes=(),
        workspace_wide=True,
        last_access_days_ago=0,
    ),
    DemoUserSpec(
        key="ana-rodriguez",
        display_name="Ana Rodríguez",
        email="ana.manager.demo@erp.dev",
        role_code="manager",
        branch_codes=("HQ", "NORTH"),
        last_access_days_ago=1,
    ),
    DemoUserSpec(
        key="bruno-castillo",
        display_name="Bruno Castillo",
        email="bruno.manager.demo@erp.dev",
        role_code="manager",
        branch_codes=("DOWNTOWN",),
        last_access_days_ago=2,
    ),
    DemoUserSpec(
        key="carla-gomez",
        display_name="Carla Gómez",
        email="carla.supervisor.demo@erp.dev",
        role_code="supervisor",
        branch_codes=("NORTH",),
        last_access_days_ago=3,
    ),
    DemoUserSpec(
        key="diego-perez",
        display_name="Diego Pérez",
        email="diego.cashier.demo@erp.dev",
        role_code="cashier",
        branch_codes=("HQ",),
        last_access_days_ago=5,
    ),
    DemoUserSpec(
        key="elena-santos",
        display_name="Elena Santos",
        email="elena.seller.demo@erp.dev",
        role_code="seller",
        branch_codes=("EAST",),
        last_access_days_ago=7,
    ),
    DemoUserSpec(
        key="fabio-martinez",
        display_name="Fabio Martínez",
        email="fabio.seller.demo@erp.dev",
        role_code="seller",
        branch_codes=("DOWNTOWN", "EAST"),
        last_access_days_ago=10,
    ),
    DemoUserSpec(
        key="gabriela-diaz",
        display_name="Gabriela Díaz",
        email="gabriela.inactive.demo@erp.dev",
        role_code="supervisor",
        branch_codes=("EAST",),
        membership_status="suspended",
        last_access_days_ago=45,
    ),
)


def seed_local_demo_data(session: Session, password_hash: str) -> DemoSeedSummary:
    """Create a repeatable IAM dataset for local endpoint exploration."""

    foundation = bootstrap_local_foundation(session, password_hash)
    now = datetime.now(UTC)
    owner = session.get(PlatformUser, foundation.platform_user_id)
    if owner is None:
        raise RuntimeError("Local owner could not be loaded for demo data.")
    owner.password_hash = password_hash
    owner.password_changed_at = now

    for code, name in _DEMO_BRANCHES:
        _insert_do_nothing(
            session,
            Branch,
            {
                "workspace_id": foundation.workspace_id,
                "legal_entity_id": foundation.legal_entity_id,
                "code": code,
                "name": name,
                "status": "active",
                "timezone": "America/Santo_Domingo",
            },
        )

    branches = {
        branch.code: branch
        for branch in session.scalars(
            select(Branch).where(
                Branch.workspace_id == foundation.workspace_id,
                Branch.status == "active",
            )
        )
    }
    for branch in branches.values():
        _insert_do_nothing(
            session,
            AccessScope,
            {
                "workspace_id": foundation.workspace_id,
                "scope_type": "branch",
                "legal_entity_id": branch.legal_entity_id,
                "branch_id": branch.id,
            },
        )

    roles = {
        role.code: role
        for role in session.scalars(
            select(Role).where(Role.workspace_id == foundation.workspace_id)
        )
    }
    permissions = {
        permission.code: permission
        for permission in session.scalars(
            select(Permission).where(Permission.is_platform_only.is_(False))
        )
    }
    _seed_role_permissions(session, foundation.workspace_id, roles, permissions)

    workspace_scope = session.scalar(
        select(AccessScope).where(
            AccessScope.workspace_id == foundation.workspace_id,
            AccessScope.scope_type == "workspace",
        )
    )
    if workspace_scope is None:
        raise RuntimeError("Local workspace scope could not be loaded for demo data.")

    branch_scopes = {
        scope.branch_id: scope
        for scope in session.scalars(
            select(AccessScope).where(
                AccessScope.workspace_id == foundation.workspace_id,
                AccessScope.scope_type == "branch",
            )
        )
        if scope.branch_id is not None
    }

    for spec in _DEMO_USERS:
        role = roles.get(spec.role_code)
        if role is None:
            raise RuntimeError(f"Demo role {spec.role_code!r} is not installed.")
        user = _upsert_demo_user(session, spec, password_hash, now)
        membership = _upsert_demo_membership(
            session,
            workspace_id=foundation.workspace_id,
            user=user,
            spec=spec,
            now=now,
        )
        if spec.workspace_wide:
            _insert_role_assignment(
                session,
                workspace_id=foundation.workspace_id,
                membership_id=membership.id,
                role_id=role.id,
                scope_id=workspace_scope.id,
                now=now,
            )
            continue
        for branch_code in spec.branch_codes:
            assigned_branch = branches.get(branch_code)
            if assigned_branch is None:
                raise RuntimeError(f"Demo branch {branch_code!r} is not installed.")
            scope = branch_scopes.get(assigned_branch.id)
            if scope is None:
                raise RuntimeError(f"Demo scope for branch {branch_code!r} is not installed.")
            _insert_role_assignment(
                session,
                workspace_id=foundation.workspace_id,
                membership_id=membership.id,
                role_id=role.id,
                scope_id=scope.id,
                now=now,
            )

    active_count = sum(spec.membership_status == "active" for spec in _DEMO_USERS)
    return DemoSeedSummary(
        workspace_id=foundation.workspace_id,
        branch_count=len(branches),
        demo_user_count=len(_DEMO_USERS),
        active_demo_user_count=active_count,
        inactive_demo_user_count=len(_DEMO_USERS) - active_count,
        demo_emails=tuple(spec.email for spec in _DEMO_USERS),
    )


def _seed_role_permissions(
    session: Session,
    workspace_id: UUID,
    roles: dict[str, Role],
    permissions: dict[str, Permission],
) -> None:
    for role_code, permission_codes in _ROLE_PERMISSION_CODES.items():
        role = roles.get(role_code)
        if role is None:
            raise RuntimeError(f"Demo role {role_code!r} is not installed.")
        for permission_code in permission_codes:
            permission = permissions.get(permission_code)
            if permission is None:
                raise RuntimeError(f"Demo permission {permission_code!r} is not installed.")
            _insert_do_nothing(
                session,
                RolePermission,
                {
                    "workspace_id": workspace_id,
                    "role_id": role.id,
                    "permission_id": permission.id,
                },
            )


def _upsert_demo_user(
    session: Session,
    spec: DemoUserSpec,
    password_hash: str,
    now: datetime,
) -> PlatformUser:
    external_subject = f"local:demo:{spec.key}"
    _insert_do_nothing(
        session,
        PlatformUser,
        {
            "external_subject": external_subject,
            "email": spec.email,
            "normalized_email": spec.email,
            "display_name": spec.display_name,
            "password_hash": password_hash,
            "password_changed_at": now,
            "status": "active",
        },
    )
    user = session.scalar(
        select(PlatformUser).where(PlatformUser.external_subject == external_subject)
    )
    if user is None:
        raise RuntimeError(f"Demo user {spec.email!r} conflicts with existing local data.")
    user.password_hash = password_hash
    user.password_changed_at = now
    return user


def _upsert_demo_membership(
    session: Session,
    *,
    workspace_id: UUID,
    user: PlatformUser,
    spec: DemoUserSpec,
    now: datetime,
) -> WorkspaceMembership:
    activated_at = now - timedelta(days=60)
    _insert_do_nothing(
        session,
        WorkspaceMembership,
        {
            "workspace_id": workspace_id,
            "platform_user_id": user.id,
            "status": spec.membership_status,
            "is_default": True,
            "invited_at": activated_at,
            "activated_at": activated_at,
            "last_access_at": (
                now - timedelta(days=spec.last_access_days_ago)
                if spec.last_access_days_ago is not None
                else None
            ),
        },
    )
    membership = session.scalar(
        select(WorkspaceMembership).where(
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.platform_user_id == user.id,
        )
    )
    if membership is None:
        raise RuntimeError(f"Demo membership for {spec.email!r} could not be loaded.")
    membership.status = spec.membership_status
    membership.is_default = True
    membership.last_access_at = (
        now - timedelta(days=spec.last_access_days_ago)
        if spec.last_access_days_ago is not None
        else None
    )
    return membership


def _insert_role_assignment(
    session: Session,
    *,
    workspace_id: UUID,
    membership_id: UUID,
    role_id: UUID,
    scope_id: UUID,
    now: datetime,
) -> None:
    _insert_do_nothing(
        session,
        RoleAssignment,
        {
            "workspace_id": workspace_id,
            "membership_id": membership_id,
            "role_id": role_id,
            "access_scope_id": scope_id,
            "status": "active",
            "valid_from": now,
        },
    )


def _insert_do_nothing(session: Session, model: type, values: dict[str, object]) -> None:
    session.execute(insert(model).values(**values).on_conflict_do_nothing())
