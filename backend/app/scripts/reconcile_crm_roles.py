"""Preview/apply missing dependencies only to unmodified standard roles in one workspace."""

import argparse
import json
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AuditEntry, Permission, Role, RolePermission
from app.db.session import session_scope
from app.services.role_templates import LEGACY_ROLE_PERMISSIONS, ROLE_PERMISSIONS


def reconcile(session: Session, workspace_id: UUID, *, apply: bool = False) -> list[dict]:
    permissions = list(session.scalars(select(Permission)))
    by_code = {p.code: p for p in permissions}
    result = []
    roles = session.scalars(select(Role).where(Role.workspace_id == workspace_id).with_for_update())
    for role in roles:
        if role.code not in ROLE_PERMISSIONS or not role.is_system:
            continue
        current = set(
            session.scalars(
                select(Permission.code)
                .join(
                    RolePermission,
                    RolePermission.permission_id == Permission.id,
                )
                .where(
                    RolePermission.workspace_id == workspace_id, RolePermission.role_id == role.id
                )
            )
        )
        commercial = {
            p.code
            for p in permissions
            if role.code == "manager" and p.module_code in {"sales", "pos"}
        }
        previous = set(LEGACY_ROLE_PERMISSIONS[role.code]) | commercial
        target = set(ROLE_PERMISSIONS[role.code]) | commercial
        customized = current not in (previous, target)
        missing = sorted(target - current) if not customized else []
        result.append(
            {
                "roleId": str(role.id),
                "role": role.code,
                "status": "customized-skipped" if customized else "standard",
                "add": missing,
                "applied": apply and bool(missing),
            }
        )
        if apply and missing:
            for code in missing:
                session.add(
                    RolePermission(
                        workspace_id=workspace_id, role_id=role.id, permission_id=by_code[code].id
                    )
                )
            role.version += 1
            session.add(
                AuditEntry(
                    workspace_id=workspace_id,
                    action="crm.roles.reconcile",
                    target_type="role",
                    target_id=role.id,
                    outcome="success",
                    details={"added": missing, "previous": sorted(current)},
                )
            )
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-id", type=UUID, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    with session_scope() as session:
        print(json.dumps(reconcile(session, args.workspace_id, apply=args.apply), indent=2))
        if args.apply:
            session.commit()
        else:
            session.rollback()
