from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import (
    AccessScope,
    Branch,
    LegalEntity,
    ModuleDefinition,
    ModuleEntitlement,
    Permission,
    PlatformUser,
    RegionalPack,
    Role,
    RoleAssignment,
    RolePermission,
    Workspace,
    WorkspaceMembership,
)

_PERMISSIONS = (
    ("workspace.read", "View workspace configuration."),
    ("workspace.update", "Change workspace configuration."),
    ("legal_entity.read", "View legal entities."),
    ("legal_entity.manage", "Create and change legal entities."),
    ("branch.read", "View branches."),
    ("branch.manage", "Create and change branches."),
    ("membership.read", "View workspace memberships."),
    ("membership.manage", "Invite and manage workspace memberships."),
    ("role.read", "View roles and permission assignments."),
    ("role.manage", "Create roles and assign permissions."),
    ("entitlement.read", "View enabled ERP modules."),
    ("audit.read", "View workspace audit history."),
)

_MODULES: tuple[tuple[str, str, str, str, tuple[str, ...]], ...] = (
    ("foundation", "Foundation", "core", "available", ()),
    ("iam", "Identity and access", "core", "available", ("foundation",)),
    ("crm", "Customer relationship management", "optional", "planned", ("foundation",)),
    ("catalog", "Product and service catalog", "optional", "planned", ("foundation",)),
    ("sales", "Sales", "optional", "planned", ("crm", "catalog")),
    ("purchasing", "Purchasing", "optional", "planned", ("catalog",)),
    ("inventory", "Inventory", "optional", "planned", ("catalog", "purchasing")),
    ("accounting", "Accounting", "optional", "planned", ("sales", "purchasing")),
    ("hr", "Human resources", "optional", "planned", ("foundation",)),
    ("payroll", "Payroll", "optional", "planned", ("hr", "accounting")),
    ("pos", "Point of sale", "optional", "planned", ("sales", "inventory")),
    ("appointments", "Appointments", "optional", "planned", ("crm", "catalog")),
    ("lodging", "Lodging", "optional", "planned", ("crm", "catalog", "sales")),
)


@dataclass(frozen=True)
class BootstrapSummary:
    workspace_id: UUID
    legal_entity_id: UUID
    branch_id: UUID
    platform_user_id: UUID
    membership_id: UUID
    enabled_modules: tuple[str, ...]


def bootstrap_local_foundation(session: Session) -> BootstrapSummary:
    """Install deterministic local catalogs and a non-sensitive development workspace."""

    now = datetime.now(UTC)
    _upsert_catalogs(session)

    _insert_do_nothing(
        session,
        Workspace,
        {
            "slug": "local-erp",
            "name": "Local ERP Workspace",
            "status": "active",
            "default_currency": "DOP",
            "timezone": "America/Santo_Domingo",
            "locale": "es-DO",
        },
    )
    workspace = session.scalar(select(Workspace).where(Workspace.slug == "local-erp"))
    if workspace is None:
        raise RuntimeError("Local workspace could not be loaded after bootstrap.")

    _insert_do_nothing(
        session,
        PlatformUser,
        {
            "external_subject": "local:owner",
            "email": "owner@erp.local.test",
            "display_name": "Local Owner",
            "status": "active",
        },
    )
    user = session.scalar(
        select(PlatformUser).where(PlatformUser.external_subject == "local:owner")
    )
    if user is None:
        raise RuntimeError("Local platform user could not be loaded after bootstrap.")

    _insert_do_nothing(
        session,
        LegalEntity,
        {
            "workspace_id": workspace.id,
            "code": "MAIN",
            "legal_name": "Local ERP Company",
            "display_name": "Local ERP",
            "status": "active",
        },
    )
    legal_entity = session.scalar(
        select(LegalEntity).where(
            LegalEntity.workspace_id == workspace.id,
            LegalEntity.code == "MAIN",
        )
    )
    if legal_entity is None:
        raise RuntimeError("Local legal entity could not be loaded after bootstrap.")

    _insert_do_nothing(
        session,
        Branch,
        {
            "workspace_id": workspace.id,
            "legal_entity_id": legal_entity.id,
            "code": "HQ",
            "name": "Main Branch",
            "status": "active",
            "timezone": workspace.timezone,
        },
    )
    branch = session.scalar(
        select(Branch).where(Branch.workspace_id == workspace.id, Branch.code == "HQ")
    )
    if branch is None:
        raise RuntimeError("Local branch could not be loaded after bootstrap.")

    _insert_do_nothing(
        session,
        WorkspaceMembership,
        {
            "workspace_id": workspace.id,
            "platform_user_id": user.id,
            "status": "active",
            "activated_at": now,
        },
    )
    membership = session.scalar(
        select(WorkspaceMembership).where(
            WorkspaceMembership.workspace_id == workspace.id,
            WorkspaceMembership.platform_user_id == user.id,
        )
    )
    if membership is None:
        raise RuntimeError("Local membership could not be loaded after bootstrap.")

    _insert_do_nothing(
        session,
        Role,
        {
            "workspace_id": workspace.id,
            "code": "workspace_admin",
            "name": "Workspace administrator",
            "status": "active",
            "is_system": True,
        },
    )
    role = session.scalar(
        select(Role).where(Role.workspace_id == workspace.id, Role.code == "workspace_admin")
    )
    if role is None:
        raise RuntimeError("Local administrator role could not be loaded after bootstrap.")

    _insert_do_nothing(
        session,
        AccessScope,
        {"workspace_id": workspace.id, "scope_type": "workspace"},
    )
    scope = session.scalar(
        select(AccessScope).where(
            AccessScope.workspace_id == workspace.id,
            AccessScope.scope_type == "workspace",
        )
    )
    if scope is None:
        raise RuntimeError("Local workspace scope could not be loaded after bootstrap.")

    permission_ids = session.scalars(
        select(Permission.id).where(Permission.is_platform_only.is_(False))
    ).all()
    for permission_id in permission_ids:
        _insert_do_nothing(
            session,
            RolePermission,
            {
                "workspace_id": workspace.id,
                "role_id": role.id,
                "permission_id": permission_id,
            },
        )

    _insert_do_nothing(
        session,
        RoleAssignment,
        {
            "workspace_id": workspace.id,
            "membership_id": membership.id,
            "role_id": role.id,
            "access_scope_id": scope.id,
            "status": "active",
            "valid_from": now,
        },
    )

    enabled_modules = ("foundation", "iam")
    for module_code in enabled_modules:
        module_id = session.scalar(
            select(ModuleDefinition.id).where(ModuleDefinition.code == module_code)
        )
        if module_id is None:
            raise RuntimeError(f"Module {module_code!r} was not installed.")
        _insert_do_nothing(
            session,
            ModuleEntitlement,
            {
                "workspace_id": workspace.id,
                "module_definition_id": module_id,
                "status": "enabled",
                "effective_from": now,
            },
        )

    return BootstrapSummary(
        workspace_id=workspace.id,
        legal_entity_id=legal_entity.id,
        branch_id=branch.id,
        platform_user_id=user.id,
        membership_id=membership.id,
        enabled_modules=enabled_modules,
    )


def _upsert_catalogs(session: Session) -> None:
    for code, description in _PERMISSIONS:
        statement = (
            insert(Permission)
            .values(code=code, description=description, is_platform_only=False)
            .on_conflict_do_update(
                index_elements=[Permission.code],
                set_={
                    "description": description,
                    "is_platform_only": False,
                    "updated_at": func.now(),
                },
            )
        )
        session.execute(statement)

    for code, name, kind, status, dependencies in _MODULES:
        statement = (
            insert(ModuleDefinition)
            .values(
                code=code,
                name=name,
                kind=kind,
                status=status,
                dependency_codes=list(dependencies),
            )
            .on_conflict_do_update(
                index_elements=[ModuleDefinition.code],
                set_={
                    "name": name,
                    "kind": kind,
                    "status": status,
                    "dependency_codes": list(dependencies),
                    "updated_at": func.now(),
                },
            )
        )
        session.execute(statement)

    session.execute(
        insert(RegionalPack)
        .values(
            code="do",
            name="Dominican Republic",
            jurisdiction_code="DO",
            status="planned",
        )
        .on_conflict_do_update(
            index_elements=[RegionalPack.code],
            set_={
                "name": "Dominican Republic",
                "jurisdiction_code": "DO",
                "status": "planned",
                "updated_at": func.now(),
            },
        )
    )


def _insert_do_nothing(session: Session, model: type, values: dict[str, object]) -> None:
    session.execute(insert(model).values(**values).on_conflict_do_nothing())
