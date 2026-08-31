from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from uuid import UUID, uuid7

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.db.models import (
    AccessScope,
    AppointmentResource,
    Branch,
    InventoryWarehouse,
    LegalEntity,
    LegalEntityIdentity,
    PaymentMethod,
    Workspace,
)
from app.db.models.agenda import DEFAULT_APPOINTMENT_RESOURCES
from app.repositories.administration import (
    AdministrationRepository,
    LegalEntityFiscalRecord,
)
from app.schemas.administration import (
    BranchDetails,
    FiscalTaxIdentityInput,
    NewLegalEntityFiscalProfile,
)
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)


@dataclass(frozen=True)
class BranchLegalEntityAssignmentResult:
    branch: Branch
    legal_entity: LegalEntityFiscalRecord
    previous_legal_entity_id: UUID


class AdministrationService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = AdministrationRepository(session)

    def workspace_settings(self, grant: PermissionGrant) -> Workspace:
        workspace = self._repository.get_workspace(grant.workspace_id)
        if workspace is None:
            raise ResourceNotFoundError("El workspace no existe.")
        return workspace

    def update_workspace_settings(
        self,
        grant: PermissionGrant,
        *,
        version: int,
        changes: dict[str, object],
    ) -> Workspace:
        self._require_workspace_wide(grant)
        workspace = self._repository.get_workspace(grant.workspace_id, lock=True)
        if workspace is None:
            raise ResourceNotFoundError("El workspace no existe.")
        self._check_version(workspace.version, version)
        for key, value in changes.items():
            setattr(workspace, key, value)
        workspace.version += 1
        self._session.commit()
        return workspace

    def list_legal_entities(
        self,
        grant: PermissionGrant,
    ) -> tuple[LegalEntityFiscalRecord, ...]:
        return self._repository.list_fiscal_records(
            grant.workspace_id,
            grant.allowed_branch_ids,
        )

    def get_legal_entity_profile(
        self,
        grant: PermissionGrant,
        legal_entity_id: UUID,
    ) -> LegalEntityFiscalRecord:
        entity = self._repository.get_legal_entity(grant.workspace_id, legal_entity_id)
        if entity is None or entity.status == "archived":
            raise ResourceNotFoundError("La entidad legal no existe.", "legalEntityId")
        record = self._repository.fiscal_record(entity, grant.allowed_branch_ids)
        if grant.allowed_branch_ids is not None and not record.branches:
            raise AuthorizationError("No puedes consultar esta entidad legal.")
        return record

    def create_legal_entity(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        code: str,
        profile: NewLegalEntityFiscalProfile,
    ) -> LegalEntityFiscalRecord:
        self._require_workspace_wide(grant)
        effective_date = profile.effective_from or datetime.now(UTC).date()
        if effective_date > datetime.now(UTC).date():
            raise InvalidOperationError(
                "La identidad fiscal no puede entrar en vigencia en una fecha futura.",
                "effectiveFrom",
            )
        entity_id = uuid7()
        entity = LegalEntity(
            id=entity_id,
            workspace_id=grant.workspace_id,
            code=code,
            legal_name=profile.legal_name,
            display_name=profile.display_name,
            status="active",
        )
        identity = LegalEntityIdentity(
            workspace_id=grant.workspace_id,
            legal_entity_id=entity_id,
            registered_name=profile.legal_name,
            jurisdiction_code=profile.tax_identity.jurisdiction_code,
            identifier_type=profile.tax_identity.identifier_type,
            identifier_value=profile.tax_identity.identifier_value,
            valid_from=effective_date,
            valid_to=None,
            is_primary=True,
        )
        try:
            self._repository.add_legal_entity(entity)
            self._repository.add_access_scope(
                AccessScope(
                    workspace_id=grant.workspace_id,
                    scope_type="legal_entity",
                    legal_entity_id=entity.id,
                    branch_id=None,
                )
            )
            self._repository.add_legal_entity_identity(identity)
            self._repository.add_audit(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action="legal_entity.create",
                target_type="legal_entity",
                target_id=entity.id,
                request_id=get_request_id(),
                details={
                    "identityId": str(identity.id),
                    "version": entity.version,
                },
            )
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            constraint_name = self._integrity_constraint(exc)
            if constraint_name == "uq_entity_identities_workspace_identifier":
                raise ConflictError(
                    "El RNC ya está asignado a otra entidad legal del workspace.",
                    "taxIdentity.identifierValue",
                ) from exc
            if constraint_name == "uq_legal_entities_workspace_code":
                raise ConflictError(
                    "Ya existe una entidad legal con este código.",
                    "code",
                ) from exc
            raise ConflictError(
                "No se pudo crear la entidad legal por un conflicto de datos."
            ) from exc
        return self._repository.fiscal_record(entity, grant.allowed_branch_ids)

    def update_fiscal_profile(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        legal_entity_id: UUID,
        version: int,
        legal_name: str,
        display_name: str | None,
        tax_identity: FiscalTaxIdentityInput | None,
        effective_from: date | None,
    ) -> LegalEntityFiscalRecord:
        self._require_workspace_wide(grant)
        effective_date = effective_from or datetime.now(UTC).date()
        if effective_date > datetime.now(UTC).date():
            raise InvalidOperationError(
                "La identidad fiscal no puede entrar en vigencia en una fecha futura.",
                "effectiveFrom",
            )
        entity = self._repository.get_legal_entity(
            grant.workspace_id,
            legal_entity_id,
            lock=True,
        )
        if entity is None or entity.status == "archived":
            raise ResourceNotFoundError("La entidad legal no existe.", "legalEntityId")
        self._check_version(entity.version, version)
        current_identity = self._repository.get_current_primary_identity(
            grant.workspace_id,
            legal_entity_id,
            lock=True,
        )
        if current_identity is not None and effective_date < current_identity.valid_from:
            raise InvalidOperationError(
                "La fecha efectiva no puede preceder la identidad fiscal vigente.",
                "effectiveFrom",
            )

        legal_name_changed = entity.legal_name != legal_name
        display_name_changed = entity.display_name != display_name
        requested_identity = (
            None
            if tax_identity is None
            else (
                tax_identity.jurisdiction_code,
                tax_identity.identifier_type,
                tax_identity.identifier_value,
            )
        )
        current_identity_key = (
            None
            if current_identity is None
            else (
                current_identity.jurisdiction_code,
                current_identity.identifier_type,
                current_identity.identifier_value,
            )
        )
        identity_changed = requested_identity != current_identity_key
        if not legal_name_changed and not display_name_changed and not identity_changed:
            return self._repository.fiscal_record(entity, grant.allowed_branch_ids)

        previous_identity_id = current_identity.id if current_identity is not None else None
        next_identity = current_identity
        entity.legal_name = legal_name
        entity.display_name = display_name
        if identity_changed:
            if current_identity is not None:
                # Identity periods are half-open: [valid_from, valid_to). This permits
                # replacing an identity on its first day without an overlap.
                current_identity.valid_to = effective_date
            next_identity = None
            if tax_identity is not None:
                next_identity = LegalEntityIdentity(
                    workspace_id=grant.workspace_id,
                    legal_entity_id=entity.id,
                    registered_name=legal_name,
                    jurisdiction_code=tax_identity.jurisdiction_code,
                    identifier_type=tax_identity.identifier_type,
                    identifier_value=tax_identity.identifier_value,
                    valid_from=effective_date,
                    valid_to=None,
                    is_primary=True,
                )
        elif next_identity is not None and legal_name_changed:
            next_identity.registered_name = legal_name

        try:
            if identity_changed and next_identity is not None:
                self._repository.add_legal_entity_identity(next_identity)
            entity.version += 1
            branch_count = self._repository.fiscal_record(
                entity,
                allowed_branch_ids=None,
            ).branch_count
            self._repository.add_audit(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action="legal_entity.fiscal_profile.update",
                target_type="legal_entity",
                target_id=entity.id,
                request_id=get_request_id(),
                details={
                    "changedFields": sorted(
                        field
                        for field, changed in (
                            ("legalName", legal_name_changed),
                            ("displayName", display_name_changed),
                            ("taxIdentity", identity_changed),
                        )
                        if changed
                    ),
                    "previousIdentityId": (
                        str(previous_identity_id) if previous_identity_id is not None else None
                    ),
                    "currentIdentityId": (
                        str(next_identity.id) if next_identity is not None else None
                    ),
                    "effectiveFrom": effective_date.isoformat(),
                    "affectedBranchCount": branch_count,
                    "version": entity.version,
                },
            )
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            if self._integrity_constraint(exc) == "uq_entity_identities_workspace_identifier":
                raise ConflictError(
                    "El RNC ya está asignado a otra entidad legal del workspace.",
                    "taxIdentity.identifierValue",
                ) from exc
            raise ConflictError(
                "No se pudo actualizar el perfil fiscal por un conflicto de datos."
            ) from exc
        return self._repository.fiscal_record(entity, grant.allowed_branch_ids)

    def update_legal_entity(
        self,
        grant: PermissionGrant,
        legal_entity_id: UUID,
        *,
        version: int,
        changes: dict[str, object],
    ) -> LegalEntityFiscalRecord:
        self._require_workspace_wide(grant)
        entity = self._repository.get_legal_entity(
            grant.workspace_id,
            legal_entity_id,
            lock=True,
        )
        if entity is None:
            raise ResourceNotFoundError("La entidad legal no existe.", "legalEntityId")
        self._check_version(entity.version, version)
        for key, value in changes.items():
            setattr(entity, key, value)
        entity.version += 1
        self._session.commit()
        return self._repository.fiscal_record(entity, grant.allowed_branch_ids)

    def list_branches(self, grant: PermissionGrant) -> tuple[Branch, ...]:
        return tuple(
            self._repository.list_branches(
                grant.workspace_id,
                grant.allowed_branch_ids,
            )
        )

    def create_branch(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        legal_entity_grant: PermissionGrant | None,
        legal_entity_id: UUID | None,
        new_profile: NewLegalEntityFiscalProfile | None,
        code: str,
        name: str,
        timezone: str,
        details: BranchDetails,
    ) -> Branch:
        self._require_workspace_wide(grant)
        if (legal_entity_id is None) == (new_profile is None):
            raise InvalidOperationError("La asignación de entidad legal no es válida.")
        workspace_id = grant.workspace_id
        assignment_type = "new" if new_profile is not None else "existing"
        effective_date: date | None = None
        if new_profile is not None:
            if legal_entity_grant is None:
                raise AuthorizationError("Crear una entidad legal requiere permiso fiscal.")
            self._require_workspace_wide(legal_entity_grant)
            if (
                legal_entity_grant.workspace_id != workspace_id
                or principal.workspace_id != workspace_id
            ):
                raise AuthorizationError("Los permisos no pertenecen al workspace activo.")
            effective_date = new_profile.effective_from or datetime.now(UTC).date()
            if effective_date > datetime.now(UTC).date():
                raise InvalidOperationError(
                    "La identidad fiscal no puede entrar en vigencia en una fecha futura.",
                    "legalEntityAssignment.fiscalProfile.effectiveFrom",
                )
            target_entity_id = uuid7()
            target_entity = LegalEntity(
                id=target_entity_id,
                workspace_id=workspace_id,
                code=f"LE{target_entity_id.hex[:30].upper()}",
                legal_name=new_profile.legal_name,
                display_name=new_profile.display_name,
                status="active",
            )
        else:
            if legal_entity_id is None:
                raise RuntimeError("An existing assignment requires a legal entity id.")
            existing_entity = self._repository.get_legal_entity(
                workspace_id,
                legal_entity_id,
                lock=True,
            )
            if existing_entity is None:
                raise ResourceNotFoundError("La entidad legal no existe.", "legalEntityId")
            if existing_entity.status != "active":
                raise InvalidOperationError(
                    "La entidad legal debe estar activa.",
                    "legalEntityId",
                )
            target_entity = existing_entity

        compatible_details = details.model_copy(
            update={"independent_business": assignment_type == "new"}
        )
        branch = Branch(
            workspace_id=workspace_id,
            legal_entity_id=target_entity.id,
            code=code,
            name=" ".join(name.split()),
            status="active",
            timezone=timezone,
            configuration=compatible_details.model_dump(mode="json"),
        )
        try:
            created_identity: LegalEntityIdentity | None = None
            if new_profile is not None:
                self._repository.add_legal_entity(target_entity)
                self._repository.add_access_scope(
                    AccessScope(
                        workspace_id=workspace_id,
                        scope_type="legal_entity",
                        legal_entity_id=target_entity.id,
                        branch_id=None,
                    )
                )
                if effective_date is None:
                    raise RuntimeError("A new fiscal identity requires an effective date.")
                created_identity = LegalEntityIdentity(
                    workspace_id=workspace_id,
                    legal_entity_id=target_entity.id,
                    registered_name=new_profile.legal_name,
                    jurisdiction_code=new_profile.tax_identity.jurisdiction_code,
                    identifier_type=new_profile.tax_identity.identifier_type,
                    identifier_value=new_profile.tax_identity.identifier_value,
                    valid_from=effective_date,
                    valid_to=None,
                    is_primary=True,
                )
                self._repository.add_legal_entity_identity(created_identity)
            else:
                target_entity.version += 1
            self._repository.add_branch(branch)
            self._session.add(
                InventoryWarehouse(
                    workspace_id=workspace_id,
                    branch_id=branch.id,
                    code="main",
                    name="Almacén principal",
                    is_default=True,
                    status="active",
                )
            )
            self._session.add_all(
                [
                    AppointmentResource(
                        workspace_id=workspace_id,
                        branch_id=branch.id,
                        code=resource_code,
                        name=resource_name,
                        resource_type="room",
                        status="active",
                    )
                    for resource_code, resource_name in DEFAULT_APPOINTMENT_RESOURCES
                ]
            )
            self._repository.add_access_scope(
                AccessScope(
                    workspace_id=workspace_id,
                    scope_type="branch",
                    legal_entity_id=target_entity.id,
                    branch_id=branch.id,
                )
            )
            self._repository.add_audit(
                workspace_id=workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action="branch.create",
                target_type="branch",
                target_id=branch.id,
                request_id=get_request_id(),
                details={
                    "assignmentType": assignment_type,
                    "legalEntityId": str(target_entity.id),
                    "createdIdentityId": (
                        str(created_identity.id) if created_identity is not None else None
                    ),
                    "version": branch.version,
                },
            )
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            constraint_name = self._integrity_constraint(exc)
            if constraint_name == "uq_entity_identities_workspace_identifier":
                raise ConflictError(
                    "El RNC ya está asignado a otra entidad legal del workspace.",
                    "legalEntityAssignment.fiscalProfile.taxIdentity.identifierValue",
                ) from exc
            if constraint_name == "uq_branches_workspace_code":
                raise ConflictError("Ya existe una sucursal con este código.", "code") from exc
            raise ConflictError("No se pudo crear la sucursal por un conflicto de datos.") from exc
        return branch

    def update_branch(
        self,
        grant: PermissionGrant,
        branch_id: UUID,
        *,
        version: int,
        changes: dict[str, object],
    ) -> Branch:
        self._require_branch_access(grant, branch_id)
        normalized_changes = dict(changes)
        requested_status = normalized_changes.get("status")
        if requested_status == "inactive":
            workspace = self._repository.get_workspace_no_key_update(grant.workspace_id)
            if workspace is None:
                raise ResourceNotFoundError("El workspace no existe.")
        branch = self._repository.get_branch(grant.workspace_id, branch_id, lock=True)
        if branch is None or branch.status == "archived":
            raise ResourceNotFoundError("La sucursal no existe.", "branchId")
        self._check_version(branch.version, version)
        if (
            branch.status == "active"
            and requested_status == "inactive"
            and self._repository.active_branch_count(grant.workspace_id) <= 1
        ):
            raise ConflictError("Debe existir al menos una sucursal activa.", "status")
        details = normalized_changes.pop("details", None)
        for key, value in normalized_changes.items():
            setattr(branch, key, value)
        if isinstance(details, dict):
            merged_details = dict(branch.configuration or {})
            merged_details.update(details)
            branch.configuration = BranchDetails.model_validate(merged_details).model_dump(
                mode="json"
            )
        branch.version += 1
        self._session.commit()
        return branch

    def assign_branch_legal_entity(
        self,
        *,
        principal: AuthPrincipal,
        branch_grant: PermissionGrant,
        legal_entity_grant: PermissionGrant,
        branch_id: UUID,
        version: int,
        target_legal_entity_id: UUID | None,
        new_profile: NewLegalEntityFiscalProfile | None,
    ) -> BranchLegalEntityAssignmentResult:
        self._require_workspace_wide(branch_grant)
        self._require_workspace_wide(legal_entity_grant)
        if (
            branch_grant.workspace_id != legal_entity_grant.workspace_id
            or branch_grant.workspace_id != principal.workspace_id
        ):
            raise AuthorizationError("Los permisos no pertenecen al workspace activo.")
        if (target_legal_entity_id is None) == (new_profile is None):
            raise InvalidOperationError(
                "La asignación de entidad legal no es válida.",
                "assignment",
            )

        workspace_id = branch_grant.workspace_id
        branch = self._repository.get_branch(workspace_id, branch_id, lock=True)
        if branch is None or branch.status == "archived":
            raise ResourceNotFoundError("La sucursal no existe.", "branchId")
        self._check_version(branch.version, version)
        previous_legal_entity_id = branch.legal_entity_id

        if target_legal_entity_id is not None:
            locked_entities: dict[UUID, LegalEntity] = {}
            for entity_id in sorted(
                {previous_legal_entity_id, target_legal_entity_id},
                key=lambda value: value.int,
            ):
                entity = self._repository.get_legal_entity(
                    workspace_id,
                    entity_id,
                    lock=True,
                )
                if entity is not None:
                    locked_entities[entity_id] = entity
            source_entity = locked_entities.get(previous_legal_entity_id)
            target_entity = locked_entities.get(target_legal_entity_id)
            if source_entity is None:
                raise RuntimeError("A branch must reference an existing legal entity.")
            if target_entity is None:
                raise ResourceNotFoundError(
                    "La entidad legal destino no existe.",
                    "assignment.legalEntityId",
                )
            if target_entity.status != "active":
                raise InvalidOperationError(
                    "La entidad legal destino debe estar activa.",
                    "assignment.legalEntityId",
                )
            effective_date = None
            assignment_type = "existing"
        else:
            source_entity = self._repository.get_legal_entity(
                workspace_id,
                previous_legal_entity_id,
                lock=True,
            )
            if source_entity is None:
                raise RuntimeError("A branch must reference an existing legal entity.")
            if new_profile is None:
                raise RuntimeError("A new assignment requires a fiscal profile.")
            effective_date = new_profile.effective_from or datetime.now(UTC).date()
            if effective_date > datetime.now(UTC).date():
                raise InvalidOperationError(
                    "La identidad fiscal no puede entrar en vigencia en una fecha futura.",
                    "assignment.fiscalProfile.effectiveFrom",
                )
            target_entity_id = uuid7()
            target_entity = LegalEntity(
                id=target_entity_id,
                workspace_id=workspace_id,
                code=f"LE{target_entity_id.hex[:30].upper()}",
                legal_name=new_profile.legal_name,
                display_name=new_profile.display_name,
                status="active",
            )
            assignment_type = "new"

        try:
            branch_scope = self._repository.get_branch_scope(workspace_id, branch.id, lock=True)
            if branch_scope is None:
                self._repository.add_access_scope(
                    AccessScope(
                        workspace_id=workspace_id,
                        scope_type="branch",
                        legal_entity_id=previous_legal_entity_id,
                        branch_id=branch.id,
                    )
                )

            if target_entity.id == previous_legal_entity_id:
                self._session.commit()
                return BranchLegalEntityAssignmentResult(
                    branch=branch,
                    legal_entity=self._repository.fiscal_record(
                        target_entity,
                        branch_grant.allowed_branch_ids,
                    ),
                    previous_legal_entity_id=previous_legal_entity_id,
                )

            created_identity: LegalEntityIdentity | None = None
            if new_profile is not None:
                self._repository.add_legal_entity(target_entity)
                self._repository.add_access_scope(
                    AccessScope(
                        workspace_id=workspace_id,
                        scope_type="legal_entity",
                        legal_entity_id=target_entity.id,
                        branch_id=None,
                    )
                )
                if effective_date is None:
                    raise RuntimeError("A new fiscal identity requires an effective date.")
                created_identity = LegalEntityIdentity(
                    workspace_id=workspace_id,
                    legal_entity_id=target_entity.id,
                    registered_name=new_profile.legal_name,
                    jurisdiction_code=new_profile.tax_identity.jurisdiction_code,
                    identifier_type=new_profile.tax_identity.identifier_type,
                    identifier_value=new_profile.tax_identity.identifier_value,
                    valid_from=effective_date,
                    valid_to=None,
                    is_primary=True,
                )
                self._repository.add_legal_entity_identity(created_identity)
            elif (
                self._repository.get_legal_entity_scope(
                    workspace_id,
                    target_entity.id,
                    lock=True,
                )
                is None
            ):
                self._repository.add_access_scope(
                    AccessScope(
                        workspace_id=workspace_id,
                        scope_type="legal_entity",
                        legal_entity_id=target_entity.id,
                        branch_id=None,
                    )
                )

            # This JSON field remains a compatibility hint for the current UI. The
            # legal_entity_id relationship is the fiscal source of truth.
            branch_details = self.branch_details(branch).model_copy(
                update={"independent_business": assignment_type == "new"}
            )
            branch.configuration = branch_details.model_dump(mode="json")
            branch.legal_entity_id = target_entity.id
            branch.version += 1
            source_entity.version += 1
            if assignment_type == "existing":
                target_entity.version += 1

            self._repository.add_audit(
                workspace_id=workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action="branch.legal_entity_assignment.update",
                target_type="branch",
                target_id=branch.id,
                request_id=get_request_id(),
                details={
                    "assignmentType": assignment_type,
                    "previousLegalEntityId": str(previous_legal_entity_id),
                    "currentLegalEntityId": str(target_entity.id),
                    "createdIdentityId": (
                        str(created_identity.id) if created_identity is not None else None
                    ),
                    "branchVersion": branch.version,
                    "sourceLegalEntityVersion": source_entity.version,
                    "targetLegalEntityVersion": target_entity.version,
                },
            )
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            if self._integrity_constraint(exc) == "uq_entity_identities_workspace_identifier":
                raise ConflictError(
                    "El RNC ya está asignado a otra entidad legal del workspace.",
                    "assignment.fiscalProfile.taxIdentity.identifierValue",
                ) from exc
            raise ConflictError(
                "No se pudo reasignar la sucursal por un conflicto de datos."
            ) from exc

        return BranchLegalEntityAssignmentResult(
            branch=branch,
            legal_entity=self._repository.fiscal_record(
                target_entity,
                branch_grant.allowed_branch_ids,
            ),
            previous_legal_entity_id=previous_legal_entity_id,
        )

    def archive_branch(
        self,
        grant: PermissionGrant,
        branch_id: UUID,
        version: int,
    ) -> None:
        self._require_branch_access(grant, branch_id)
        # FOR NO KEY UPDATE is a workspace-level mutex for archive operations,
        # while remaining compatible with the KEY SHARE locks used by FK checks
        # in branch creation and reassignment. The lock order is workspace then
        # branch, and the second archive re-evaluates the count after the first.
        workspace = self._repository.get_workspace_no_key_update(grant.workspace_id)
        if workspace is None:
            raise ResourceNotFoundError("El workspace no existe.")
        branch = self._repository.get_branch(grant.workspace_id, branch_id, lock=True)
        if branch is None or branch.status == "archived":
            raise ResourceNotFoundError("La sucursal no existe.", "branchId")
        self._check_version(branch.version, version)
        if (
            branch.status == "active"
            and self._repository.active_branch_count(grant.workspace_id) <= 1
        ):
            raise ConflictError("Debe existir al menos una sucursal activa.")
        branch.status = "archived"
        branch.version += 1
        self._session.commit()

    def list_payment_methods(self, grant: PermissionGrant) -> tuple[PaymentMethod, ...]:
        return tuple(self._repository.list_payment_methods(grant.workspace_id))

    def create_payment_method(
        self,
        grant: PermissionGrant,
        *,
        code: str,
        name: str,
        icon: str,
    ) -> PaymentMethod:
        self._require_workspace_wide(grant)
        method = PaymentMethod(
            workspace_id=grant.workspace_id,
            code=code,
            name=" ".join(name.split()),
            icon=icon,
            status="active",
            is_system=False,
        )
        try:
            self._repository.add_payment_method(method)
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("Ya existe un método con este código.", "code") from exc
        return method

    def update_payment_method(
        self,
        grant: PermissionGrant,
        payment_method_id: UUID,
        *,
        version: int,
        changes: dict[str, object],
    ) -> PaymentMethod:
        self._require_workspace_wide(grant)
        method = self._repository.get_payment_method(
            grant.workspace_id,
            payment_method_id,
            lock=True,
        )
        if method is None or method.status == "archived":
            raise ResourceNotFoundError("El método de pago no existe.", "paymentMethodId")
        self._check_version(method.version, version)
        for key, value in changes.items():
            setattr(method, key, value)
        method.version += 1
        self._session.commit()
        return method

    def archive_payment_method(
        self,
        grant: PermissionGrant,
        payment_method_id: UUID,
        version: int,
    ) -> None:
        self._require_workspace_wide(grant)
        method = self._repository.get_payment_method(
            grant.workspace_id,
            payment_method_id,
            lock=True,
        )
        if method is None or method.status == "archived":
            raise ResourceNotFoundError("El método de pago no existe.", "paymentMethodId")
        self._check_version(method.version, version)
        if method.is_system:
            raise InvalidOperationError(
                "Los métodos de sistema se desactivan, no se archivan.",
                "paymentMethodId",
            )
        method.status = "archived"
        method.version += 1
        self._session.commit()

    @staticmethod
    def branch_details(branch: Branch) -> BranchDetails:
        return BranchDetails.model_validate(branch.configuration or {})

    @staticmethod
    def _check_version(current: int, expected: int) -> None:
        if current != expected:
            raise ConflictError("El registro fue modificado por otra sesión.", "version")

    @staticmethod
    def _integrity_constraint(exc: IntegrityError) -> str | None:
        diagnostic = getattr(exc.orig, "diag", None)
        constraint_name = getattr(diagnostic, "constraint_name", None)
        return constraint_name if isinstance(constraint_name, str) else None

    @staticmethod
    def _require_workspace_wide(grant: PermissionGrant) -> None:
        if not grant.workspace_wide:
            raise AuthorizationError("Esta acción requiere alcance de workspace.")

    @staticmethod
    def _require_branch_access(grant: PermissionGrant, branch_id: UUID) -> None:
        if grant.allowed_branch_ids is not None and branch_id not in grant.allowed_branch_ids:
            raise AuthorizationError("No puedes administrar esta sucursal.")
