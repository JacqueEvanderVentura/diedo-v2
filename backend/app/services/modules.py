from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.orm import Session

from app.repositories.modules import ModuleAccessRepository
from app.services.errors import AuthorizationError


class ModuleAccessService:
    """Resolve effective modules from availability, entitlement dates, and dependencies."""

    def __init__(self, session: Session) -> None:
        self._repository = ModuleAccessRepository(session)

    def enabled_modules(self, workspace_id: UUID, *, now: datetime | None = None) -> frozenset[str]:
        instant = now or datetime.now(UTC)
        records = self._repository.list_access_records(workspace_id)
        enabled = {
            record.code
            for record in records
            if record.definition_status == "available"
            and record.entitlement_status == "enabled"
            and record.effective_from is not None
            and record.effective_from <= instant
            and (record.effective_until is None or record.effective_until >= instant)
        }
        dependencies = {record.code: set(record.dependency_codes) for record in records}
        while True:
            invalid = {code for code in enabled if not dependencies.get(code, set()) <= enabled}
            if not invalid:
                break
            enabled -= invalid
        return frozenset(enabled)

    def require_module(self, workspace_id: UUID, module_code: str) -> None:
        if module_code not in self.enabled_modules(workspace_id):
            raise AuthorizationError("El módulo no está habilitado para este workspace.")

    def module_for_permission(self, permission_code: str) -> str | None:
        return self._repository.module_code_for_permission(permission_code)
