from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.models import (
    AuditEntry,
    Branch,
    CrmActivity,
    CrmLead,
    CrmOpportunity,
    CrmSettings,
    Customer,
    CustomerBranchAssignment,
    CustomerCrmProfile,
    Sale,
    SalesQuote,
    Workspace,
    WorkspaceMembership,
)
from app.db.models.sales import SaleLine
from app.repositories.master_data import CustomerRecord, MasterDataRepository


@dataclass(frozen=True)
class EntityPage:
    items: tuple[Any, ...]
    total_items: int


@dataclass(frozen=True)
class LeadRecord:
    lead: CrmLead
    opportunity_id: UUID | None


@dataclass(frozen=True)
class OpportunityRecord:
    opportunity: CrmOpportunity
    quote_count: int


@dataclass(frozen=True)
class CustomerCommerce:
    purchase_count: int
    total_spent: Decimal
    last_purchase_at: datetime | None


@dataclass(frozen=True)
class CustomerCrmRecord:
    customer: CustomerRecord
    profile: CustomerCrmProfile
    converted_from_lead_id: UUID | None
    commerce: CustomerCommerce


@dataclass(frozen=True)
class CustomerCrmPage:
    items: tuple[CustomerCrmRecord, ...]
    total_items: int


@dataclass(frozen=True)
class OverviewValues:
    total_leads: int
    qualified_leads: int
    converted_this_month: int
    open_opportunities: int
    pipeline_value: Decimal
    overdue_activities: int
    pending_activities: int
    crm_quotes: int
    accepted_quotes: int
    customers_with_purchases: int
    sales_this_month: int
    sales_value_this_month: Decimal


class CrmRepository:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._master_data = MasterDataRepository(session)

    def workspace(self, workspace_id: UUID) -> Workspace | None:
        return self._session.get(Workspace, workspace_id)

    def branch(self, workspace_id: UUID, branch_id: UUID) -> Branch | None:
        return self._session.scalar(
            select(Branch).where(
                Branch.workspace_id == workspace_id,
                Branch.id == branch_id,
                Branch.status == "active",
            )
        )

    def membership(self, workspace_id: UUID, membership_id: UUID) -> WorkspaceMembership | None:
        return self._session.scalar(
            select(WorkspaceMembership).where(
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.id == membership_id,
                WorkspaceMembership.status == "active",
            )
        )

    def customer(
        self,
        workspace_id: UUID,
        customer_id: UUID,
        *,
        branch_id: UUID | None = None,
        allowed_branch_ids: frozenset[UUID] | None = None,
    ) -> Customer | None:
        query = (
            select(Customer)
            .join(
                CustomerBranchAssignment,
                (CustomerBranchAssignment.workspace_id == Customer.workspace_id)
                & (CustomerBranchAssignment.customer_id == Customer.id),
            )
            .where(
                Customer.workspace_id == workspace_id,
                Customer.id == customer_id,
                CustomerBranchAssignment.status == "active",
            )
        )
        if branch_id is not None:
            query = query.where(CustomerBranchAssignment.branch_id == branch_id)
        if allowed_branch_ids is not None:
            query = query.where(CustomerBranchAssignment.branch_id.in_(allowed_branch_ids))
        return self._session.scalar(query.limit(1))

    def settings(self, workspace_id: UUID, *, lock: bool = False) -> CrmSettings | None:
        query = select(CrmSettings).where(CrmSettings.workspace_id == workspace_id)
        if lock:
            query = query.with_for_update()
        return self._session.scalar(query)

    def add_settings(self, settings: CrmSettings) -> None:
        self._session.add(settings)
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
        details: dict[str, Any],
    ) -> None:
        self._session.add(
            AuditEntry(
                workspace_id=workspace_id,
                actor_platform_user_id=actor_platform_user_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                outcome="success",
                request_id=request_id,
                details=details,
            )
        )

    def lead_by_key(self, workspace_id: UUID, idempotency_key: str) -> CrmLead | None:
        return self._session.scalar(
            select(CrmLead).where(
                CrmLead.workspace_id == workspace_id,
                CrmLead.creation_idempotency_key == idempotency_key,
            )
        )

    def lead(
        self,
        workspace_id: UUID,
        lead_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        *,
        lock: bool = False,
    ) -> CrmLead | None:
        query = select(CrmLead).where(
            CrmLead.workspace_id == workspace_id,
            CrmLead.id == lead_id,
        )
        if allowed_branch_ids is not None:
            query = query.where(CrmLead.branch_id.in_(allowed_branch_ids))
        if lock:
            query = query.with_for_update()
        return self._session.scalar(query)

    def add_lead(self, lead: CrmLead) -> None:
        self._session.add(lead)
        self._session.flush()

    def workspace_leads(self, workspace_id: UUID) -> tuple[CrmLead, ...]:
        return tuple(
            self._session.scalars(select(CrmLead).where(CrmLead.workspace_id == workspace_id)).all()
        )

    def lead_record(self, lead: CrmLead) -> LeadRecord:
        opportunity_id = self._session.scalar(
            select(CrmOpportunity.id).where(
                CrmOpportunity.workspace_id == lead.workspace_id,
                CrmOpportunity.lead_id == lead.id,
            )
        )
        return LeadRecord(lead, opportunity_id)

    def list_leads(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        status: str | None,
        source: str | None,
        search: str | None,
        page: int,
        page_size: int,
    ) -> EntityPage:
        query = select(CrmLead).where(CrmLead.workspace_id == workspace_id)
        if allowed_branch_ids is not None:
            query = query.where(CrmLead.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            query = query.where(CrmLead.branch_id == branch_id)
        if status is not None:
            query = query.where(CrmLead.status == status)
        if source is not None:
            query = query.where(CrmLead.source == source)
        if search:
            pattern = f"%{search.casefold()}%"
            query = query.where(
                or_(
                    func.lower(CrmLead.name).like(pattern),
                    func.lower(CrmLead.company).like(pattern),
                    func.lower(func.coalesce(CrmLead.email, "")).like(pattern),
                    func.lower(func.coalesce(CrmLead.phone, "")).like(pattern),
                    func.lower(func.coalesce(CrmLead.location, "")).like(pattern),
                )
            )
        total = int(self._session.scalar(select(func.count()).select_from(query.subquery())) or 0)
        rows = self._session.scalars(
            query.order_by(CrmLead.updated_at.desc(), CrmLead.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        opportunity_rows = (
            self._session.execute(
                select(CrmOpportunity.lead_id, CrmOpportunity.id).where(
                    CrmOpportunity.workspace_id == workspace_id,
                    CrmOpportunity.lead_id.in_([row.id for row in rows]),
                )
            )
            if rows
            else ()
        )
        opportunity_by_lead = {row[0]: row[1] for row in opportunity_rows}
        return EntityPage(
            tuple(LeadRecord(row, opportunity_by_lead.get(row.id)) for row in rows),
            total,
        )

    def opportunity_by_key(self, workspace_id: UUID, idempotency_key: str) -> CrmOpportunity | None:
        return self._session.scalar(
            select(CrmOpportunity).where(
                CrmOpportunity.workspace_id == workspace_id,
                CrmOpportunity.creation_idempotency_key == idempotency_key,
            )
        )

    def opportunity(
        self,
        workspace_id: UUID,
        opportunity_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        *,
        lock: bool = False,
    ) -> CrmOpportunity | None:
        query = select(CrmOpportunity).where(
            CrmOpportunity.workspace_id == workspace_id,
            CrmOpportunity.id == opportunity_id,
        )
        if allowed_branch_ids is not None:
            query = query.where(CrmOpportunity.branch_id.in_(allowed_branch_ids))
        if lock:
            query = query.with_for_update()
        return self._session.scalar(query)

    def opportunity_for_lead(self, workspace_id: UUID, lead_id: UUID) -> CrmOpportunity | None:
        return self._session.scalar(
            select(CrmOpportunity).where(
                CrmOpportunity.workspace_id == workspace_id,
                CrmOpportunity.lead_id == lead_id,
            )
        )

    def add_opportunity(self, opportunity: CrmOpportunity) -> None:
        self._session.add(opportunity)
        self._session.flush()

    def opportunity_record(self, opportunity: CrmOpportunity) -> OpportunityRecord:
        quote_count = int(
            self._session.scalar(
                select(func.count(SalesQuote.id)).where(
                    SalesQuote.workspace_id == opportunity.workspace_id,
                    SalesQuote.opportunity_id == opportunity.id,
                )
            )
            or 0
        )
        return OpportunityRecord(opportunity, quote_count)

    def list_opportunities(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        stage: str | None,
        customer_id: UUID | None,
        search: str | None,
        page: int,
        page_size: int,
    ) -> EntityPage:
        query = select(CrmOpportunity).where(CrmOpportunity.workspace_id == workspace_id)
        if allowed_branch_ids is not None:
            query = query.where(CrmOpportunity.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            query = query.where(CrmOpportunity.branch_id == branch_id)
        if stage is not None:
            query = query.where(CrmOpportunity.stage == stage)
        if customer_id is not None:
            query = query.where(CrmOpportunity.customer_id == customer_id)
        if search:
            pattern = f"%{search.casefold()}%"
            query = query.where(
                or_(
                    func.lower(CrmOpportunity.title).like(pattern),
                    func.lower(CrmOpportunity.customer_name).like(pattern),
                )
            )
        total = int(self._session.scalar(select(func.count()).select_from(query.subquery())) or 0)
        rows = self._session.scalars(
            query.order_by(CrmOpportunity.updated_at.desc(), CrmOpportunity.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        counts: dict[UUID, int] = {}
        if rows:
            for opportunity_id, count in self._session.execute(
                select(SalesQuote.opportunity_id, func.count(SalesQuote.id))
                .where(
                    SalesQuote.workspace_id == workspace_id,
                    SalesQuote.opportunity_id.in_([row.id for row in rows]),
                )
                .group_by(SalesQuote.opportunity_id)
            ):
                if opportunity_id is not None:
                    counts[opportunity_id] = int(count)
        return EntityPage(
            tuple(OpportunityRecord(row, int(counts.get(row.id, 0))) for row in rows), total
        )

    def activity_by_key(self, workspace_id: UUID, idempotency_key: str) -> CrmActivity | None:
        return self._session.scalar(
            select(CrmActivity).where(
                CrmActivity.workspace_id == workspace_id,
                CrmActivity.creation_idempotency_key == idempotency_key,
            )
        )

    def activity(
        self,
        workspace_id: UUID,
        activity_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        *,
        lock: bool = False,
    ) -> CrmActivity | None:
        query = select(CrmActivity).where(
            CrmActivity.workspace_id == workspace_id,
            CrmActivity.id == activity_id,
        )
        if allowed_branch_ids is not None:
            query = query.where(CrmActivity.branch_id.in_(allowed_branch_ids))
        if lock:
            query = query.with_for_update()
        return self._session.scalar(query)

    def add_activity(self, activity: CrmActivity) -> None:
        self._session.add(activity)
        self._session.flush()

    def list_activities(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        activity_type: str | None,
        completed: bool | None,
        overdue: bool | None,
        opportunity_id: UUID | None,
        customer_id: UUID | None,
        now: datetime,
        page: int,
        page_size: int,
    ) -> EntityPage:
        query = select(CrmActivity).where(CrmActivity.workspace_id == workspace_id)
        if allowed_branch_ids is not None:
            query = query.where(CrmActivity.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            query = query.where(CrmActivity.branch_id == branch_id)
        if activity_type is not None:
            query = query.where(CrmActivity.activity_type == activity_type)
        if completed is True:
            query = query.where(CrmActivity.completed_at.is_not(None))
        elif completed is False:
            query = query.where(CrmActivity.completed_at.is_(None))
        if overdue is True:
            query = query.where(
                CrmActivity.completed_at.is_(None),
                CrmActivity.due_at.is_not(None),
                CrmActivity.due_at < now,
            )
        elif overdue is False:
            query = query.where(or_(CrmActivity.due_at.is_(None), CrmActivity.due_at >= now))
        if opportunity_id is not None:
            query = query.where(CrmActivity.opportunity_id == opportunity_id)
        if customer_id is not None:
            query = query.where(CrmActivity.customer_id == customer_id)
        total = int(self._session.scalar(select(func.count()).select_from(query.subquery())) or 0)
        rows = self._session.scalars(
            query.order_by(
                CrmActivity.completed_at.asc().nullsfirst(),
                CrmActivity.due_at.asc().nullslast(),
                CrmActivity.created_at.desc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return EntityPage(tuple(rows), total)

    def customer_profile(
        self, workspace_id: UUID, customer_id: UUID, *, lock: bool = False
    ) -> CustomerCrmProfile | None:
        query = select(CustomerCrmProfile).where(
            CustomerCrmProfile.workspace_id == workspace_id,
            CustomerCrmProfile.customer_id == customer_id,
        )
        if lock:
            query = query.with_for_update()
        return self._session.scalar(query)

    def add_customer_profile(self, profile: CustomerCrmProfile) -> None:
        self._session.add(profile)
        self._session.flush()

    def list_customers(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        lifecycle_status: str | None,
        search: str | None,
        page: int,
        page_size: int,
    ) -> CustomerCrmPage:
        query = (
            select(Customer)
            .join(
                CustomerBranchAssignment,
                (CustomerBranchAssignment.workspace_id == Customer.workspace_id)
                & (CustomerBranchAssignment.customer_id == Customer.id),
            )
            .join(
                CustomerCrmProfile,
                (CustomerCrmProfile.workspace_id == Customer.workspace_id)
                & (CustomerCrmProfile.customer_id == Customer.id),
            )
            .where(
                Customer.workspace_id == workspace_id,
                Customer.status != "archived",
                CustomerBranchAssignment.status == "active",
            )
            .distinct()
        )
        if allowed_branch_ids is not None:
            query = query.where(CustomerBranchAssignment.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            query = query.where(CustomerBranchAssignment.branch_id == branch_id)
        if lifecycle_status is not None:
            query = query.where(CustomerCrmProfile.lifecycle_status == lifecycle_status)
        if search:
            pattern = f"%{search}%"
            query = query.where(
                or_(
                    Customer.normalized_name.ilike(pattern),
                    Customer.normalized_email.ilike(pattern),
                    Customer.normalized_phone.ilike(pattern),
                )
            )

        total = int(
            self._session.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
            or 0
        )
        customers = self._session.scalars(
            query.order_by(Customer.normalized_name.asc(), Customer.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        records = list(self._master_data.customer_records(customers))
        customer_ids = {record.id for record in records}
        profiles = (
            {
                profile.customer_id: profile
                for profile in self._session.scalars(
                    select(CustomerCrmProfile).where(
                        CustomerCrmProfile.workspace_id == workspace_id,
                        CustomerCrmProfile.customer_id.in_(customer_ids),
                    )
                )
            }
            if customer_ids
            else {}
        )
        commerce = self.customer_commerce(
            workspace_id=workspace_id,
            customer_ids={record.id for record in records},
            allowed_branch_ids=allowed_branch_ids,
            branch_id=branch_id,
        )
        converted: dict[UUID, UUID] = {}
        if records:
            for converted_customer_id, lead_id in self._session.execute(
                select(CrmLead.converted_customer_id, CrmLead.id).where(
                    CrmLead.workspace_id == workspace_id,
                    CrmLead.converted_customer_id.in_([record.id for record in records]),
                )
            ):
                if converted_customer_id is not None:
                    converted[converted_customer_id] = lead_id
        items = tuple(
            CustomerCrmRecord(
                customer=record,
                profile=profiles[record.id],
                converted_from_lead_id=converted.get(record.id),
                commerce=commerce.get(record.id, CustomerCommerce(0, Decimal("0"), None)),
            )
            for record in records
            if record.id in profiles
        )
        return CustomerCrmPage(items, total)

    def customer_record(
        self,
        *,
        workspace_id: UUID,
        customer_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> CustomerCrmRecord | None:
        customer = self._master_data.get_customer(workspace_id, customer_id, allowed_branch_ids)
        if customer is None:
            return None
        profile = self.customer_profile(workspace_id, customer_id)
        if profile is None:
            return None
        record = self._master_data.customer_record(customer)
        commerce = self.customer_commerce(
            workspace_id=workspace_id,
            customer_ids={customer_id},
            allowed_branch_ids=allowed_branch_ids,
            branch_id=None,
        ).get(customer_id, CustomerCommerce(0, Decimal("0"), None))
        lead_id = self._session.scalar(
            select(CrmLead.id).where(
                CrmLead.workspace_id == workspace_id,
                CrmLead.converted_customer_id == customer_id,
            )
        )
        return CustomerCrmRecord(record, profile, lead_id, commerce)

    def customer_commerce(
        self,
        *,
        workspace_id: UUID,
        customer_ids: set[UUID],
        allowed_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> dict[UUID, CustomerCommerce]:
        if not customer_ids:
            return {}
        query = (
            select(
                Sale.customer_id,
                func.count(Sale.id),
                func.coalesce(func.sum(Sale.total), 0),
                func.max(Sale.completed_at),
            )
            .where(
                Sale.workspace_id == workspace_id,
                Sale.customer_id.in_(customer_ids),
                Sale.status == "completed",
            )
            .group_by(Sale.customer_id)
        )
        if allowed_branch_ids is not None:
            query = query.where(Sale.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            query = query.where(Sale.branch_id == branch_id)
        return {
            row[0]: CustomerCommerce(int(row[1]), Decimal(row[2]), row[3])
            for row in self._session.execute(query)
            if row[0] is not None
        }

    def customer_purchases(
        self,
        *,
        workspace_id: UUID,
        customer_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> tuple[Sale, ...]:
        query = select(Sale).where(
            Sale.workspace_id == workspace_id,
            Sale.customer_id == customer_id,
        )
        if allowed_branch_ids is not None:
            query = query.where(Sale.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            query = query.where(Sale.branch_id == branch_id)
        return tuple(
            self._session.scalars(query.order_by(Sale.completed_at.desc(), Sale.id.desc())).all()
        )

    def sale_lines(self, workspace_id: UUID, sale_id: UUID) -> tuple[SaleLine, ...]:
        return tuple(
            self._session.scalars(
                select(SaleLine)
                .where(SaleLine.workspace_id == workspace_id, SaleLine.sale_id == sale_id)
                .order_by(SaleLine.position)
            ).all()
        )

    def overview(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        month_start: datetime,
        month_end: datetime,
        now: datetime,
    ) -> OverviewValues:
        def scope(query: Any, column: Any) -> Any:
            if allowed_branch_ids is not None:
                query = query.where(column.in_(allowed_branch_ids))
            if branch_id is not None:
                query = query.where(column == branch_id)
            return query

        lead_base = scope(
            select(func.count(CrmLead.id)).where(CrmLead.workspace_id == workspace_id),
            CrmLead.branch_id,
        )
        total_leads = int(self._session.scalar(lead_base) or 0)
        qualified = int(self._session.scalar(lead_base.where(CrmLead.status == "calificado")) or 0)
        converted = int(
            self._session.scalar(
                lead_base.where(
                    CrmLead.status == "convertido",
                    CrmLead.converted_at >= month_start,
                    CrmLead.converted_at < month_end,
                )
            )
            or 0
        )
        opportunity_base = scope(
            select(
                func.count(CrmOpportunity.id),
                func.coalesce(func.sum(CrmOpportunity.value), 0),
            ).where(
                CrmOpportunity.workspace_id == workspace_id,
                CrmOpportunity.stage.not_in(("cerrado", "perdido")),
            ),
            CrmOpportunity.branch_id,
        )
        opportunity_row = self._session.execute(opportunity_base).one()
        activity_base = scope(
            select(func.count(CrmActivity.id)).where(
                CrmActivity.workspace_id == workspace_id,
                CrmActivity.completed_at.is_(None),
            ),
            CrmActivity.branch_id,
        )
        pending = int(self._session.scalar(activity_base) or 0)
        overdue = int(
            self._session.scalar(
                activity_base.where(CrmActivity.due_at.is_not(None), CrmActivity.due_at < now)
            )
            or 0
        )
        quote_base = scope(
            select(func.count(SalesQuote.id)).where(
                SalesQuote.workspace_id == workspace_id,
                SalesQuote.origin == "crm",
            ),
            SalesQuote.branch_id,
        )
        quote_count = int(self._session.scalar(quote_base) or 0)
        accepted = int(
            self._session.scalar(quote_base.where(SalesQuote.crm_status == "aceptada")) or 0
        )
        sale_base = scope(
            select(
                func.count(Sale.id),
                func.coalesce(func.sum(Sale.total), 0),
                func.count(func.distinct(Sale.customer_id)),
            ).where(
                Sale.workspace_id == workspace_id,
                Sale.status == "completed",
                Sale.completed_at >= month_start,
                Sale.completed_at < month_end,
            ),
            Sale.branch_id,
        )
        sale_row = self._session.execute(sale_base).one()
        customer_base = scope(
            select(func.count(func.distinct(Sale.customer_id))).where(
                Sale.workspace_id == workspace_id,
                Sale.status == "completed",
                Sale.customer_id.is_not(None),
            ),
            Sale.branch_id,
        )
        customers_with_purchases = int(self._session.scalar(customer_base) or 0)
        return OverviewValues(
            total_leads=total_leads,
            qualified_leads=qualified,
            converted_this_month=converted,
            open_opportunities=int(opportunity_row[0]),
            pipeline_value=Decimal(opportunity_row[1]),
            overdue_activities=overdue,
            pending_activities=pending,
            crm_quotes=quote_count,
            accepted_quotes=accepted,
            customers_with_purchases=customers_with_purchases,
            sales_this_month=int(sale_row[0]),
            sales_value_this_month=Decimal(sale_row[1]),
        )
