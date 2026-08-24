"""Persistence model registry used by Alembic metadata discovery."""

from app.db.models.audit import AuditEntry
from app.db.models.foundation import (
    Branch,
    LegalEntity,
    LegalEntityIdentity,
    LegalEntityRegionalRule,
    ModuleDefinition,
    ModuleEntitlement,
    RegionalPack,
    RegionalRuleVersion,
    Workspace,
)
from app.db.models.identity import (
    AccessScope,
    AuthSession,
    Permission,
    PlatformUser,
    Role,
    RoleAssignment,
    RolePermission,
    WorkspaceMembership,
)

__all__ = [
    "AccessScope",
    "AuthSession",
    "AuditEntry",
    "Branch",
    "LegalEntity",
    "LegalEntityIdentity",
    "LegalEntityRegionalRule",
    "ModuleDefinition",
    "ModuleEntitlement",
    "Permission",
    "PlatformUser",
    "RegionalPack",
    "RegionalRuleVersion",
    "Role",
    "RoleAssignment",
    "RolePermission",
    "Workspace",
    "WorkspaceMembership",
]
