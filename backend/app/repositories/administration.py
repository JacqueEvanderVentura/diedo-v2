from collections import defaultdict
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    AccessScope,
    AuditEntry,
    Branch,
    LegalEntity,
    LegalEntityIdentity,
    PaymentMethod,
    Workspace,
)


@dataclass(frozen=True)
class LegalEntityFiscalRecord:
    entity: LegalEntity
    tax_identity: LegalEntityIdentity | None
    branches: tuple[Branch, ...]
    branch_count: int


class AdministrationRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_workspace(self, workspace_id: UUID, *, lock: bool = False) -> Workspace | None:
        statement = select(Workspace).where(Workspace.id == workspace_id)
        if lock:
            statement = statement.with_for_update()
        return self._session.scalar(statement)

    def get_workspace_no_key_update(self, workspace_id: UUID) -> Workspace | None:
        statement = (
            select(Workspace).where(Workspace.id == workspace_id).with_for_update(key_share=True)
        )
        return self._session.scalar(statement)

    def get_legal_entity(
        self,
        workspace_id: UUID,
        legal_entity_id: UUID,
        *,
        lock: bool = False,
    ) -> LegalEntity | None:
        statement = select(LegalEntity).where(
            LegalEntity.workspace_id == workspace_id,
            LegalEntity.id == legal_entity_id,
        )
        if lock:
            statement = statement.with_for_update()
        return self._session.scalar(statement)

    def list_legal_entities(
        self,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> list[LegalEntity]:
        statement = select(LegalEntity).where(
            LegalEntity.workspace_id == workspace_id,
            LegalEntity.status != "archived",
        )
        if allowed_branch_ids is not None:
            statement = (
                statement.join(
                    Branch,
                    (Branch.workspace_id == LegalEntity.workspace_id)
                    & (Branch.legal_entity_id == LegalEntity.id),
                )
                .where(
                    Branch.id.in_(allowed_branch_ids),
                    Branch.status != "archived",
                )
                .distinct()
            )
        return list(
            self._session.scalars(statement.order_by(LegalEntity.legal_name, LegalEntity.id))
        )

    def fiscal_record(
        self,
        entity: LegalEntity,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> LegalEntityFiscalRecord:
        branch_statement = select(Branch).where(
            Branch.workspace_id == entity.workspace_id,
            Branch.legal_entity_id == entity.id,
            Branch.status != "archived",
        )
        if allowed_branch_ids is not None:
            branch_statement = branch_statement.where(Branch.id.in_(allowed_branch_ids))
        branches = tuple(self._session.scalars(branch_statement.order_by(Branch.name, Branch.id)))
        return LegalEntityFiscalRecord(
            entity=entity,
            tax_identity=self.get_current_primary_identity(entity.workspace_id, entity.id),
            branches=branches,
            branch_count=len(branches),
        )

    def list_fiscal_records(
        self,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> tuple[LegalEntityFiscalRecord, ...]:
        entities = self.list_legal_entities(workspace_id, allowed_branch_ids)
        if not entities:
            return ()
        entity_ids = {entity.id for entity in entities}
        identities_by_entity = {
            identity.legal_entity_id: identity
            for identity in self._session.scalars(
                select(LegalEntityIdentity).where(
                    LegalEntityIdentity.workspace_id == workspace_id,
                    LegalEntityIdentity.legal_entity_id.in_(entity_ids),
                    LegalEntityIdentity.is_primary.is_(True),
                    LegalEntityIdentity.valid_to.is_(None),
                )
            )
        }

        branch_statement = select(Branch).where(
            Branch.workspace_id == workspace_id,
            Branch.legal_entity_id.in_(entity_ids),
            Branch.status != "archived",
        )
        if allowed_branch_ids is not None:
            branch_statement = branch_statement.where(Branch.id.in_(allowed_branch_ids))
        branches_by_entity: dict[UUID, list[Branch]] = defaultdict(list)
        for branch in self._session.scalars(
            branch_statement.order_by(Branch.legal_entity_id, Branch.name, Branch.id)
        ):
            branches_by_entity[branch.legal_entity_id].append(branch)

        return tuple(
            LegalEntityFiscalRecord(
                entity=entity,
                tax_identity=identities_by_entity.get(entity.id),
                branches=tuple(branches_by_entity.get(entity.id, ())),
                branch_count=len(branches_by_entity.get(entity.id, ())),
            )
            for entity in entities
        )

    def get_current_primary_identity(
        self,
        workspace_id: UUID,
        legal_entity_id: UUID,
        *,
        lock: bool = False,
    ) -> LegalEntityIdentity | None:
        statement = select(LegalEntityIdentity).where(
            LegalEntityIdentity.workspace_id == workspace_id,
            LegalEntityIdentity.legal_entity_id == legal_entity_id,
            LegalEntityIdentity.is_primary.is_(True),
            LegalEntityIdentity.valid_to.is_(None),
        )
        if lock:
            statement = statement.with_for_update()
        return self._session.scalar(statement)

    def add_legal_entity_identity(self, identity: LegalEntityIdentity) -> None:
        self._session.add(identity)
        self._session.flush()

    def add_legal_entity(self, entity: LegalEntity) -> None:
        self._session.add(entity)
        self._session.flush()

    def get_legal_entity_scope(
        self,
        workspace_id: UUID,
        legal_entity_id: UUID,
        *,
        lock: bool = False,
    ) -> AccessScope | None:
        statement = select(AccessScope).where(
            AccessScope.workspace_id == workspace_id,
            AccessScope.scope_type == "legal_entity",
            AccessScope.legal_entity_id == legal_entity_id,
        )
        if lock:
            statement = statement.with_for_update()
        return self._session.scalar(statement)

    def get_branch_scope(
        self,
        workspace_id: UUID,
        branch_id: UUID,
        *,
        lock: bool = False,
    ) -> AccessScope | None:
        statement = select(AccessScope).where(
            AccessScope.workspace_id == workspace_id,
            AccessScope.scope_type == "branch",
            AccessScope.branch_id == branch_id,
        )
        if lock:
            statement = statement.with_for_update()
        return self._session.scalar(statement)

    def add_access_scope(self, scope: AccessScope) -> None:
        self._session.add(scope)
        self._session.flush()

    def add_audit(
        self,
        *,
        workspace_id: UUID,
        actor_platform_user_id: UUID,
        action: str,
        target_type: str,
        target_id: UUID,
        request_id: str,
        details: dict[str, object],
    ) -> None:
        self._session.add(
            AuditEntry(
                workspace_id=workspace_id,
                actor_platform_user_id=actor_platform_user_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                outcome="success",
                request_id=request_id or None,
                details=details,
            )
        )

    def list_branches(
        self,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        *,
        include_archived: bool = False,
    ) -> list[Branch]:
        statement = select(Branch).where(Branch.workspace_id == workspace_id)
        if allowed_branch_ids is not None:
            statement = statement.where(Branch.id.in_(allowed_branch_ids))
        if not include_archived:
            statement = statement.where(Branch.status != "archived")
        return list(self._session.scalars(statement.order_by(Branch.name, Branch.id)))

    def get_branch(
        self,
        workspace_id: UUID,
        branch_id: UUID,
        *,
        lock: bool = False,
    ) -> Branch | None:
        statement = select(Branch).where(
            Branch.workspace_id == workspace_id,
            Branch.id == branch_id,
        )
        if lock:
            statement = statement.with_for_update()
        return self._session.scalar(statement)

    def active_branch_count(self, workspace_id: UUID) -> int:
        return (
            self._session.scalar(
                select(func.count(Branch.id)).where(
                    Branch.workspace_id == workspace_id,
                    Branch.status == "active",
                )
            )
            or 0
        )

    def add_branch(self, branch: Branch) -> None:
        self._session.add(branch)
        self._session.flush()

    def list_payment_methods(self, workspace_id: UUID) -> list[PaymentMethod]:
        return list(
            self._session.scalars(
                select(PaymentMethod)
                .where(
                    PaymentMethod.workspace_id == workspace_id,
                    PaymentMethod.status != "archived",
                )
                .order_by(PaymentMethod.is_system.desc(), PaymentMethod.name, PaymentMethod.id)
            )
        )

    def get_payment_method(
        self,
        workspace_id: UUID,
        payment_method_id: UUID,
        *,
        lock: bool = False,
    ) -> PaymentMethod | None:
        statement = select(PaymentMethod).where(
            PaymentMethod.workspace_id == workspace_id,
            PaymentMethod.id == payment_method_id,
        )
        if lock:
            statement = statement.with_for_update()
        return self._session.scalar(statement)

    def add_payment_method(self, payment_method: PaymentMethod) -> None:
        self._session.add(payment_method)
        self._session.flush()
