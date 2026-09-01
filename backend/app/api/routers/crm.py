from __future__ import annotations

from datetime import date
from math import ceil
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Header, Query, Response, status

from app.api.deps import (
    CrmManageGrant,
    CrmReadGrant,
    CurrentPrincipal,
    CustomerManageGrant,
    DatabaseSession,
    SalesQuoteManageGrant,
    SalesReadGrant,
)
from app.api.routers.pos import (
    _quote_detail_response,
    _quote_list_response,
    _sale_detail_response,
    _sale_list_response,
)
from app.repositories.crm import CustomerCrmRecord, LeadRecord, OpportunityRecord
from app.repositories.pos import QuoteRecord
from app.schemas.common import ErrorResponse
from app.schemas.crm import (
    ActivityResponse,
    ActivityStateRequest,
    ActivityType,
    ConvertLeadRequest,
    CreateActivityRequest,
    CreateCrmQuoteRequest,
    CreateLeadOpportunityRequest,
    CreateLeadRequest,
    CreateOpportunityRequest,
    CrmBranchReference,
    CrmOverviewResponse,
    CrmQuoteListResponse,
    CrmQuoteResponse,
    CrmQuoteStatus,
    CrmStateResponse,
    CustomerCrmResponse,
    CustomerLifecycleStatus,
    CustomerPurchaseResponse,
    CustomerPurchasesResponse,
    ImportedLeadsResponse,
    ImportLeadsRequest,
    LeadDiscoveryCandidateResponse,
    LeadDiscoveryCapabilitiesResponse,
    LeadDiscoverySearchRequest,
    LeadDiscoverySearchResponse,
    LeadResponse,
    LeadSource,
    LeadStatus,
    OpportunityResponse,
    OpportunityStage,
    PaginatedActivitiesResponse,
    PaginatedCrmCustomersResponse,
    PaginatedCrmQuotesResponse,
    PaginatedLeadsResponse,
    PaginatedOpportunitiesResponse,
    ScoringSettingsResponse,
    UpdateActivityRequest,
    UpdateCrmQuoteRequest,
    UpdateCustomerCrmProfileRequest,
    UpdateLeadRequest,
    UpdateOpportunityRequest,
    UpdateScoringSettingsRequest,
)
from app.schemas.pos import (
    PaginatedSalesResponse,
    SaleDetailResponse,
    SaleStatus,
    VoidRequest,
)
from app.services.crm import CrmService, ScoringSettingsRecord
from app.services.crm_discovery import CrmDiscoveryService, LeadDiscoveryQuery

router = APIRouter(prefix="/api/v1/crm", tags=["CRM"])

_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse},
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
}
IdempotencyKey = Annotated[
    str,
    Header(alias="Idempotency-Key", min_length=8, max_length=128),
]


@router.get("/discovery/capabilities", responses=_RESPONSES)
def discovery_capabilities(
    response: Response,
    grant: CrmReadGrant,
) -> LeadDiscoveryCapabilitiesResponse:
    del grant
    response.headers["Cache-Control"] = "no-store"
    capabilities = CrmDiscoveryService().capabilities()
    return LeadDiscoveryCapabilitiesResponse(
        enabled=capabilities.enabled,
        provider=cast(Any, capabilities.provider),
        status=cast(Any, capabilities.status),
        hour_limit=capabilities.hour_limit,
        month_limit=capabilities.month_limit,
    )


@router.post("/discovery/search", responses=_RESPONSES)
def discover_leads(
    payload: LeadDiscoverySearchRequest,
    grant: CrmManageGrant,
) -> LeadDiscoverySearchResponse:
    del grant
    candidates = CrmDiscoveryService().search(
        LeadDiscoveryQuery(
            query=payload.query,
            location=payload.location,
            limit=payload.limit,
        )
    )
    return LeadDiscoverySearchResponse(
        provider="serpapi",
        items=[
            LeadDiscoveryCandidateResponse(
                name=candidate.name,
                company=candidate.company,
                phone=candidate.phone,
                website=candidate.website,
                location=candidate.location,
                source_url=candidate.source_url,
                raw_snippet=candidate.raw_snippet,
            )
            for candidate in candidates
        ],
    )


def _lead_response(record: LeadRecord) -> LeadResponse:
    lead = record.lead
    return LeadResponse(
        id=lead.id,
        branch_id=lead.branch_id,
        assigned_membership_id=lead.assigned_membership_id,
        name=lead.name,
        company=lead.company,
        email=lead.email,
        phone=lead.phone,
        website=lead.website,
        location=lead.location,
        source=cast(Any, lead.source),
        source_url=lead.source_url,
        scraped_at=lead.scraped_at,
        raw_snippet=lead.raw_snippet,
        status=cast(Any, lead.status),
        score_auto=lead.score_auto,
        score_manual=lead.score_manual,
        score=lead.score,
        module_fits=lead.module_fits,
        score_reasons=lead.score_reasons,
        score_notes=lead.score_notes,
        customer_id=lead.converted_customer_id,
        opportunity_id=record.opportunity_id,
        converted_at=lead.converted_at,
        version=lead.version,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
    )


def _opportunity_response(record: OpportunityRecord) -> OpportunityResponse:
    opportunity = record.opportunity
    return OpportunityResponse(
        id=opportunity.id,
        branch_id=opportunity.branch_id,
        lead_id=opportunity.lead_id,
        customer_id=opportunity.customer_id,
        assigned_membership_id=opportunity.assigned_membership_id,
        title=opportunity.title,
        customer_name=opportunity.customer_name,
        stage=cast(Any, opportunity.stage),
        value=opportunity.value,
        currency_code=opportunity.currency_code,
        notes=opportunity.notes,
        lost_reason=opportunity.lost_reason,
        closed_at=opportunity.closed_at,
        quote_count=record.quote_count,
        version=opportunity.version,
        created_at=opportunity.created_at,
        updated_at=opportunity.updated_at,
    )


def _activity_response(activity: Any) -> ActivityResponse:
    return ActivityResponse(
        id=activity.id,
        branch_id=activity.branch_id,
        lead_id=activity.lead_id,
        opportunity_id=activity.opportunity_id,
        customer_id=activity.customer_id,
        assigned_membership_id=activity.assigned_membership_id,
        type=activity.activity_type,
        title=activity.title,
        description=activity.description,
        customer_name=activity.customer_name,
        due_at=activity.due_at,
        completed_at=activity.completed_at,
        version=activity.version,
        created_at=activity.created_at,
        updated_at=activity.updated_at,
    )


def _settings_response(record: ScoringSettingsRecord) -> ScoringSettingsResponse:
    return ScoringSettingsResponse(
        weights={key: float(value) for key, value in record.settings.scoring_weights.items()},
        hour_limit=record.hour_limit,
        month_limit=record.month_limit,
        version=record.settings.version,
        updated_at=record.settings.updated_at,
    )


def _customer_response(record: CustomerCrmRecord) -> CustomerCrmResponse:
    customer = record.customer
    return CustomerCrmResponse(
        id=customer.id,
        customer_type=cast(Any, customer.customer_type),
        display_name=customer.display_name,
        business_name=customer.business_name,
        email=customer.email,
        phone=customer.phone,
        branches=[
            CrmBranchReference(id=branch.id, code=branch.code, name=branch.name)
            for branch in customer.branches
        ],
        master_status=cast(Any, customer.status),
        lifecycle_status=cast(Any, record.profile.lifecycle_status),
        loyalty_points=record.profile.loyalty_points,
        notes=record.profile.notes,
        converted_from_lead_id=record.converted_from_lead_id,
        purchase_count=record.commerce.purchase_count,
        total_spent=record.commerce.total_spent,
        last_purchase_at=record.commerce.last_purchase_at,
        version=customer.version,
        profile_version=record.profile.version,
        created_at=customer.created_at,
        updated_at=max(customer.updated_at, record.profile.updated_at),
    )


def _crm_quote_list_response(record: QuoteRecord) -> CrmQuoteListResponse:
    return CrmQuoteListResponse(
        quote=_quote_list_response(record),
        opportunity_id=record.quote.opportunity_id,
        crm_status=cast(Any, record.quote.crm_status),
    )


def _crm_quote_response(record: QuoteRecord) -> CrmQuoteResponse:
    return CrmQuoteResponse(
        quote=_quote_detail_response(record),
        opportunity_id=record.quote.opportunity_id,
        crm_status=cast(Any, record.quote.crm_status),
    )


@router.get("/settings/scoring", responses=_RESPONSES)
def get_scoring_settings(
    response: Response,
    database: DatabaseSession,
    grant: CrmReadGrant,
) -> ScoringSettingsResponse:
    response.headers["Cache-Control"] = "no-store"
    return _settings_response(CrmService(database).scoring_settings(grant))


@router.patch("/settings/scoring", responses=_RESPONSES)
def update_scoring_settings(
    payload: UpdateScoringSettingsRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CrmManageGrant,
) -> ScoringSettingsResponse:
    return _settings_response(
        CrmService(database).update_scoring_settings(
            principal=principal,
            grant=grant,
            expected_version=payload.version,
            weights=payload.weights,
        )
    )


@router.get("/leads", responses=_RESPONSES)
def list_leads(
    response: Response,
    database: DatabaseSession,
    grant: CrmReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    status_filter: Annotated[LeadStatus | None, Query(alias="status")] = None,
    source: LeadSource | None = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
) -> PaginatedLeadsResponse:
    response.headers["Cache-Control"] = "no-store"
    result = CrmService(database).list_leads(
        grant,
        branch_id=branch_id,
        status=status_filter,
        source=source,
        search=search,
        page=page,
        page_size=page_size,
    )
    return PaginatedLeadsResponse(
        items=[_lead_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=result.total_pages,
    )


@router.post("/leads", status_code=status.HTTP_201_CREATED, responses=_RESPONSES)
def create_lead(
    payload: CreateLeadRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CrmManageGrant,
    idempotency_key: IdempotencyKey,
) -> LeadResponse:
    return _lead_response(
        CrmService(database).create_lead(
            principal=principal,
            grant=grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.post("/leads/import", status_code=status.HTTP_201_CREATED, responses=_RESPONSES)
def import_leads(
    payload: ImportLeadsRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CrmManageGrant,
    idempotency_key: IdempotencyKey,
) -> ImportedLeadsResponse:
    records = CrmService(database).import_leads(
        principal=principal,
        grant=grant,
        values=payload.model_dump(by_alias=False),
        idempotency_key=idempotency_key,
    )
    return ImportedLeadsResponse(items=[_lead_response(record) for record in records])


@router.get("/leads/{lead_id}", responses=_RESPONSES)
def get_lead(
    lead_id: UUID,
    database: DatabaseSession,
    grant: CrmReadGrant,
) -> LeadResponse:
    return _lead_response(CrmService(database).get_lead(grant, lead_id))


@router.patch("/leads/{lead_id}", responses=_RESPONSES)
def update_lead(
    lead_id: UUID,
    payload: UpdateLeadRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CrmManageGrant,
) -> LeadResponse:
    return _lead_response(
        CrmService(database).update_lead(
            principal=principal,
            grant=grant,
            lead_id=lead_id,
            expected_version=payload.version,
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        )
    )


@router.post("/leads/{lead_id}/convert", responses=_RESPONSES)
def convert_lead(
    lead_id: UUID,
    payload: ConvertLeadRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    crm_grant: CrmManageGrant,
    customer_grant: CustomerManageGrant,
    idempotency_key: IdempotencyKey,
) -> CustomerCrmResponse:
    return _customer_response(
        CrmService(database).convert_lead(
            principal=principal,
            crm_grant=crm_grant,
            customer_grant=customer_grant,
            lead_id=lead_id,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.post(
    "/leads/{lead_id}/opportunity",
    status_code=status.HTTP_201_CREATED,
    responses=_RESPONSES,
)
def create_lead_opportunity(
    lead_id: UUID,
    payload: CreateLeadOpportunityRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CrmManageGrant,
    idempotency_key: IdempotencyKey,
) -> OpportunityResponse:
    return _opportunity_response(
        CrmService(database).create_opportunity_for_lead(
            principal=principal,
            grant=grant,
            lead_id=lead_id,
            values=payload.model_dump(exclude_unset=True, by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.get("/opportunities", responses=_RESPONSES)
def list_opportunities(
    response: Response,
    database: DatabaseSession,
    grant: CrmReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    stage_filter: Annotated[OpportunityStage | None, Query(alias="stage")] = None,
    customer_id: Annotated[UUID | None, Query(alias="customerId")] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
) -> PaginatedOpportunitiesResponse:
    response.headers["Cache-Control"] = "no-store"
    result = CrmService(database).list_opportunities(
        grant,
        branch_id=branch_id,
        stage=stage_filter,
        customer_id=customer_id,
        search=search,
        page=page,
        page_size=page_size,
    )
    return PaginatedOpportunitiesResponse(
        items=[_opportunity_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=result.total_pages,
    )


@router.post("/opportunities", status_code=status.HTTP_201_CREATED, responses=_RESPONSES)
def create_opportunity(
    payload: CreateOpportunityRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CrmManageGrant,
    idempotency_key: IdempotencyKey,
) -> OpportunityResponse:
    return _opportunity_response(
        CrmService(database).create_opportunity(
            principal=principal,
            grant=grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.get("/opportunities/{opportunity_id}", responses=_RESPONSES)
def get_opportunity(
    opportunity_id: UUID,
    database: DatabaseSession,
    grant: CrmReadGrant,
) -> OpportunityResponse:
    return _opportunity_response(CrmService(database).get_opportunity(grant, opportunity_id))


@router.patch("/opportunities/{opportunity_id}", responses=_RESPONSES)
def update_opportunity(
    opportunity_id: UUID,
    payload: UpdateOpportunityRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CrmManageGrant,
) -> OpportunityResponse:
    return _opportunity_response(
        CrmService(database).update_opportunity(
            principal=principal,
            grant=grant,
            opportunity_id=opportunity_id,
            expected_version=payload.version,
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        )
    )


@router.get("/activities", responses=_RESPONSES)
def list_activities(
    response: Response,
    database: DatabaseSession,
    grant: CrmReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    activity_type: Annotated[ActivityType | None, Query(alias="type")] = None,
    completed: bool | None = None,
    overdue: bool | None = None,
    opportunity_id: Annotated[UUID | None, Query(alias="opportunityId")] = None,
    customer_id: Annotated[UUID | None, Query(alias="customerId")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
) -> PaginatedActivitiesResponse:
    response.headers["Cache-Control"] = "no-store"
    result = CrmService(database).list_activities(
        grant,
        branch_id=branch_id,
        activity_type=activity_type,
        completed=completed,
        overdue=overdue,
        opportunity_id=opportunity_id,
        customer_id=customer_id,
        page=page,
        page_size=page_size,
    )
    return PaginatedActivitiesResponse(
        items=[_activity_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=result.total_pages,
    )


@router.post("/activities", status_code=status.HTTP_201_CREATED, responses=_RESPONSES)
def create_activity(
    payload: CreateActivityRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CrmManageGrant,
    idempotency_key: IdempotencyKey,
) -> ActivityResponse:
    return _activity_response(
        CrmService(database).create_activity(
            principal=principal,
            grant=grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.get("/activities/{activity_id}", responses=_RESPONSES)
def get_activity(
    activity_id: UUID,
    database: DatabaseSession,
    grant: CrmReadGrant,
) -> ActivityResponse:
    return _activity_response(CrmService(database).get_activity(grant, activity_id))


@router.patch("/activities/{activity_id}", responses=_RESPONSES)
def update_activity(
    activity_id: UUID,
    payload: UpdateActivityRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CrmManageGrant,
) -> ActivityResponse:
    return _activity_response(
        CrmService(database).update_activity(
            principal=principal,
            grant=grant,
            activity_id=activity_id,
            expected_version=payload.version,
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        )
    )


@router.post("/activities/{activity_id}/complete", responses=_RESPONSES)
def complete_activity(
    activity_id: UUID,
    payload: ActivityStateRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CrmManageGrant,
) -> ActivityResponse:
    return _activity_response(
        CrmService(database).set_activity_completion(
            principal=principal,
            grant=grant,
            activity_id=activity_id,
            expected_version=payload.version,
            completed=True,
        )
    )


@router.post("/activities/{activity_id}/reopen", responses=_RESPONSES)
def reopen_activity(
    activity_id: UUID,
    payload: ActivityStateRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CrmManageGrant,
) -> ActivityResponse:
    return _activity_response(
        CrmService(database).set_activity_completion(
            principal=principal,
            grant=grant,
            activity_id=activity_id,
            expected_version=payload.version,
            completed=False,
        )
    )


@router.get("/customers", responses=_RESPONSES)
def list_customers(
    response: Response,
    database: DatabaseSession,
    grant: CrmReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    lifecycle_status: Annotated[CustomerLifecycleStatus | None, Query(alias="status")] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
) -> PaginatedCrmCustomersResponse:
    response.headers["Cache-Control"] = "no-store"
    result = CrmService(database).list_customers(
        grant,
        branch_id=branch_id,
        lifecycle_status=lifecycle_status,
        search=search,
        page=page,
        page_size=page_size,
    )
    return PaginatedCrmCustomersResponse(
        items=[_customer_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=result.total_pages,
    )


@router.get("/customers/{customer_id}", responses=_RESPONSES)
def get_customer(
    customer_id: UUID,
    database: DatabaseSession,
    grant: CrmReadGrant,
) -> CustomerCrmResponse:
    return _customer_response(CrmService(database).get_customer(grant, customer_id))


@router.patch("/customers/{customer_id}/profile", responses=_RESPONSES)
def update_customer_profile(
    customer_id: UUID,
    payload: UpdateCustomerCrmProfileRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: CrmManageGrant,
) -> CustomerCrmResponse:
    return _customer_response(
        CrmService(database).update_customer_profile(
            principal=principal,
            grant=grant,
            customer_id=customer_id,
            expected_version=payload.version,
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        )
    )


@router.get("/customers/{customer_id}/purchases", responses=_RESPONSES)
def customer_purchases(
    customer_id: UUID,
    database: DatabaseSession,
    grant: CrmReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> CustomerPurchasesResponse:
    customer, purchases = CrmService(database).customer_purchases(
        grant, customer_id=customer_id, branch_id=branch_id
    )
    return CustomerPurchasesResponse(
        customer=_customer_response(customer),
        purchases=[
            CustomerPurchaseResponse(
                id=sale.id,
                number=sale.sale_number,
                branch_id=sale.branch_id,
                status=cast(Any, sale.status),
                payment_method=sale.payment_method_code,
                reference=sale.payment_reference,
                total=sale.total,
                completed_at=sale.completed_at,
            )
            for sale in purchases
        ],
    )


@router.get("/quotes", responses=_RESPONSES)
def list_quotes(
    response: Response,
    database: DatabaseSession,
    crm_grant: CrmReadGrant,
    sales_grant: SalesReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    customer_id: Annotated[UUID | None, Query(alias="customerId")] = None,
    crm_status: Annotated[CrmQuoteStatus | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
) -> PaginatedCrmQuotesResponse:
    response.headers["Cache-Control"] = "no-store"
    result = CrmService(database).list_quotes(
        crm_grant=crm_grant,
        sales_grant=sales_grant,
        branch_id=branch_id,
        customer_id=customer_id,
        crm_status=crm_status,
        page=page,
        page_size=page_size,
    )
    return PaginatedCrmQuotesResponse(
        items=[_crm_quote_list_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=ceil(result.total_items / page_size) if result.total_items else 0,
    )


@router.post("/quotes", status_code=status.HTTP_201_CREATED, responses=_RESPONSES)
def create_quote(
    payload: CreateCrmQuoteRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    crm_grant: CrmManageGrant,
    sales_grant: SalesQuoteManageGrant,
    idempotency_key: IdempotencyKey,
) -> CrmQuoteResponse:
    return _crm_quote_response(
        CrmService(database).create_quote(
            principal=principal,
            crm_grant=crm_grant,
            sales_grant=sales_grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.get("/quotes/{quote_id}", responses=_RESPONSES)
def get_quote(
    quote_id: UUID,
    database: DatabaseSession,
    crm_grant: CrmReadGrant,
    sales_grant: SalesReadGrant,
) -> CrmQuoteResponse:
    return _crm_quote_response(
        CrmService(database).get_quote(
            crm_grant=crm_grant,
            sales_grant=sales_grant,
            quote_id=quote_id,
        )
    )


@router.patch("/quotes/{quote_id}", responses=_RESPONSES)
def update_quote(
    quote_id: UUID,
    payload: UpdateCrmQuoteRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    crm_grant: CrmManageGrant,
    sales_grant: SalesQuoteManageGrant,
) -> CrmQuoteResponse:
    return _crm_quote_response(
        CrmService(database).update_quote(
            principal=principal,
            crm_grant=crm_grant,
            sales_grant=sales_grant,
            quote_id=quote_id,
            expected_version=payload.version,
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        )
    )


@router.post("/quotes/{quote_id}/cancel", responses=_RESPONSES)
def cancel_quote(
    quote_id: UUID,
    payload: VoidRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    crm_grant: CrmManageGrant,
    sales_grant: SalesQuoteManageGrant,
) -> CrmQuoteResponse:
    return _crm_quote_response(
        CrmService(database).cancel_quote(
            principal=principal,
            crm_grant=crm_grant,
            sales_grant=sales_grant,
            quote_id=quote_id,
            expected_version=payload.version,
            reason=payload.reason,
        )
    )


@router.get("/sales", responses=_RESPONSES)
def list_sales(
    response: Response,
    database: DatabaseSession,
    crm_grant: CrmReadGrant,
    sales_grant: SalesReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    customer_id: Annotated[UUID | None, Query(alias="customerId")] = None,
    status_filter: Annotated[SaleStatus | None, Query(alias="status")] = None,
    date_from: Annotated[date | None, Query(alias="dateFrom")] = None,
    date_to: Annotated[date | None, Query(alias="dateTo")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
) -> PaginatedSalesResponse:
    response.headers["Cache-Control"] = "no-store"
    result = CrmService(database).list_sales(
        crm_grant=crm_grant,
        sales_grant=sales_grant,
        branch_id=branch_id,
        customer_id=customer_id,
        status=status_filter,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )
    return PaginatedSalesResponse(
        items=[_sale_list_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=ceil(result.total_items / page_size) if result.total_items else 0,
    )


@router.get("/sales/{sale_id}", responses=_RESPONSES)
def get_sale(
    sale_id: UUID,
    database: DatabaseSession,
    crm_grant: CrmReadGrant,
    sales_grant: SalesReadGrant,
) -> SaleDetailResponse:
    return _sale_detail_response(
        CrmService(database).get_sale(
            crm_grant=crm_grant,
            sales_grant=sales_grant,
            sale_id=sale_id,
        )
    )


@router.get("/state", responses=_RESPONSES)
def get_crm_state(
    response: Response,
    database: DatabaseSession,
    crm_grant: CrmReadGrant,
    sales_grant: SalesReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> CrmStateResponse:
    response.headers["Cache-Control"] = "no-store"
    service = CrmService(database)
    leads = service.list_leads(
        crm_grant,
        branch_id=branch_id,
        status=None,
        source=None,
        search=None,
        page=1,
        page_size=200,
    )
    opportunities = service.list_opportunities(
        crm_grant,
        branch_id=branch_id,
        stage=None,
        customer_id=None,
        search=None,
        page=1,
        page_size=200,
    )
    activities = service.list_activities(
        crm_grant,
        branch_id=branch_id,
        activity_type=None,
        completed=None,
        overdue=None,
        opportunity_id=None,
        customer_id=None,
        page=1,
        page_size=200,
    )
    quotes = service.list_quotes(
        crm_grant=crm_grant,
        sales_grant=sales_grant,
        branch_id=branch_id,
        customer_id=None,
        crm_status=None,
        page=1,
        page_size=200,
    )
    return CrmStateResponse(
        settings=_settings_response(service.scoring_settings(crm_grant)),
        leads=[_lead_response(item) for item in leads.items],
        opportunities=[_opportunity_response(item) for item in opportunities.items],
        activities=[_activity_response(item) for item in activities.items],
        quotes=[_crm_quote_list_response(item) for item in quotes.items],
    )


# Overview is intentionally declared last: it is a read model derived from every CRM source above.
@router.get("/overview", responses=_RESPONSES)
def get_overview(
    response: Response,
    database: DatabaseSession,
    grant: CrmReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> CrmOverviewResponse:
    response.headers["Cache-Control"] = "no-store"
    record = CrmService(database).overview(grant, branch_id=branch_id)
    values = record.values
    return CrmOverviewResponse(
        branch_id=record.branch_id,
        total_leads=values.total_leads,
        qualified_leads=values.qualified_leads,
        converted_this_month=values.converted_this_month,
        open_opportunities=values.open_opportunities,
        pipeline_value=values.pipeline_value,
        overdue_activities=values.overdue_activities,
        pending_activities=values.pending_activities,
        crm_quotes=values.crm_quotes,
        accepted_quotes=values.accepted_quotes,
        customers_with_purchases=values.customers_with_purchases,
        sales_this_month=values.sales_this_month,
        sales_value_this_month=values.sales_value_this_month,
        generated_at=record.generated_at,
    )
