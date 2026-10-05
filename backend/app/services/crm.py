from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from math import ceil
from typing import Any, cast
from urllib.parse import urlsplit
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import friendly_validation_message
from app.core.request_context import get_request_id
from app.db.models import (
    CrmActivity,
    CrmLead,
    CrmSettings,
    CustomerCrmProfile,
    WorkspaceMembership,
)
from app.repositories.crm import (
    CrmRepository,
    CustomerCrmRecord,
    EntityPage,
    LeadRecord,
    OverviewValues,
)
from app.repositories.master_data import MasterDataRepository
from app.repositories.pos import Page as PosPage
from app.repositories.pos import QuoteRecord, SaleRecord
from app.schemas.crm import ImportPipelineItem
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)
from app.services.master_data import normalize_email, normalize_name, normalize_phone
from app.services.pos import CheckoutResult, PosService


@dataclass(frozen=True)
class PageResult:
    items: tuple[Any, ...]
    page: int
    page_size: int
    total_items: int
    total_pages: int


def _lead_instagram_url(lead: CrmLead) -> str | None:
    if lead.instagram_url:
        return lead.instagram_url
    if lead.website:
        candidate = lead.website if "://" in lead.website else f"https://{lead.website}"
        try:
            if urlsplit(candidate).hostname in {"instagram.com", "www.instagram.com"}:
                return candidate
        except ValueError:
            pass
    return None


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

    def workspace_settings(self, grant: PermissionGrant) -> WorkspaceMembership:
        return self._required_membership(grant)

    def update_workspace_settings(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        expected_version: int,
        ui_mode: str,
    ) -> WorkspaceMembership:
        membership = self._repository.membership(grant.workspace_id, grant.membership_id, lock=True)
        if membership is None:
            raise ResourceNotFoundError("La membresía activa no existe.", "membershipId")
        self._require_version(membership.version, expected_version)
        membership.crm_ui_mode = ui_mode
        membership.version += 1
        self._audit(
            principal,
            "crm.user_ui_mode.update",
            "workspace_membership",
            membership.id,
            {"ui_mode": ui_mode, "version": membership.version},
        )
        self._session.commit()
        return membership

    def list_leads(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        status: str | None,
        source: str | None,
        search: str | None,
        sort: str,
        sort_dir: str,
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
            sort=sort if sort in {"updated_at", "star_rating"} else "updated_at",
            sort_dir=sort_dir if sort_dir in {"asc", "desc"} else "desc",
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
        lead = self._build_lead(
            principal=principal,
            grant=grant,
            values=values,
            idempotency_key=idempotency_key,
            fingerprint=fingerprint,
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
        if lead.status == "cerrado":
            raise ConflictError("Un lead cerrado ya no puede editarse.", "status")
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
            "instagram_url",
            "location",
            "raw_snippet",
        ):
            if field in changes:
                value = changes[field]
                setattr(
                    lead,
                    field,
                    str(value)
                    if field in {"email", "website", "instagram_url"} and value
                    else value,
                )
        if "star_rating" in changes:
            lead.star_rating = changes["star_rating"]
        if "acquisition_source" in changes:
            lead.acquisition_source = changes["acquisition_source"]
        if "pipeline_value" in changes:
            lead.pipeline_value = cast(Decimal, changes["pipeline_value"])
        previous_status = lead.status
        previous_lost_reason = lead.lost_reason
        if "status" in changes:
            status = cast(str, changes["status"])
            lost_reason = self._optional_text(
                cast(str | None, changes.get("lost_reason", lead.lost_reason))
            )
            if status == "perdido" and not lost_reason:
                raise InvalidOperationError("Un lead perdido requiere motivo.", "lostReason")
            lead.status = status
            lead.lost_reason = lost_reason if status == "perdido" else None
            if status == "perdido":
                if status != previous_status or lead.pipeline_closed_at is None:
                    lead.pipeline_closed_at = datetime.now(UTC)
            else:
                lead.pipeline_closed_at = None
        elif "lost_reason" in changes:
            if lead.status != "perdido":
                raise InvalidOperationError(
                    "Solo puedes indicar motivo en un lead perdido.", "lostReason"
                )
            lost_reason = self._optional_text(cast(str | None, changes["lost_reason"]))
            if not lost_reason:
                raise InvalidOperationError("Un lead perdido requiere motivo.", "lostReason")
            lead.lost_reason = lost_reason
        if not lead.name and not lead.company:
            raise InvalidOperationError("El lead requiere nombre o empresa.", "name")
        lead.updated_by_platform_user_id = principal.platform_user_id
        lead.version += 1
        audit_details: dict[str, Any] = {
            "changedFields": sorted(changes),
            "status": lead.status,
            "version": lead.version,
        }
        if lead.status != previous_status:
            audit_details["previousStatus"] = previous_status
        if lead.status == "perdido":
            audit_details["lostReason"] = lead.lost_reason
        if previous_status == "perdido" and lead.status != "perdido":
            audit_details["previousLostReason"] = previous_lost_reason
        if lead.status == "cerrado" and lead.converted_customer_id:
            customer = self._repository.customer(
                grant.workspace_id,
                lead.converted_customer_id,
                branch_id=lead.branch_id,
                allowed_branch_ids=grant.allowed_branch_ids,
            )
            if customer is not None and not customer.instagram_url:
                instagram_url = _lead_instagram_url(lead)
                if instagram_url:
                    customer.instagram_url = instagram_url
                    customer.updated_by_platform_user_id = principal.platform_user_id
                    customer.version += 1
        self._audit(
            principal,
            "crm.lead.update",
            "crm_lead",
            lead.id,
            audit_details,
        )
        self._session.commit()
        return self._repository.lead_record(lead)

    def delete_leads(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        lead_ids: list[UUID],
    ) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for lead_id in lead_ids:
            try:
                lead = self._repository.lead(
                    grant.workspace_id, lead_id, grant.allowed_branch_ids, lock=True
                )
                if lead is None:
                    results.append(
                        {
                            "lead_id": lead_id,
                            "status": "error",
                            "message": "El lead no existe o no tienes acceso.",
                        }
                    )
                    continue
                if lead.status == "cerrado":
                    results.append(
                        {
                            "lead_id": lead_id,
                            "status": "error",
                            "message": "No se puede eliminar un lead cerrado.",
                        }
                    )
                    continue
                if self._repository.quote_count_for_lead(grant.workspace_id, lead.id) > 0:
                    results.append(
                        {
                            "lead_id": lead_id,
                            "status": "error",
                            "message": "El lead tiene cotizaciones vinculadas.",
                        }
                    )
                    continue
                self._repository.delete_activities_for_lead(grant.workspace_id, lead.id)
                self._repository.remove_lead(lead)
                self._audit(
                    principal,
                    "crm.lead.delete",
                    "crm_lead",
                    lead_id,
                    {"branchId": str(lead.branch_id)},
                )
                self._session.commit()
                results.append({"lead_id": lead_id, "status": "deleted", "message": None})
            except Exception:
                self._session.rollback()
                results.append(
                    {
                        "lead_id": lead_id,
                        "status": "error",
                        "message": "No se pudo eliminar el lead.",
                    }
                )
        return results

    def list_activities(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        activity_type: str | None,
        completed: bool | None,
        overdue: bool | None,
        lead_id: UUID | None,
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
                lead_id=lead_id,
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
        if lead.status == "cerrado":
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
            "acquisition_source": cast(str | None, values.get("acquisition_source"))
            or lead.acquisition_source,
            "instagram_url": _lead_instagram_url(lead),
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
                notes=self._optional_text(cast(str | None, values.get("notes"))),
                created_by_platform_user_id=principal.platform_user_id,
                updated_by_platform_user_id=principal.platform_user_id,
            )
            self._repository.add_customer_profile(profile)
            lead.status = "cerrado"
            lead.converted_customer_id = customer_record.id
            lead.converted_at = datetime.now(UTC)
            lead.conversion_idempotency_key = idempotency_key
            lead.conversion_request_fingerprint = fingerprint
            lead.updated_by_platform_user_id = principal.platform_user_id
            lead.version += 1
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
            include_details=True,
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
        lead_id = cast(UUID | None, values.get("lead_id"))
        if lead_id is not None:
            lead = self._repository.lead(
                grant.workspace_id, lead_id, grant.allowed_branch_ids, lock=True
            )
            if lead is None:
                raise ResourceNotFoundError("El lead no existe.", "leadId")
            self._require_same_branch(branch_id, lead.branch_id, "leadId")
            if lead.converted_customer_id is not None and lead.converted_customer_id != customer_id:
                raise InvalidOperationError("El lead está vinculado a otro cliente.", "customerId")
            if lead.status in {"nuevo", "contactado"}:
                lead.status = "propuesta"
                lead.updated_by_platform_user_id = principal.platform_user_id
                lead.version += 1
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
            "lead_id": lead_id,
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
        lead_id = cast(UUID | None, changes.get("lead_id", current.quote.lead_id))
        if customer_id is None:
            raise InvalidOperationError("La cotización CRM requiere un cliente.", "customerId")
        if lead_id is not None:
            lead = self._repository.lead(grant.workspace_id, lead_id, grant.allowed_branch_ids)
            if lead is None:
                raise ResourceNotFoundError("El lead no existe.", "leadId")
            self._require_same_branch(branch_id, lead.branch_id, "leadId")
            if lead.converted_customer_id is not None and lead.converted_customer_id != customer_id:
                raise InvalidOperationError("El lead está vinculado a otro cliente.", "customerId")
        translated = dict(changes)
        if "lead_id" in translated:
            translated["lead_id"] = lead_id
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

    def invoice_quote(
        self,
        *,
        principal: AuthPrincipal,
        crm_grant: PermissionGrant,
        sales_grant: PermissionGrant,
        sell_grant: PermissionGrant,
        quote_id: UUID,
        expected_version: int,
        payment_method_id: UUID,
        collection_mode: str,
        register_id: UUID | None,
        payment_reference: str | None,
        idempotency_key: str,
    ) -> CheckoutResult:
        quote_grant = self._intersect_grants(crm_grant, sales_grant)
        record = PosService(self._session).get_quote(quote_grant, quote_id)
        if record.quote.origin != "crm":
            raise ResourceNotFoundError("La cotización CRM no existe.", "quoteId")
        if record.quote.crm_status != "aceptada":
            raise InvalidOperationError("Solo puedes facturar cotizaciones aceptadas.", "status")
        replay = (
            PosService(self._session)._repository.sale_by_key(
                crm_grant.workspace_id, idempotency_key
            )
            if record.converted_sale_id is not None
            else None
        )
        replaying = replay is not None and replay.id == record.converted_sale_id
        if record.converted_sale_id is not None and not replaying:
            raise ConflictError("La cotización ya fue facturada.", "quoteId")
        if record.quote.status != "open" and not replaying:
            raise ConflictError("La cotización ya fue procesada.", "quoteId")
        if not record.lines:
            raise InvalidOperationError("La cotización debe incluir al menos un ítem.", "lines")
        if not replaying:
            self._require_version(record.quote.version, expected_version)
        method = PosService(self._session)._require_payment_method(
            sell_grant.workspace_id, payment_method_id
        )
        effective_collection = "now" if method.settlement_policy == "immediate" else "receivable"
        if collection_mode not in ("now", "receivable"):
            raise InvalidOperationError("Modo de cobro inválido.", "collectionMode")
        if collection_mode != effective_collection:
            collection_mode = effective_collection
        if record.quote.customer_id is None:
            raise InvalidOperationError(
                "La cotización debe tener un cliente antes de facturar.", "customerId"
            )
        lines = [
            {
                "item_id": line.item_id,
                "quantity": line.quantity,
                "unit_price": line.unit_price,
            }
            for line in record.lines
        ]
        checkout_values: dict[str, Any] = {
            "branch_id": record.quote.branch_id,
            "customer_id": record.quote.customer_id,
            "payment_method_id": payment_method_id,
            "channel_origin": "pipeline",
            "quote_id": quote_id,
            "quote_version": expected_version,
            "discount_type": "fixed" if record.quote.discount_mode == "amount" else "percent",
            "discount_value": record.quote.discount_value,
            "notes": record.quote.notes,
            "reference": payment_reference,
            "lines": lines,
            "crm_relaxed_register": True,
        }
        if register_id is not None:
            checkout_values["register_id"] = register_id
        result = PosService(self._session).checkout(
            principal=principal,
            grant=sell_grant,
            values=checkout_values,
            idempotency_key=idempotency_key,
        )
        if record.quote.lead_id is not None and not replaying:
            lead = self._repository.lead(
                crm_grant.workspace_id,
                record.quote.lead_id,
                crm_grant.allowed_branch_ids,
                lock=True,
            )
            if (
                lead is not None
                and lead.converted_customer_id == record.quote.customer_id
                and lead.status != "cerrado"
            ):
                lead.status = "cerrado"
                lead.updated_by_platform_user_id = principal.platform_user_id
                lead.version += 1
                self._session.commit()
        return result

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
    ) -> CrmLead:
        branch_id = cast(UUID, values["branch_id"])
        self._require_branch(grant, branch_id)
        star_rating = values.get("star_rating")
        status = cast(str, values.get("status", "nuevo"))
        lost_reason = self._optional_text(cast(str | None, values.get("lost_reason")))
        if status == "perdido" and not lost_reason:
            raise InvalidOperationError("Un lead perdido requiere motivo.", "lostReason")
        pipeline_closed_at = datetime.now(UTC) if status == "perdido" else None
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
            instagram_url=str(values["instagram_url"]) if values.get("instagram_url") else None,
            location=self._optional_text(cast(str | None, values.get("location"))),
            source=cast(str, values.get("source", "manual")),
            acquisition_source=cast(str | None, values.get("acquisition_source")),
            source_url=str(values["source_url"]) if values.get("source_url") else None,
            scraped_at=cast(datetime | None, values.get("scraped_at")),
            raw_snippet=self._optional_text(cast(str | None, values.get("raw_snippet"))),
            status=status,
            star_rating=star_rating,
            pipeline_value=cast(Decimal, values.get("pipeline_value", Decimal("0"))),
            lost_reason=lost_reason if status == "perdido" else None,
            pipeline_closed_at=pipeline_closed_at,
            converted_customer_id=None,
            converted_at=None,
            creation_idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            conversion_idempotency_key=None,
            conversion_request_fingerprint=None,
            created_by_platform_user_id=principal.platform_user_id,
            updated_by_platform_user_id=principal.platform_user_id,
        )

    def _required_membership(self, grant: PermissionGrant) -> WorkspaceMembership:
        membership = self._repository.membership(grant.workspace_id, grant.membership_id)
        if membership is None:
            raise ResourceNotFoundError("La membresía activa no existe.", "membershipId")
        return membership

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

    @staticmethod
    def _import_idempotency_key(prefix: str, external_id: str) -> str:
        safe = external_id.strip()[:100]
        return f"{prefix}-{safe}"[:128]

    def import_pipeline(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        customer_grant: PermissionGrant,
        branch_id: UUID,
        assigned_membership_id: UUID | None,
        items: list[dict[str, Any]],
        batch_idempotency_key: str,
    ) -> list[dict[str, Any]]:
        self._require_branch(grant, branch_id)
        results: list[dict[str, Any]] = []
        for index, raw in enumerate(items, start=1):
            try:
                item = ImportPipelineItem.model_validate(raw).model_dump(by_alias=False)
            except ValidationError as exc:
                first = cast(dict[str, Any], exc.errors()[0])
                message = friendly_validation_message(first)
                if first.get("type") == "value_error":
                    raw_msg = str(first.get("msg", ""))
                    if raw_msg.startswith("Value error, "):
                        message = raw_msg.removeprefix("Value error, ")
                    elif raw_msg:
                        message = raw_msg
                external_hint = raw.get("external_id") or raw.get("externalId")
                results.append(
                    {
                        "external_id": external_hint,
                        "lead_id": None,
                        "customer_id": None,
                        "status": "error",
                        "message": message,
                    }
                )
                continue

            external_id = str(item.get("external_id") or index)
            try:
                lead_key = (
                    self._import_idempotency_key("pl-lead", external_id)
                    if item.get("external_id")
                    else f"{batch_idempotency_key[:118]}:{index}"
                )
                existing_lead = self._repository.lead_by_key(grant.workspace_id, lead_key)
                if existing_lead is None and item.get("external_id"):
                    existing_lead = self._repository.lead_by_import_external_id(
                        grant.workspace_id, str(item["external_id"])
                    )
                if existing_lead is not None:
                    self._require_branch(grant, existing_lead.branch_id)
                    lead_record = self._repository.lead_record(existing_lead)
                    results.append(
                        {
                            "external_id": item.get("external_id"),
                            "lead_id": lead_record.lead.id,
                            "customer_id": lead_record.lead.converted_customer_id,
                            "status": "skipped",
                            "message": "Ya importado para este externalId.",
                        }
                    )
                    continue

                lead_values = {
                    "branch_id": branch_id,
                    "name": item.get("name", ""),
                    "company": item.get("company", ""),
                    "email": item.get("email"),
                    "phone": item.get("phone"),
                    "website": item.get("website"),
                    "instagram_url": item.get("instagram_url"),
                    "location": item.get("location"),
                    "source": "import",
                    "acquisition_source": item.get("acquisition_source"),
                    "status": item.get("status", "nuevo"),
                    "pipeline_value": item.get("pipeline_value", Decimal("0")),
                    "lost_reason": item.get("lost_reason"),
                    "raw_snippet": f"kommo:{external_id}" if item.get("external_id") else None,
                }
                if assigned_membership_id is not None:
                    lead_values["assigned_membership_id"] = assigned_membership_id
                lead_record = self.create_lead(
                    principal=principal,
                    grant=grant,
                    values=lead_values,
                    idempotency_key=lead_key,
                )
                pipeline_status = cast(str, item.get("status", "nuevo"))
                if pipeline_status != lead_record.lead.status or item.get("pipeline_value"):
                    lead_record = self.update_lead(
                        principal=principal,
                        grant=grant,
                        lead_id=lead_record.lead.id,
                        expected_version=lead_record.lead.version,
                        changes={
                            "status": pipeline_status,
                            "pipeline_value": item.get("pipeline_value", Decimal("0")),
                            "lost_reason": item.get("lost_reason"),
                        },
                    )
                customer_id = None
                if item.get("convert"):
                    convert_key = self._import_idempotency_key("pl-conv", external_id)
                    customer_record = self.convert_lead(
                        principal=principal,
                        crm_grant=grant,
                        customer_grant=customer_grant,
                        lead_id=lead_record.lead.id,
                        values={
                            "version": lead_record.lead.version,
                            "customer_type": "person"
                            if not lead_record.lead.company
                            else "business",
                            "branch_ids": [branch_id],
                        },
                        idempotency_key=convert_key,
                    )
                    customer_id = customer_record.customer.id
                results.append(
                    {
                        "external_id": item.get("external_id"),
                        "lead_id": lead_record.lead.id,
                        "customer_id": customer_id,
                        "status": "created",
                        "message": None,
                    }
                )
            except Exception as exc:  # noqa: BLE001 - per-row import report
                results.append(
                    {
                        "external_id": item.get("external_id"),
                        "lead_id": None,
                        "customer_id": None,
                        "status": "error",
                        "message": str(exc),
                    }
                )
        return results

    def import_activities(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        branch_id: UUID,
        items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        self._require_branch(grant, branch_id)
        results: list[dict[str, Any]] = []
        for raw in items:
            external_id = raw.get("external_id")
            lead_external_id = raw.get("lead_external_id")
            try:
                if not lead_external_id:
                    raise InvalidOperationError(
                        "No se pudo vincular la actividad a un lead.", "leadExternalId"
                    )
                lead_key = self._import_idempotency_key("pl-lead", str(lead_external_id))
                lead = self._repository.lead_by_key(grant.workspace_id, lead_key)
                if lead is None:
                    raise ResourceNotFoundError("El lead importado no existe.", "leadExternalId")
                activity_key = self._import_idempotency_key(
                    "pl-act", str(external_id or f"{lead_external_id}-{raw.get('title')}")
                )
                activity = self.create_activity(
                    principal=principal,
                    grant=grant,
                    values={
                        "branch_id": branch_id,
                        "lead_id": lead.id,
                        "type": "tarea",
                        "title": raw["title"],
                        "description": raw.get("description"),
                        "due_at": raw.get("due_at"),
                        "customer_name": lead.company or lead.name,
                    },
                    idempotency_key=activity_key,
                )
                results.append(
                    {
                        "external_id": external_id,
                        "activity_id": activity.id,
                        "status": "created",
                        "message": None,
                    }
                )
            except Exception as exc:  # noqa: BLE001 - per-row import report
                results.append(
                    {
                        "external_id": external_id,
                        "activity_id": None,
                        "status": "error",
                        "message": str(exc),
                    }
                )
        return results

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
