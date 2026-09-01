from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from math import ceil
from typing import Any, cast
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.db.models import (
    CrmActivity,
    CrmLead,
    CrmOpportunity,
    CrmSettings,
    CustomerCrmProfile,
)
from app.repositories.crm import (
    CrmRepository,
    CustomerCrmRecord,
    EntityPage,
    LeadRecord,
    OpportunityRecord,
    OverviewValues,
)
from app.repositories.master_data import MasterDataRepository
from app.repositories.pos import Page as PosPage
from app.repositories.pos import QuoteRecord, SaleRecord
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.crm_scoring import (
    DEFAULT_SCORING_WEIGHTS,
    SERP_HOUR_LIMIT,
    SERP_MONTH_LIMIT,
    compute_auto_score,
)
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)
from app.services.master_data import normalize_email, normalize_name, normalize_phone
from app.services.pos import PosService


@dataclass(frozen=True)
class PageResult:
    items: tuple[Any, ...]
    page: int
    page_size: int
    total_items: int
    total_pages: int


@dataclass(frozen=True)
class ScoringSettingsRecord:
    settings: CrmSettings
    hour_limit: int = SERP_HOUR_LIMIT
    month_limit: int = SERP_MONTH_LIMIT


@dataclass(frozen=True)
class OverviewRecord:
    branch_id: UUID | None
    values: OverviewValues
    generated_at: datetime


class CrmService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = CrmRepository(session)
        self._master_data = MasterDataRepository(session)

    def scoring_settings(self, grant: PermissionGrant) -> ScoringSettingsRecord:
        return ScoringSettingsRecord(self._required_settings(grant.workspace_id))

    def update_scoring_settings(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        expected_version: int,
        weights: dict[str, float],
    ) -> ScoringSettingsRecord:
        settings = self._repository.settings(grant.workspace_id, lock=True)
        if settings is None:
            settings = self._new_settings(grant.workspace_id, principal.platform_user_id)
        self._require_version(settings.version, expected_version)
        settings.scoring_weights = dict(weights)
        settings.updated_by_platform_user_id = principal.platform_user_id
        settings.version += 1
        for lead in self._repository.workspace_leads(grant.workspace_id):
            self._apply_score(lead, weights)
            lead.updated_by_platform_user_id = principal.platform_user_id
            lead.version += 1
        self._audit(
            principal,
            "crm.settings.update",
            "crm_settings",
            settings.id,
            {"version": settings.version},
        )
        self._session.commit()
        return ScoringSettingsRecord(settings)

    def list_leads(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        status: str | None,
        source: str | None,
        search: str | None,
        page: int,
        page_size: int,
    ) -> PageResult:
        self._require_optional_branch(grant, branch_id)
        result = self._repository.list_leads(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            status=status,
            source=source,
            search=self._optional_text(search),
            page=page,
            page_size=page_size,
        )
        return self._page(result, page, page_size)

    def get_lead(self, grant: PermissionGrant, lead_id: UUID) -> LeadRecord:
        lead = self._repository.lead(grant.workspace_id, lead_id, grant.allowed_branch_ids)
        if lead is None:
            raise ResourceNotFoundError("El lead no existe.", "leadId")
        return self._repository.lead_record(lead)

    def create_lead(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> LeadRecord:
        fingerprint = self._fingerprint(values)
        existing = self._repository.lead_by_key(grant.workspace_id, idempotency_key)
        if existing is not None:
            self._require_branch(grant, existing.branch_id)
            self._require_fingerprint(existing.request_fingerprint, fingerprint)
            return self._repository.lead_record(existing)
        settings = self._required_settings(grant.workspace_id)
        lead = self._build_lead(
            principal=principal,
            grant=grant,
            values=values,
            idempotency_key=idempotency_key,
            fingerprint=fingerprint,
            weights=cast(dict[str, float], settings.scoring_weights),
        )
        try:
            self._repository.add_lead(lead)
            self._audit(
                principal,
                "crm.lead.create",
                "crm_lead",
                lead.id,
                {"branchId": str(lead.branch_id), "source": lead.source},
            )
            self._session.commit()
            return self._repository.lead_record(lead)
        except IntegrityError as exc:
            self._session.rollback()
            replay = self._repository.lead_by_key(grant.workspace_id, idempotency_key)
            if replay is not None:
                self._require_branch(grant, replay.branch_id)
                self._require_fingerprint(replay.request_fingerprint, fingerprint)
                return self._repository.lead_record(replay)
            raise ConflictError("No se pudo crear el lead.") from exc

    def import_leads(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> tuple[LeadRecord, ...]:
        outer_branch = cast(UUID, values["branch_id"])
        self._require_branch(grant, outer_branch)
        settings = self._required_settings(grant.workspace_id)
        records: list[LeadRecord] = []
        try:
            for index, raw in enumerate(cast(list[dict[str, Any]], values["items"]), start=1):
                item = dict(raw)
                item["branch_id"] = outer_branch
                item["source"] = values.get("source", item.get("source", "import"))
                if values.get("assigned_membership_id") is not None:
                    item["assigned_membership_id"] = values["assigned_membership_id"]
                key = f"{idempotency_key[:118]}:{index}"
                fingerprint = self._fingerprint(item)
                existing = self._repository.lead_by_key(grant.workspace_id, key)
                if existing is not None:
                    self._require_fingerprint(existing.request_fingerprint, fingerprint)
                    records.append(self._repository.lead_record(existing))
                    continue
                lead = self._build_lead(
                    principal=principal,
                    grant=grant,
                    values=item,
                    idempotency_key=key,
                    fingerprint=fingerprint,
                    weights=cast(dict[str, float], settings.scoring_weights),
                )
                self._repository.add_lead(lead)
                records.append(self._repository.lead_record(lead))
            self._audit(
                principal,
                "crm.lead.import",
                "crm_lead_batch",
                records[0].lead.id,
                {"branchId": str(outer_branch), "count": len(records)},
            )
            self._session.commit()
            return tuple(records)
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudieron importar los leads.") from exc

    def update_lead(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        lead_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> LeadRecord:
        lead = self._repository.lead(
            grant.workspace_id, lead_id, grant.allowed_branch_ids, lock=True
        )
        if lead is None:
            raise ResourceNotFoundError("El lead no existe.", "leadId")
        if lead.status == "convertido":
            raise ConflictError("Un lead convertido ya no puede editarse.", "status")
        self._require_version(lead.version, expected_version)
        if "assigned_membership_id" in changes:
            assignee = changes["assigned_membership_id"]
            lead.assigned_membership_id = self._assignee(
                grant.workspace_id, cast(UUID | None, assignee), grant.membership_id
            )
        for field in (
            "name",
            "company",
            "email",
            "phone",
            "website",
            "location",
            "status",
            "score_manual",
            "score_notes",
            "raw_snippet",
        ):
            if field in changes:
                value = changes[field]
                setattr(
                    lead, field, str(value) if field in {"email", "website"} and value else value
                )
        if not lead.name and not lead.company:
            raise InvalidOperationError("El lead requiere nombre o empresa.", "name")
        self._apply_score(
            lead,
            cast(dict[str, float], self._required_settings(grant.workspace_id).scoring_weights),
        )
        lead.updated_by_platform_user_id = principal.platform_user_id
        lead.version += 1
        self._audit(
            principal,
            "crm.lead.update",
            "crm_lead",
            lead.id,
            {"changedFields": sorted(changes), "version": lead.version},
        )
        self._session.commit()
        return self._repository.lead_record(lead)

    def list_opportunities(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        stage: str | None,
        customer_id: UUID | None,
        search: str | None,
        page: int,
        page_size: int,
    ) -> PageResult:
        self._require_optional_branch(grant, branch_id)
        return self._page(
            self._repository.list_opportunities(
                workspace_id=grant.workspace_id,
                allowed_branch_ids=grant.allowed_branch_ids,
                branch_id=branch_id,
                stage=stage,
                customer_id=customer_id,
                search=self._optional_text(search),
                page=page,
                page_size=page_size,
            ),
            page,
            page_size,
        )

    def get_opportunity(self, grant: PermissionGrant, opportunity_id: UUID) -> OpportunityRecord:
        opportunity = self._repository.opportunity(
            grant.workspace_id, opportunity_id, grant.allowed_branch_ids
        )
        if opportunity is None:
            raise ResourceNotFoundError("La oportunidad no existe.", "opportunityId")
        return self._repository.opportunity_record(opportunity)

    def create_opportunity(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> OpportunityRecord:
        fingerprint = self._fingerprint(values)
        existing = self._repository.opportunity_by_key(grant.workspace_id, idempotency_key)
        if existing is not None:
            self._require_branch(grant, existing.branch_id)
            self._require_fingerprint(existing.request_fingerprint, fingerprint)
            return self._repository.opportunity_record(existing)
        branch_id = cast(UUID, values["branch_id"])
        self._require_branch(grant, branch_id)
        lead_id = cast(UUID | None, values.get("lead_id"))
        lead = None
        if lead_id is not None:
            lead = self._repository.lead(
                grant.workspace_id, lead_id, grant.allowed_branch_ids, lock=True
            )
            if lead is None:
                raise ResourceNotFoundError("El lead no existe.", "leadId")
            if lead.branch_id != branch_id:
                raise InvalidOperationError(
                    "El lead y la oportunidad deben pertenecer a la misma sucursal.", "branchId"
                )
            if self._repository.opportunity_for_lead(grant.workspace_id, lead.id) is not None:
                raise ConflictError("El lead ya tiene una oportunidad.", "leadId")
        customer_id = cast(UUID | None, values.get("customer_id"))
        customer = None
        if customer_id is not None:
            customer = self._repository.customer(
                grant.workspace_id,
                customer_id,
                branch_id=branch_id,
                allowed_branch_ids=grant.allowed_branch_ids,
            )
            if customer is None:
                raise ResourceNotFoundError("El cliente no existe en la sucursal.", "customerId")
        workspace = self._repository.workspace(grant.workspace_id)
        if workspace is None:
            raise ResourceNotFoundError("El workspace no existe.", "workspaceId")
        stage = cast(str, values.get("stage", "nuevo"))
        lost_reason = self._optional_text(cast(str | None, values.get("lost_reason")))
        if stage == "perdido" and not lost_reason:
            raise InvalidOperationError("Una oportunidad perdida requiere motivo.", "lostReason")
        opportunity = CrmOpportunity(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            lead_id=lead.id if lead else None,
            customer_id=customer.id if customer else None,
            assigned_membership_id=self._assignee(
                grant.workspace_id,
                cast(UUID | None, values.get("assigned_membership_id")),
                grant.membership_id,
            ),
            title=cast(str, values["title"]),
            customer_name=(
                customer.display_name if customer else cast(str, values["customer_name"])
            ),
            stage=stage,
            value=cast(Decimal, values.get("value", Decimal("0"))),
            currency_code=workspace.default_currency,
            notes=self._optional_text(cast(str | None, values.get("notes"))),
            lost_reason=lost_reason,
            closed_at=datetime.now(UTC) if stage in {"cerrado", "perdido"} else None,
            creation_idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            created_by_platform_user_id=principal.platform_user_id,
            updated_by_platform_user_id=principal.platform_user_id,
        )
        if lead is not None and lead.status == "nuevo":
            lead.status = "contactado"
            lead.updated_by_platform_user_id = principal.platform_user_id
            lead.version += 1
        try:
            self._repository.add_opportunity(opportunity)
            self._audit(
                principal,
                "crm.opportunity.create",
                "crm_opportunity",
                opportunity.id,
                {"branchId": str(branch_id), "stage": stage},
            )
            self._session.commit()
            return self._repository.opportunity_record(opportunity)
        except IntegrityError as exc:
            self._session.rollback()
            replay = self._repository.opportunity_by_key(grant.workspace_id, idempotency_key)
            if replay is not None:
                self._require_fingerprint(replay.request_fingerprint, fingerprint)
                return self._repository.opportunity_record(replay)
            raise ConflictError("No se pudo crear la oportunidad.") from exc

    def create_opportunity_for_lead(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        lead_id: UUID,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> OpportunityRecord:
        lead = self._repository.lead(grant.workspace_id, lead_id, grant.allowed_branch_ids)
        if lead is None:
            raise ResourceNotFoundError("El lead no existe.", "leadId")
        payload = {
            "branch_id": lead.branch_id,
            "lead_id": lead.id,
            "customer_id": lead.converted_customer_id,
            "assigned_membership_id": lead.assigned_membership_id,
            "title": values.get("title") or f"{lead.company or lead.name} — Oportunidad",
            "customer_name": lead.company or lead.name,
            "stage": values.get("stage")
            or ("propuesta" if lead.status == "calificado" else "contactado"),
            "value": values.get("value")
            if values.get("value") is not None
            else Decimal(lead.score * 500),
            "notes": values.get("notes") or lead.score_notes,
        }
        return self.create_opportunity(
            principal=principal,
            grant=grant,
            values=payload,
            idempotency_key=idempotency_key,
        )

    def update_opportunity(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        opportunity_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> OpportunityRecord:
        opportunity = self._repository.opportunity(
            grant.workspace_id, opportunity_id, grant.allowed_branch_ids, lock=True
        )
        if opportunity is None:
            raise ResourceNotFoundError("La oportunidad no existe.", "opportunityId")
        self._require_version(opportunity.version, expected_version)
        if "assigned_membership_id" in changes:
            opportunity.assigned_membership_id = self._assignee(
                grant.workspace_id,
                cast(UUID | None, changes["assigned_membership_id"]),
                grant.membership_id,
            )
        if "customer_id" in changes:
            customer_id = cast(UUID | None, changes["customer_id"])
            if customer_id is None:
                opportunity.customer_id = None
            else:
                customer = self._repository.customer(
                    grant.workspace_id,
                    customer_id,
                    branch_id=opportunity.branch_id,
                    allowed_branch_ids=grant.allowed_branch_ids,
                )
                if customer is None:
                    raise ResourceNotFoundError("El cliente no existe.", "customerId")
                opportunity.customer_id = customer.id
                opportunity.customer_name = customer.display_name
        for field in ("title", "customer_name", "value", "notes"):
            if field in changes:
                setattr(opportunity, field, changes[field])
        stage = cast(str, changes.get("stage", opportunity.stage))
        lost_reason = self._optional_text(
            cast(str | None, changes.get("lost_reason", opportunity.lost_reason))
        )
        if stage == "perdido" and not lost_reason:
            raise InvalidOperationError("Una oportunidad perdida requiere motivo.", "lostReason")
        opportunity.stage = stage
        opportunity.lost_reason = lost_reason if stage == "perdido" else None
        opportunity.closed_at = datetime.now(UTC) if stage in {"cerrado", "perdido"} else None
        opportunity.updated_by_platform_user_id = principal.platform_user_id
        opportunity.version += 1
        self._audit(
            principal,
            "crm.opportunity.update",
            "crm_opportunity",
            opportunity.id,
            {"changedFields": sorted(changes), "stage": stage, "version": opportunity.version},
        )
        self._session.commit()
        return self._repository.opportunity_record(opportunity)

    def list_activities(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        activity_type: str | None,
        completed: bool | None,
        overdue: bool | None,
        opportunity_id: UUID | None,
        customer_id: UUID | None,
        page: int,
        page_size: int,
        now: datetime | None = None,
    ) -> PageResult:
        self._require_optional_branch(grant, branch_id)
        return self._page(
            self._repository.list_activities(
                workspace_id=grant.workspace_id,
                allowed_branch_ids=grant.allowed_branch_ids,
                branch_id=branch_id,
                activity_type=activity_type,
                completed=completed,
                overdue=overdue,
                opportunity_id=opportunity_id,
                customer_id=customer_id,
                now=self._utc_now(now),
                page=page,
                page_size=page_size,
            ),
            page,
            page_size,
        )

    def get_activity(self, grant: PermissionGrant, activity_id: UUID) -> CrmActivity:
        activity = self._repository.activity(
            grant.workspace_id, activity_id, grant.allowed_branch_ids
        )
        if activity is None:
            raise ResourceNotFoundError("La actividad no existe.", "activityId")
        return activity

    def create_activity(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> CrmActivity:
        fingerprint = self._fingerprint(values)
        existing = self._repository.activity_by_key(grant.workspace_id, idempotency_key)
        if existing is not None:
            self._require_branch(grant, existing.branch_id)
            self._require_fingerprint(existing.request_fingerprint, fingerprint)
            return existing
        branch_id = cast(UUID, values["branch_id"])
        self._require_branch(grant, branch_id)
        customer_name = self._optional_text(cast(str | None, values.get("customer_name")))
        lead_id = cast(UUID | None, values.get("lead_id"))
        if lead_id is not None:
            lead = self._repository.lead(grant.workspace_id, lead_id, grant.allowed_branch_ids)
            if lead is None:
                raise ResourceNotFoundError("El lead no existe.", "leadId")
            self._require_same_branch(branch_id, lead.branch_id, "leadId")
            customer_name = customer_name or lead.company or lead.name
        opportunity_id = cast(UUID | None, values.get("opportunity_id"))
        if opportunity_id is not None:
            opportunity = self._repository.opportunity(
                grant.workspace_id, opportunity_id, grant.allowed_branch_ids
            )
            if opportunity is None:
                raise ResourceNotFoundError("La oportunidad no existe.", "opportunityId")
            self._require_same_branch(branch_id, opportunity.branch_id, "opportunityId")
            customer_name = customer_name or opportunity.customer_name
        customer_id = cast(UUID | None, values.get("customer_id"))
        if customer_id is not None:
            customer = self._repository.customer(
                grant.workspace_id,
                customer_id,
                branch_id=branch_id,
                allowed_branch_ids=grant.allowed_branch_ids,
            )
            if customer is None:
                raise ResourceNotFoundError("El cliente no existe.", "customerId")
            customer_name = customer.display_name
        activity = CrmActivity(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            lead_id=lead_id,
            opportunity_id=opportunity_id,
            customer_id=customer_id,
            assigned_membership_id=self._assignee(
                grant.workspace_id,
                cast(UUID | None, values.get("assigned_membership_id")),
                grant.membership_id,
            ),
            activity_type=cast(str, values.get("type", "tarea")),
            title=cast(str, values["title"]),
            description=self._optional_text(cast(str | None, values.get("description"))),
            customer_name=customer_name,
            due_at=cast(datetime | None, values.get("due_at")),
            completed_at=None,
            creation_idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            created_by_platform_user_id=principal.platform_user_id,
            updated_by_platform_user_id=principal.platform_user_id,
        )
        try:
            self._repository.add_activity(activity)
            self._audit(
                principal,
                "crm.activity.create",
                "crm_activity",
                activity.id,
                {"branchId": str(branch_id), "type": activity.activity_type},
            )
            self._session.commit()
            return activity
        except IntegrityError as exc:
            self._session.rollback()
            replay = self._repository.activity_by_key(grant.workspace_id, idempotency_key)
            if replay is not None:
                self._require_fingerprint(replay.request_fingerprint, fingerprint)
                return replay
            raise ConflictError("No se pudo crear la actividad.") from exc

    def update_activity(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        activity_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> CrmActivity:
        activity = self._repository.activity(
            grant.workspace_id, activity_id, grant.allowed_branch_ids, lock=True
        )
        if activity is None:
            raise ResourceNotFoundError("La actividad no existe.", "activityId")
        self._require_version(activity.version, expected_version)
        if "assigned_membership_id" in changes:
            activity.assigned_membership_id = self._assignee(
                grant.workspace_id,
                cast(UUID | None, changes["assigned_membership_id"]),
                grant.membership_id,
            )
        mapping = {"type": "activity_type"}
        for field in ("type", "title", "description", "customer_name", "due_at"):
            if field in changes:
                setattr(activity, mapping.get(field, field), changes[field])
        activity.updated_by_platform_user_id = principal.platform_user_id
        activity.version += 1
        self._audit(
            principal,
            "crm.activity.update",
            "crm_activity",
            activity.id,
            {"changedFields": sorted(changes), "version": activity.version},
        )
        self._session.commit()
        return activity

    def set_activity_completion(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        activity_id: UUID,
        expected_version: int,
        completed: bool,
    ) -> CrmActivity:
        activity = self._repository.activity(
            grant.workspace_id, activity_id, grant.allowed_branch_ids, lock=True
        )
        if activity is None:
            raise ResourceNotFoundError("La actividad no existe.", "activityId")
        self._require_version(activity.version, expected_version)
        if completed == (activity.completed_at is not None):
            return activity
        activity.completed_at = datetime.now(UTC) if completed else None
        activity.updated_by_platform_user_id = principal.platform_user_id
        activity.version += 1
        self._audit(
            principal,
            "crm.activity.complete" if completed else "crm.activity.reopen",
            "crm_activity",
            activity.id,
            {"version": activity.version},
        )
        self._session.commit()
        return activity

    def convert_lead(
        self,
        *,
        principal: AuthPrincipal,
        crm_grant: PermissionGrant,
        customer_grant: PermissionGrant,
        lead_id: UUID,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> CustomerCrmRecord:
        lead = self._repository.lead(
            crm_grant.workspace_id, lead_id, crm_grant.allowed_branch_ids, lock=True
        )
        if lead is None:
            raise ResourceNotFoundError("El lead no existe.", "leadId")
        fingerprint = self._fingerprint(values)
        if lead.status == "convertido":
            self._require_fingerprint(
                lead.conversion_request_fingerprint,
                fingerprint,
                parameter="Idempotency-Key",
            )
            record = self._repository.customer_record(
                workspace_id=crm_grant.workspace_id,
                customer_id=cast(UUID, lead.converted_customer_id),
                allowed_branch_ids=crm_grant.allowed_branch_ids,
            )
            if record is None:
                raise ConflictError("La conversión del lead quedó inconsistente.", "customerId")
            return record
        self._require_version(lead.version, cast(int, values["version"]))
        branch_ids = set(cast(list[UUID] | None, values.get("branch_ids")) or [lead.branch_id])
        self._validate_conversion_branches(crm_grant, customer_grant, branch_ids)
        display_name = self._optional_text(cast(str | None, values.get("display_name")))
        display_name = display_name or lead.company or lead.name
        customer_type = cast(str, values.get("customer_type", "business"))
        prepared: dict[str, object] = {
            "customer_type": customer_type,
            "display_name": display_name,
            "normalized_name": normalize_name(display_name),
            "first_name": self._optional_text(cast(str | None, values.get("first_name"))),
            "last_name": self._optional_text(cast(str | None, values.get("last_name"))),
            "business_name": self._optional_text(cast(str | None, values.get("business_name")))
            or (lead.company if customer_type == "business" else None),
            "email": str(values.get("email") or lead.email)
            if values.get("email") or lead.email
            else None,
            "normalized_email": normalize_email(str(values.get("email") or lead.email))
            if values.get("email") or lead.email
            else None,
            "phone": self._optional_text(cast(str | None, values.get("phone"))) or lead.phone,
            "normalized_phone": normalize_phone(
                self._optional_text(cast(str | None, values.get("phone"))) or lead.phone
            ),
            "status": "active",
        }
        try:
            customer_record = self._master_data.create_customer(
                workspace_id=crm_grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                values=prepared,
                branch_ids=branch_ids,
                request_id=get_request_id(),
                create_crm_profile=False,
            )
            profile = CustomerCrmProfile(
                workspace_id=crm_grant.workspace_id,
                customer_id=customer_record.id,
                lifecycle_status=cast(str, values.get("lifecycle_status", "prospecto")),
                loyalty_points=0,
                notes=self._optional_text(cast(str | None, values.get("notes")))
                or lead.score_notes,
                created_by_platform_user_id=principal.platform_user_id,
                updated_by_platform_user_id=principal.platform_user_id,
            )
            self._repository.add_customer_profile(profile)
            lead.status = "convertido"
            lead.converted_customer_id = customer_record.id
            lead.converted_at = datetime.now(UTC)
            lead.conversion_idempotency_key = idempotency_key
            lead.conversion_request_fingerprint = fingerprint
            lead.updated_by_platform_user_id = principal.platform_user_id
            lead.version += 1
            opportunity = self._repository.opportunity_for_lead(crm_grant.workspace_id, lead.id)
            if opportunity is not None:
                opportunity.customer_id = customer_record.id
                opportunity.customer_name = display_name
                opportunity.updated_by_platform_user_id = principal.platform_user_id
                opportunity.version += 1
            self._audit(
                principal,
                "crm.lead.convert",
                "crm_lead",
                lead.id,
                {
                    "customerId": str(customer_record.id),
                    "branchIds": [str(value) for value in sorted(branch_ids)],
                },
            )
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo convertir el lead.") from exc
        record = self._repository.customer_record(
            workspace_id=crm_grant.workspace_id,
            customer_id=customer_record.id,
            allowed_branch_ids=crm_grant.allowed_branch_ids,
        )
        if record is None:
            raise ConflictError("No se pudo leer el cliente convertido.")
        return record

    def list_customers(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        lifecycle_status: str | None,
        search: str | None,
        page: int,
        page_size: int,
    ) -> PageResult:
        self._require_optional_branch(grant, branch_id)
        result = self._repository.list_customers(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            lifecycle_status=lifecycle_status,
            search=self._optional_text(search),
            page=page,
            page_size=page_size,
        )
        return PageResult(
            result.items,
            page,
            page_size,
            result.total_items,
            ceil(result.total_items / page_size) if result.total_items else 0,
        )

    def get_customer(self, grant: PermissionGrant, customer_id: UUID) -> CustomerCrmRecord:
        record = self._repository.customer_record(
            workspace_id=grant.workspace_id,
            customer_id=customer_id,
            allowed_branch_ids=grant.allowed_branch_ids,
        )
        if record is None:
            raise ResourceNotFoundError("El cliente no existe.", "customerId")
        return record

    def update_customer_profile(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        customer_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> CustomerCrmRecord:
        if (
            self._repository.customer(
                grant.workspace_id,
                customer_id,
                allowed_branch_ids=grant.allowed_branch_ids,
            )
            is None
        ):
            raise ResourceNotFoundError("El cliente no existe.", "customerId")
        profile = self._repository.customer_profile(grant.workspace_id, customer_id, lock=True)
        if profile is None:
            raise ResourceNotFoundError("El perfil CRM del cliente no existe.", "customerId")
        self._require_version(profile.version, expected_version)
        for field in ("lifecycle_status", "loyalty_points", "notes"):
            if field in changes:
                setattr(profile, field, changes[field])
        profile.updated_by_platform_user_id = principal.platform_user_id
        profile.version += 1
        self._audit(
            principal,
            "crm.customer_profile.update",
            "customer_crm_profile",
            profile.id,
            {"customerId": str(customer_id), "changedFields": sorted(changes)},
        )
        self._session.commit()
        return self.get_customer(grant, customer_id)

    def customer_purchases(
        self,
        grant: PermissionGrant,
        *,
        customer_id: UUID,
        branch_id: UUID | None,
    ) -> tuple[CustomerCrmRecord, tuple[Any, ...]]:
        self._require_optional_branch(grant, branch_id)
        customer = self.get_customer(grant, customer_id)
        purchases = self._repository.customer_purchases(
            workspace_id=grant.workspace_id,
            customer_id=customer_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
        )
        return customer, purchases

    def list_quotes(
        self,
        *,
        crm_grant: PermissionGrant,
        sales_grant: PermissionGrant,
        branch_id: UUID | None,
        customer_id: UUID | None,
        crm_status: str | None,
        page: int,
        page_size: int,
    ) -> PosPage:
        grant = self._intersect_grants(crm_grant, sales_grant)
        self._require_optional_branch(grant, branch_id)
        return PosService(self._session).list_quotes(
            grant,
            branch_id=branch_id,
            customer_id=customer_id,
            status=None,
            kind="quote",
            origin="crm",
            crm_status=crm_status,
            page=page,
            page_size=page_size,
        )

    def get_quote(
        self,
        *,
        crm_grant: PermissionGrant,
        sales_grant: PermissionGrant,
        quote_id: UUID,
    ) -> QuoteRecord:
        grant = self._intersect_grants(crm_grant, sales_grant)
        record = PosService(self._session).get_quote(grant, quote_id)
        if record.quote.origin != "crm":
            raise ResourceNotFoundError("La cotización CRM no existe.", "quoteId")
        return record

    def list_sales(
        self,
        *,
        crm_grant: PermissionGrant,
        sales_grant: PermissionGrant,
        branch_id: UUID | None,
        customer_id: UUID | None,
        status: str | None,
        date_from: Any,
        date_to: Any,
        page: int,
        page_size: int,
    ) -> PosPage:
        grant = self._intersect_grants(crm_grant, sales_grant)
        return PosService(self._session).list_sales(
            grant,
            branch_id=branch_id,
            register_id=None,
            customer_id=customer_id,
            status=status,
            date_from=date_from,
            date_to=date_to,
            page=page,
            page_size=page_size,
        )

    def get_sale(
        self,
        *,
        crm_grant: PermissionGrant,
        sales_grant: PermissionGrant,
        sale_id: UUID,
    ) -> SaleRecord:
        return PosService(self._session).get_sale(
            self._intersect_grants(crm_grant, sales_grant), sale_id
        )

    def create_quote(
        self,
        *,
        principal: AuthPrincipal,
        crm_grant: PermissionGrant,
        sales_grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> QuoteRecord:
        grant = self._intersect_grants(crm_grant, sales_grant)
        branch_id = cast(UUID, values["branch_id"])
        self._require_branch(grant, branch_id)
        customer_id = cast(UUID, values["customer_id"])
        if (
            self._repository.customer(
                grant.workspace_id,
                customer_id,
                branch_id=branch_id,
                allowed_branch_ids=grant.allowed_branch_ids,
            )
            is None
        ):
            raise ResourceNotFoundError("El cliente no existe en la sucursal.", "customerId")
        opportunity_id = cast(UUID | None, values.get("opportunity_id"))
        if opportunity_id is not None:
            opportunity = self._repository.opportunity(
                grant.workspace_id, opportunity_id, grant.allowed_branch_ids
            )
            if opportunity is None:
                raise ResourceNotFoundError("La oportunidad no existe.", "opportunityId")
            self._require_same_branch(branch_id, opportunity.branch_id, "opportunityId")
            if opportunity.customer_id is not None and opportunity.customer_id != customer_id:
                raise InvalidOperationError(
                    "La oportunidad está vinculada a otro cliente.", "customerId"
                )
        payload = {
            "kind": "quote",
            "branch_id": branch_id,
            "customer_id": customer_id,
            "payment_method_id": values.get("payment_method_id"),
            "reference": values.get("reference"),
            "discount_type": values.get("discount_type"),
            "discount_value": values.get("discount_value"),
            "lines": values["lines"],
            "notes": values.get("notes"),
            "due_at": values.get("valid_until"),
            "origin": "crm",
            "opportunity_id": opportunity_id,
            "crm_status": values.get("status", "borrador"),
        }
        return PosService(self._session).create_quote(
            principal=principal,
            grant=grant,
            values=payload,
            idempotency_key=idempotency_key,
        )

    def update_quote(
        self,
        *,
        principal: AuthPrincipal,
        crm_grant: PermissionGrant,
        sales_grant: PermissionGrant,
        quote_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> QuoteRecord:
        grant = self._intersect_grants(crm_grant, sales_grant)
        current = PosService(self._session).get_quote(grant, quote_id)
        if current.quote.origin != "crm":
            raise ResourceNotFoundError("La cotización CRM no existe.", "quoteId")
        branch_id = cast(UUID, changes.get("branch_id", current.quote.branch_id))
        customer_id = cast(UUID, changes.get("customer_id", current.quote.customer_id))
        opportunity_id = cast(
            UUID | None, changes.get("opportunity_id", current.quote.opportunity_id)
        )
        if customer_id is None:
            raise InvalidOperationError("La cotización CRM requiere un cliente.", "customerId")
        if opportunity_id is not None:
            opportunity = self._repository.opportunity(
                grant.workspace_id, opportunity_id, grant.allowed_branch_ids
            )
            if opportunity is None:
                raise ResourceNotFoundError("La oportunidad no existe.", "opportunityId")
            self._require_same_branch(branch_id, opportunity.branch_id, "opportunityId")
            if opportunity.customer_id is not None and opportunity.customer_id != customer_id:
                raise InvalidOperationError(
                    "La oportunidad está vinculada a otro cliente.", "customerId"
                )
        translated = dict(changes)
        if "valid_until" in translated:
            translated["due_at"] = translated.pop("valid_until")
        if "status" in translated:
            translated["crm_status"] = translated.pop("status")
        return PosService(self._session).update_quote(
            principal=principal,
            grant=grant,
            quote_id=quote_id,
            expected_version=expected_version,
            changes=translated,
        )

    def cancel_quote(
        self,
        *,
        principal: AuthPrincipal,
        crm_grant: PermissionGrant,
        sales_grant: PermissionGrant,
        quote_id: UUID,
        expected_version: int,
        reason: str,
    ) -> QuoteRecord:
        grant = self._intersect_grants(crm_grant, sales_grant)
        current = PosService(self._session).get_quote(grant, quote_id)
        if current.quote.origin != "crm":
            raise ResourceNotFoundError("La cotización CRM no existe.", "quoteId")
        return PosService(self._session).cancel_quote(
            principal=principal,
            grant=grant,
            quote_id=quote_id,
            expected_version=expected_version,
            reason=reason,
        )

    def overview(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        now: datetime | None = None,
    ) -> OverviewRecord:
        self._require_optional_branch(grant, branch_id)
        workspace = self._repository.workspace(grant.workspace_id)
        if workspace is None:
            raise ResourceNotFoundError("El workspace no existe.", "workspaceId")
        generated_at = self._utc_now(now)
        try:
            timezone = ZoneInfo(workspace.timezone)
        except ZoneInfoNotFoundError as exc:
            raise ConflictError("La zona horaria del workspace no es válida.", "timezone") from exc
        local_now = generated_at.astimezone(timezone)
        month_start_local = local_now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if month_start_local.month == 12:
            month_end_local = month_start_local.replace(year=month_start_local.year + 1, month=1)
        else:
            month_end_local = month_start_local.replace(month=month_start_local.month + 1)
        values = self._repository.overview(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            month_start=month_start_local.astimezone(UTC),
            month_end=month_end_local.astimezone(UTC),
            now=generated_at,
        )
        return OverviewRecord(branch_id, values, generated_at)

    def _build_lead(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
        fingerprint: str,
        weights: dict[str, float],
    ) -> CrmLead:
        branch_id = cast(UUID, values["branch_id"])
        self._require_branch(grant, branch_id)
        scoring_values = {
            key: str(values[key]) if key in {"website"} and values.get(key) else values.get(key)
            for key in ("name", "company", "raw_snippet", "location", "website", "phone")
        }
        scoring = compute_auto_score(scoring_values, weights)
        manual = cast(int | None, values.get("score_manual"))
        return CrmLead(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            assigned_membership_id=self._assignee(
                grant.workspace_id,
                cast(UUID | None, values.get("assigned_membership_id")),
                grant.membership_id,
            ),
            name=cast(str, values.get("name") or ""),
            company=cast(str, values.get("company") or ""),
            email=str(values["email"]) if values.get("email") else None,
            phone=self._optional_text(cast(str | None, values.get("phone"))),
            website=str(values["website"]) if values.get("website") else None,
            location=self._optional_text(cast(str | None, values.get("location"))),
            source=cast(str, values.get("source", "manual")),
            source_url=str(values["source_url"]) if values.get("source_url") else None,
            scraped_at=cast(datetime | None, values.get("scraped_at")),
            raw_snippet=self._optional_text(cast(str | None, values.get("raw_snippet"))),
            status=cast(str, values.get("status", "nuevo")),
            score_auto=scoring.score,
            score_manual=manual,
            score=manual if manual is not None else scoring.score,
            module_fits=scoring.module_fits,
            score_reasons=scoring.reasons,
            score_notes=self._optional_text(cast(str | None, values.get("score_notes"))),
            converted_customer_id=None,
            converted_at=None,
            creation_idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            conversion_idempotency_key=None,
            conversion_request_fingerprint=None,
            created_by_platform_user_id=principal.platform_user_id,
            updated_by_platform_user_id=principal.platform_user_id,
        )

    @staticmethod
    def _apply_score(lead: CrmLead, weights: dict[str, float]) -> None:
        scoring = compute_auto_score(
            {
                "name": lead.name,
                "company": lead.company,
                "raw_snippet": lead.raw_snippet,
                "location": lead.location,
                "website": lead.website,
                "phone": lead.phone,
            },
            weights,
        )
        lead.score_auto = scoring.score
        lead.score = lead.score_manual if lead.score_manual is not None else scoring.score
        lead.module_fits = scoring.module_fits
        lead.score_reasons = scoring.reasons

    def _required_settings(self, workspace_id: UUID) -> CrmSettings:
        settings = self._repository.settings(workspace_id)
        if settings is not None:
            return settings
        settings = self._new_settings(workspace_id, None)
        self._session.commit()
        return settings

    def _new_settings(self, workspace_id: UUID, actor_platform_user_id: UUID | None) -> CrmSettings:
        settings = CrmSettings(
            workspace_id=workspace_id,
            scoring_weights=dict(DEFAULT_SCORING_WEIGHTS),
            updated_by_platform_user_id=actor_platform_user_id,
        )
        self._repository.add_settings(settings)
        return settings

    def _assignee(self, workspace_id: UUID, requested: UUID | None, default: UUID) -> UUID:
        membership_id = requested or default
        if self._repository.membership(workspace_id, membership_id) is None:
            raise ResourceNotFoundError(
                "El usuario asignado no existe o está inactivo.", "assignedMembershipId"
            )
        return membership_id

    def _validate_conversion_branches(
        self,
        crm_grant: PermissionGrant,
        customer_grant: PermissionGrant,
        branch_ids: set[UUID],
    ) -> None:
        if not branch_ids:
            raise InvalidOperationError("Selecciona al menos una sucursal.", "branchIds")
        for branch_id in branch_ids:
            self._require_branch(crm_grant, branch_id)
            self._require_branch(customer_grant, branch_id)

    @staticmethod
    def _intersect_grants(first: PermissionGrant, second: PermissionGrant) -> PermissionGrant:
        if first.workspace_id != second.workspace_id or first.membership_id != second.membership_id:
            raise AuthorizationError("Los permisos efectivos no pertenecen a la misma sesión.")
        if first.allowed_branch_ids is None:
            branch_ids = second.allowed_branch_ids
        elif second.allowed_branch_ids is None:
            branch_ids = first.allowed_branch_ids
        else:
            branch_ids = frozenset(first.allowed_branch_ids & second.allowed_branch_ids)
        return PermissionGrant(
            permission_code=second.permission_code,
            workspace_id=first.workspace_id,
            membership_id=first.membership_id,
            allowed_legal_entity_ids=None,
            allowed_branch_ids=branch_ids,
        )

    def _audit(
        self,
        principal: AuthPrincipal,
        action: str,
        target_type: str,
        target_id: UUID,
        details: dict[str, Any],
    ) -> None:
        self._repository.add_audit(
            workspace_id=principal.workspace_id,
            actor_platform_user_id=principal.platform_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            request_id=get_request_id(),
            details=details,
        )

    def _require_branch(self, grant: PermissionGrant, branch_id: UUID) -> None:
        if grant.allowed_branch_ids is not None and branch_id not in grant.allowed_branch_ids:
            raise AuthorizationError("No puedes operar una sucursal fuera de tu alcance.")
        if self._repository.branch(grant.workspace_id, branch_id) is None:
            raise ResourceNotFoundError("La sucursal no existe o está inactiva.", "branchId")

    @staticmethod
    def _require_optional_branch(grant: PermissionGrant, branch_id: UUID | None) -> None:
        if (
            branch_id is not None
            and grant.allowed_branch_ids is not None
            and branch_id not in grant.allowed_branch_ids
        ):
            raise AuthorizationError("No puedes consultar una sucursal fuera de tu alcance.")

    @staticmethod
    def _require_same_branch(expected: UUID, actual: UUID, parameter: str) -> None:
        if expected != actual:
            raise InvalidOperationError(
                "Los registros relacionados deben pertenecer a la misma sucursal.", parameter
            )

    @staticmethod
    def _require_version(current: int, expected: int) -> None:
        if current != expected:
            raise ConflictError("El registro cambió desde la última lectura.", "version")

    @staticmethod
    def _require_fingerprint(
        current: str | None, expected: str, parameter: str = "Idempotency-Key"
    ) -> None:
        if current != expected:
            raise ConflictError("La clave de idempotencia ya fue usada con otros datos.", parameter)

    @staticmethod
    def _fingerprint(values: Any) -> str:
        payload = json.dumps(values, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @staticmethod
    def _optional_text(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        return normalized or None

    @staticmethod
    def _utc_now(value: datetime | None) -> datetime:
        if value is None:
            return datetime.now(UTC)
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    @staticmethod
    def _page(result: EntityPage, page: int, page_size: int) -> PageResult:
        return PageResult(
            result.items,
            page,
            page_size,
            result.total_items,
            ceil(result.total_items / page_size) if result.total_items else 0,
        )
