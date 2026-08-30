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
    UnitOfMeasure,
    Workspace,
    WorkspaceMembership,
)

_PERMISSIONS = (
    (
        "workspace.read",
        "foundation",
        "read",
        "Ver espacio de trabajo",
        "View workspace configuration.",
        10,
    ),
    (
        "workspace.update",
        "foundation",
        "update",
        "Editar espacio de trabajo",
        "Change workspace configuration.",
        20,
    ),
    (
        "legal_entity.read",
        "foundation",
        "read",
        "Ver entidades legales",
        "View legal entities.",
        30,
    ),
    (
        "legal_entity.manage",
        "foundation",
        "manage",
        "Gestionar entidades legales",
        "Create and change legal entities.",
        40,
    ),
    ("branch.read", "foundation", "read", "Ver sucursales", "View branches.", 50),
    (
        "branch.manage",
        "foundation",
        "manage",
        "Gestionar sucursales",
        "Create and change branches.",
        60,
    ),
    (
        "entitlement.read",
        "foundation",
        "read",
        "Ver módulos habilitados",
        "View enabled ERP modules.",
        70,
    ),
    ("audit.read", "foundation", "read", "Ver auditoría", "View workspace audit history.", 80),
    ("membership.read", "iam", "read", "Ver usuarios", "View workspace memberships.", 10),
    (
        "membership.manage",
        "iam",
        "manage",
        "Gestionar usuarios",
        "Invite and manage workspace memberships.",
        20,
    ),
    (
        "role.read",
        "iam",
        "read",
        "Ver roles y permisos",
        "View roles and permission assignments.",
        30,
    ),
    (
        "role.manage",
        "iam",
        "manage",
        "Gestionar roles y permisos",
        "Create roles and assign permissions.",
        40,
    ),
    (
        "catalog.read",
        "catalog",
        "read",
        "Ver catálogo",
        "View categories, units, and products in the authorized scope.",
        10,
    ),
    (
        "catalog.manage",
        "catalog",
        "manage",
        "Gestionar catálogo",
        "Create and change categories and products in the authorized scope.",
        20,
    ),
    (
        "customer.read",
        "crm",
        "read",
        "Ver clientes",
        "View customers in the authorized scope.",
        10,
    ),
    (
        "customer.manage",
        "crm",
        "manage",
        "Gestionar clientes",
        "Create, change, and archive customers in the authorized scope.",
        20,
    ),
    (
        "employee.read",
        "hr",
        "read",
        "Ver empleados básicos",
        "View basic employee records and schedules in the authorized scope.",
        10,
    ),
    (
        "employee.manage",
        "hr",
        "manage",
        "Gestionar empleados básicos",
        "Create, change, and archive basic employee records.",
        20,
    ),
    (
        "employee.schedule.manage",
        "hr",
        "manage",
        "Gestionar horarios",
        "Replace employee weekly schedules in the authorized scope.",
        30,
    ),
    (
        "hr.overview.read",
        "hr",
        "read",
        "Ver overview RRHH",
        "View HR overview metrics.",
        40,
    ),
    (
        "hr.profile.read",
        "hr",
        "read",
        "Ver fichas RRHH",
        "View sensitive employee HR profiles.",
        50,
    ),
    (
        "hr.profile.manage",
        "hr",
        "manage",
        "Gestionar fichas RRHH",
        "Change sensitive employee HR profiles.",
        60,
    ),
    (
        "hr.leave.request",
        "hr",
        "request",
        "Solicitar vacaciones",
        "Request and view own leave.",
        70,
    ),
    (
        "hr.leave.review",
        "hr",
        "review",
        "Aprobar vacaciones",
        "Review employee leave requests.",
        80,
    ),
    (
        "hr.debt.read",
        "hr",
        "read",
        "Ver cuentas por cobrar RRHH",
        "View employee receivables.",
        90,
    ),
    (
        "hr.debt.manage",
        "hr",
        "manage",
        "Gestionar cuentas por cobrar RRHH",
        "Create employee debts and register payments.",
        100,
    ),
    (
        "hr.document.read",
        "hr",
        "read",
        "Ver documentos RRHH",
        "View generated HR document history.",
        110,
    ),
    (
        "hr.document.manage",
        "hr",
        "manage",
        "Generar documentos RRHH",
        "Generate HR document records.",
        120,
    ),
)

_ROLE_TEMPLATES = (
    ("workspace_admin", "Administrador", True),
    ("manager", "Gerente", True),
    ("supervisor", "Supervisor", True),
    ("cashier", "Cajero", True),
    ("seller", "Vendedor", True),
)

_LOCAL_OWNER_EMAIL = "owner@erp.dev"

_MODULES: tuple[tuple[str, str, str, str, tuple[str, ...]], ...] = (
    ("foundation", "Foundation", "core", "available", ()),
    ("iam", "Identity and access", "core", "available", ("foundation",)),
    ("crm", "Customer relationship management", "optional", "available", ("foundation",)),
    ("catalog", "Product and service catalog", "optional", "available", ("foundation",)),
    ("sales", "Sales", "optional", "planned", ("crm", "catalog")),
    ("purchasing", "Purchasing", "optional", "planned", ("catalog",)),
    ("inventory", "Inventory", "optional", "planned", ("catalog", "purchasing")),
    ("accounting", "Accounting", "optional", "planned", ("sales", "purchasing")),
    ("hr", "Human resources", "optional", "available", ("foundation",)),
    ("payroll", "Payroll", "optional", "planned", ("hr", "accounting")),
    ("pos", "Point of sale", "optional", "planned", ("sales", "inventory")),
    ("appointments", "Appointments", "optional", "planned", ("crm", "catalog")),
    ("lodging", "Lodging", "optional", "planned", ("crm", "catalog", "sales")),
)

_UNITS_OF_MEASURE = (
    ("unit", "Unidad", "ud"),
    ("kg", "Kilogramo", "kg"),
    ("g", "Gramo", "g"),
    ("lb", "Libra", "lb"),
    ("l", "Litro", "L"),
    ("ml", "Mililitro", "mL"),
    ("m", "Metro", "m"),
    ("cm", "Centímetro", "cm"),
)


@dataclass(frozen=True)
class BootstrapSummary:
    workspace_id: UUID
    legal_entity_id: UUID
    branch_id: UUID
    platform_user_id: UUID
    membership_id: UUID
    enabled_modules: tuple[str, ...]


def bootstrap_local_foundation(
    session: Session,
    owner_password_hash: str | None = None,
) -> BootstrapSummary:
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
    _upsert_units_of_measure(session, workspace.id)

    _insert_do_nothing(
        session,
        PlatformUser,
        {
            "external_subject": "local:owner",
            "email": _LOCAL_OWNER_EMAIL,
            "normalized_email": _LOCAL_OWNER_EMAIL,
            "display_name": "Local Owner",
            "password_hash": owner_password_hash,
            "password_changed_at": now if owner_password_hash is not None else None,
            "status": "active",
        },
    )
    user = session.scalar(
        select(PlatformUser).where(PlatformUser.external_subject == "local:owner")
    )
    if user is None:
        raise RuntimeError("Local platform user could not be loaded after bootstrap.")
    if user.normalized_email == "owner@erp.local.test":
        user.email = _LOCAL_OWNER_EMAIL
        user.normalized_email = _LOCAL_OWNER_EMAIL
    if owner_password_hash is not None:
        user.password_hash = owner_password_hash
        user.password_changed_at = now

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
            "is_default": True,
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
    membership.status = "active"
    membership.revoked_at = None
    membership.activated_at = membership.activated_at or now
    membership.is_default = True

    for role_code, role_name, is_system in _ROLE_TEMPLATES:
        _insert_do_nothing(
            session,
            Role,
            {
                "workspace_id": workspace.id,
                "code": role_code,
                "name": role_name,
                "status": "active",
                "is_system": is_system,
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

    enabled_modules = ("foundation", "iam", "catalog", "crm", "hr")
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

    for code, module_code, action, name, description, sort_order in _PERMISSIONS:
        statement = (
            insert(Permission)
            .values(
                code=code,
                module_code=module_code,
                action=action,
                name=name,
                description=description,
                sort_order=sort_order,
                is_platform_only=False,
            )
            .on_conflict_do_update(
                index_elements=[Permission.code],
                set_={
                    "module_code": module_code,
                    "action": action,
                    "name": name,
                    "description": description,
                    "sort_order": sort_order,
                    "is_platform_only": False,
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


def _upsert_units_of_measure(session: Session, workspace_id: UUID) -> None:
    for code, name, symbol in _UNITS_OF_MEASURE:
        statement = (
            insert(UnitOfMeasure)
            .values(
                workspace_id=workspace_id,
                code=code,
                name=name,
                symbol=symbol,
                status="active",
            )
            .on_conflict_do_update(
                constraint="uq_units_of_measure_workspace_code",
                set_={
                    "name": name,
                    "symbol": symbol,
                    "status": "active",
                    "updated_at": func.now(),
                },
            )
        )
        session.execute(statement)


def _insert_do_nothing(session: Session, model: type, values: dict[str, object]) -> None:
    session.execute(insert(model).values(**values).on_conflict_do_nothing())
