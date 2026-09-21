from datetime import date
from decimal import Decimal
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Header, Query, Response, status

from app.api.deps import (
    CurrentPrincipal,
    DatabaseSession,
    FinanceManageGrant,
    FinanceReadGrant,
)
from app.db.models import (
    FinanceAccount,
    FinanceExpense,
    FinanceLiability,
    FinanceManualIncome,
)
from app.repositories.document_attachments import DocumentAttachmentRecord
from app.repositories.finance import (
    BudgetRecord,
    ExpenseViewRecord,
    FixedExpenseRecord,
    IncomeViewRecord,
)
from app.schemas.common import ErrorResponse
from app.schemas.document_attachments import DocumentAttachmentResponse
from app.schemas.finance import (
    AccountSortField,
    AccountType,
    BudgetGroup,
    BudgetSortField,
    CreateFinanceAccountRequest,
    CreateFinanceBudgetRequest,
    CreateFinanceExpenseRequest,
    CreateFinanceFixedExpenseRequest,
    CreateFinanceLiabilityRequest,
    CreateFinanceManualIncomeRequest,
    ExpenseCategory,
    ExpenseSortField,
    FinanceAccountResponse,
    FinanceAccountStatsResponse,
    FinanceBudgetResponse,
    FinanceBudgetStatsResponse,
    FinanceBudgetTransactionResponse,
    FinanceExpenseResponse,
    FinanceFixedExpensePaymentResponse,
    FinanceFixedExpenseResponse,
    FinanceIncomeResponse,
    FinanceLiabilityResponse,
    FinanceLiabilityStatsResponse,
    FinanceOverviewResponse,
    FinanceTrendPointResponse,
    FixedExpenseSortField,
    IncomeSortField,
    LiabilitySortField,
    LiabilityType,
    PaginatedFinanceAccountsResponse,
    PaginatedFinanceBudgetsResponse,
    PaginatedFinanceExpensesResponse,
    PaginatedFinanceFixedExpensesResponse,
    PaginatedFinanceIncomesResponse,
    PaginatedFinanceLiabilitiesResponse,
    PayFinanceFixedExpenseRequest,
    PaymentStatus,
    SortDirection,
    UpdateFinanceAccountRequest,
    UpdateFinanceBudgetRequest,
    UpdateFinanceExpenseRequest,
    UpdateFinanceFixedExpenseRequest,
    UpdateFinanceIncomeRequest,
    UpdateFinanceLiabilityRequest,
    UpdateFinanceManualIncomeRequest,
)
from app.services.document_attachments import DocumentAttachmentService
from app.services.finance import FinanceService, page_count

router = APIRouter(prefix="/api/v1/finance", tags=["finance"])

_SECURITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
}
_MUTATION_RESPONSES: dict[int | str, dict[str, Any]] = {
    **_SECURITY_RESPONSES,
    400: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
}


def _attachment_responses(
    records: tuple[DocumentAttachmentRecord, ...],
) -> list[DocumentAttachmentResponse]:
    return [
        DocumentAttachmentResponse(
            id=row.attachment.id,
            original_filename=row.attachment.original_filename,
            content_type=row.attachment.content_type,
            size_bytes=row.attachment.size_bytes,
            checksum_sha256=row.attachment.checksum_sha256,
            preview_url=row.preview_url,
            created_at=row.attachment.created_at,
        )
        for row in records
    ]


ExpenseAttachmentMap = dict[UUID, tuple[DocumentAttachmentRecord, ...]]


def _expense_attachment_maps(
    database: DatabaseSession,
    grant: FinanceReadGrant,
    records: tuple[ExpenseViewRecord, ...],
) -> tuple[ExpenseAttachmentMap, ExpenseAttachmentMap]:
    finanzas_ids = {item.id for item in records if item.source == "finanzas"}
    caja_ids = {item.id for item in records if item.source == "caja"}
    service = DocumentAttachmentService(database)
    return (
        service.attachments_by_owners(grant.workspace_id, "finance_expense", finanzas_ids),
        service.attachments_by_owners(grant.workspace_id, "cash_movement", caja_ids),
    )


def _expense_view_response(
    record: ExpenseViewRecord,
    *,
    finanzas_attachments: dict[UUID, tuple[DocumentAttachmentRecord, ...]] | None = None,
    caja_attachments: dict[UUID, tuple[DocumentAttachmentRecord, ...]] | None = None,
    attachment_rows: tuple[DocumentAttachmentRecord, ...] | None = None,
) -> FinanceExpenseResponse:
    if attachment_rows is not None:
        attachments = _attachment_responses(attachment_rows)
    elif record.source == "caja":
        attachments = _attachment_responses((caja_attachments or {}).get(record.id, ()))
    else:
        attachments = _attachment_responses((finanzas_attachments or {}).get(record.id, ()))
    return FinanceExpenseResponse(
        id=record.id,
        concept=record.concept,
        amount=record.amount,
        category=cast(ExpenseCategory, record.category),
        date=record.date,
        branch_id=record.branch_id,
        status=cast(PaymentStatus, record.status),
        budget_id=record.budget_id,
        source=cast(Any, record.source),
        editable=record.editable,
        version=record.version,
        attachments=attachments,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _expense_response(
    expense: FinanceExpense,
    *,
    attachment_rows: tuple[DocumentAttachmentRecord, ...] = (),
) -> FinanceExpenseResponse:
    return FinanceExpenseResponse(
        id=expense.id,
        concept=expense.concept,
        amount=expense.amount,
        category=cast(ExpenseCategory, expense.category),
        date=expense.expense_date,
        branch_id=expense.branch_id,
        status=cast(PaymentStatus, expense.payment_status),
        budget_id=expense.budget_id,
        source="finanzas",
        editable=True,
        version=expense.version,
        attachments=_attachment_responses(attachment_rows),
        created_at=expense.created_at,
        updated_at=expense.updated_at,
    )


def _fixed_expense_response(
    record: FixedExpenseRecord,
    *,
    attachment_rows: tuple[DocumentAttachmentRecord, ...] = (),
) -> FinanceFixedExpenseResponse:
    expense = record.expense
    payments = [
        FinanceFixedExpensePaymentResponse(
            id=payment.id,
            period=payment.period,
            amount=payment.amount,
            paid_on=payment.paid_on,
            created_at=payment.created_at,
        )
        for payment in record.payments
    ]
    return FinanceFixedExpenseResponse(
        id=expense.id,
        concept=expense.concept,
        amount=expense.amount,
        category=cast(ExpenseCategory, expense.category),
        branch_id=expense.branch_id,
        day_of_month=expense.day_of_month,
        paid_periods=[payment.period.strftime("%Y-%m") for payment in record.payments],
        payments=payments,
        attachments=_attachment_responses(attachment_rows),
        version=expense.version,
        created_at=expense.created_at,
        updated_at=expense.updated_at,
    )


def _liability_response(liability: FinanceLiability) -> FinanceLiabilityResponse:
    return FinanceLiabilityResponse(
        id=liability.id,
        name=liability.name,
        type=cast(LiabilityType, liability.liability_type),
        initial_amount=liability.initial_amount,
        pending_amount=liability.pending_amount,
        branch_id=liability.branch_id,
        pay_day=liability.pay_day,
        cut_day=liability.cut_day,
        installment=liability.installment,
        paid_installments=liability.paid_installments,
        total_installments=liability.total_installments,
        category_ids=cast(list[ExpenseCategory], liability.category_ids),
        version=liability.version,
        created_at=liability.created_at,
        updated_at=liability.updated_at,
    )


def _budget_response(record: BudgetRecord) -> FinanceBudgetResponse:
    budget = record.budget
    remaining = budget.monthly_limit - record.spent
    usage = (
        (record.spent / budget.monthly_limit * Decimal("100")).quantize(Decimal("0.01"))
        if budget.monthly_limit
        else Decimal("0")
    )
    return FinanceBudgetResponse(
        id=budget.id,
        name=budget.name,
        group=cast(BudgetGroup, budget.budget_group),
        monthly_limit=budget.monthly_limit,
        branch_id=budget.branch_id,
        spent=record.spent,
        remaining=remaining,
        usage_percent=usage,
        over_budget=record.spent > budget.monthly_limit,
        transactions=[
            FinanceBudgetTransactionResponse(
                id=expense.id,
                concept=expense.concept,
                amount=expense.amount,
                date=expense.expense_date,
            )
            for expense in record.transactions
        ],
        version=budget.version,
        created_at=budget.created_at,
        updated_at=budget.updated_at,
    )


def _account_response(account: FinanceAccount) -> FinanceAccountResponse:
    return FinanceAccountResponse(
        id=account.id,
        name=account.name,
        type=cast(AccountType, account.account_type),
        bank=account.bank,
        account_number=account.account_number_masked,
        balance=account.balance,
        currency=account.currency_code,
        branch_id=account.branch_id,
        notes=account.notes,
        version=account.version,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


def _income_view_response(
    record: IncomeViewRecord,
    *,
    manual_attachments: dict[UUID, tuple[DocumentAttachmentRecord, ...]] | None = None,
    attachment_rows: tuple[DocumentAttachmentRecord, ...] | None = None,
) -> FinanceIncomeResponse:
    if attachment_rows is not None:
        attachments = _attachment_responses(attachment_rows)
    elif record.origin == "manual":
        attachments = _attachment_responses((manual_attachments or {}).get(record.id, ()))
    else:
        attachments = []
    return FinanceIncomeResponse(
        id=record.id,
        date=record.date,
        customer=record.customer,
        category=record.category,
        branch_id=record.branch_id,
        status=cast(PaymentStatus, record.status),
        amount=record.amount,
        source=record.source,
        reference=record.reference,
        origin=cast(Any, record.origin),
        adjusted=record.adjusted,
        editable=record.editable,
        version=record.version,
        attachments=attachments,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _manual_income_response(income: FinanceManualIncome) -> FinanceIncomeResponse:
    return FinanceIncomeResponse(
        id=income.id,
        date=income.income_date,
        customer=income.customer,
        category=income.category,
        branch_id=income.branch_id,
        status=cast(PaymentStatus, income.payment_status),
        amount=income.amount,
        source=income.source,
        reference=None,
        origin="manual",
        adjusted=False,
        editable=True,
        version=income.version,
        created_at=income.created_at,
        updated_at=income.updated_at,
    )


@router.get("/overview", responses=_SECURITY_RESPONSES)
def finance_overview(
    response: Response,
    database: DatabaseSession,
    grant: FinanceReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    period: Annotated[str | None, Query(pattern=r"^[0-9]{4}-[0-9]{2}$")] = None,
    trend_months: Annotated[int, Query(alias="trendMonths", ge=1, le=24)] = 6,
) -> FinanceOverviewResponse:
    response.headers["Cache-Control"] = "no-store"
    result = FinanceService(database).overview(
        grant=grant,
        branch_id=branch_id,
        period=period,
        trend_months=trend_months,
    )
    return FinanceOverviewResponse(
        **{key: value for key, value in result.items() if key != "trend"},
        trend=[FinanceTrendPointResponse(**point) for point in result["trend"]],
    )


@router.get("/expenses", responses=_SECURITY_RESPONSES)
def list_expenses(
    response: Response,
    database: DatabaseSession,
    grant: FinanceReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    status_filter: Annotated[PaymentStatus | None, Query(alias="status")] = None,
    date_from: Annotated[date | None, Query(alias="dateFrom")] = None,
    date_to: Annotated[date | None, Query(alias="dateTo")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
    sort_by: Annotated[ExpenseSortField, Query(alias="sortBy")] = "date",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "desc",
) -> PaginatedFinanceExpensesResponse:
    response.headers["Cache-Control"] = "no-store"
    result = FinanceService(database).list_expenses(
        grant=grant,
        branch_id=branch_id,
        search=search,
        status=status_filter,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    finanzas_map, caja_map = _expense_attachment_maps(database, grant, result.items)
    return PaginatedFinanceExpensesResponse(
        items=[
            _expense_view_response(
                item,
                finanzas_attachments=finanzas_map,
                caja_attachments=caja_map,
            )
            for item in result.items
        ],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=page_count(result.total_items, page_size),
    )


@router.post(
    "/expenses",
    status_code=status.HTTP_201_CREATED,
    responses=_MUTATION_RESPONSES,
)
def create_expense(
    payload: CreateFinanceExpenseRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> FinanceExpenseResponse:
    return _expense_response(
        FinanceService(database).create_expense(
            principal=principal,
            grant=grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.get("/expenses/{expense_id}", responses=_MUTATION_RESPONSES)
def get_expense(
    expense_id: UUID,
    database: DatabaseSession,
    grant: FinanceReadGrant,
) -> FinanceExpenseResponse:
    expense = FinanceService(database).get_expense(grant, expense_id)
    rows = DocumentAttachmentService(database).list_for_owner(grant, "finance_expense", expense_id)
    return _expense_response(expense, attachment_rows=rows)


@router.patch("/expenses/{expense_id}", responses=_MUTATION_RESPONSES)
def update_expense(
    expense_id: UUID,
    payload: UpdateFinanceExpenseRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
) -> FinanceExpenseResponse:
    return _expense_response(
        FinanceService(database).update_expense(
            principal=principal,
            grant=grant,
            expense_id=expense_id,
            expected_version=payload.version,
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        )
    )


@router.delete(
    "/expenses/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_MUTATION_RESPONSES,
)
def void_expense(
    expense_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    version: Annotated[int, Query(ge=1)],
) -> Response:
    FinanceService(database).void_expense(
        principal=principal,
        grant=grant,
        expense_id=expense_id,
        expected_version=version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/fixed-expenses", responses=_SECURITY_RESPONSES)
def list_fixed_expenses(
    response: Response,
    database: DatabaseSession,
    grant: FinanceReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
    sort_by: Annotated[FixedExpenseSortField, Query(alias="sortBy")] = "dayOfMonth",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "asc",
) -> PaginatedFinanceFixedExpensesResponse:
    response.headers["Cache-Control"] = "no-store"
    result = FinanceService(database).list_fixed_expenses(
        grant=grant,
        branch_id=branch_id,
        search=search,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    fixed_ids = {item.expense.id for item in result.items}
    fixed_map = DocumentAttachmentService(database).attachments_by_owners(
        grant.workspace_id, "finance_fixed_expense", fixed_ids
    )
    return PaginatedFinanceFixedExpensesResponse(
        items=[
            _fixed_expense_response(item, attachment_rows=fixed_map.get(item.expense.id, ()))
            for item in result.items
        ],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=page_count(result.total_items, page_size),
    )


@router.post(
    "/fixed-expenses",
    status_code=status.HTTP_201_CREATED,
    responses=_MUTATION_RESPONSES,
)
def create_fixed_expense(
    payload: CreateFinanceFixedExpenseRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> FinanceFixedExpenseResponse:
    service = FinanceService(database)
    expense = service.create_fixed_expense(
        principal=principal,
        grant=grant,
        values=payload.model_dump(by_alias=False),
        idempotency_key=idempotency_key,
    )
    return _fixed_expense_response(service.get_fixed_expense(grant, expense.id))


@router.patch("/fixed-expenses/{expense_id}", responses=_MUTATION_RESPONSES)
def update_fixed_expense(
    expense_id: UUID,
    payload: UpdateFinanceFixedExpenseRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
) -> FinanceFixedExpenseResponse:
    service = FinanceService(database)
    expense = service.update_fixed_expense(
        principal=principal,
        grant=grant,
        expense_id=expense_id,
        expected_version=payload.version,
        changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
    )
    return _fixed_expense_response(service.get_fixed_expense(grant, expense.id))


@router.post("/fixed-expenses/{expense_id}/payments", responses=_MUTATION_RESPONSES)
def pay_fixed_expense(
    expense_id: UUID,
    payload: PayFinanceFixedExpenseRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> FinanceFixedExpenseResponse:
    return _fixed_expense_response(
        FinanceService(database).pay_fixed_expense(
            principal=principal,
            grant=grant,
            expense_id=expense_id,
            period=payload.period,
            paid_on=payload.paid_on,
            idempotency_key=idempotency_key,
        )
    )


@router.delete(
    "/fixed-expenses/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_MUTATION_RESPONSES,
)
def archive_fixed_expense(
    expense_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    version: Annotated[int, Query(ge=1)],
) -> Response:
    FinanceService(database).archive_fixed_expense(
        principal=principal,
        grant=grant,
        expense_id=expense_id,
        expected_version=version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/liabilities/stats", responses=_SECURITY_RESPONSES)
def liability_stats(
    response: Response,
    database: DatabaseSession,
    grant: FinanceReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> FinanceLiabilityStatsResponse:
    response.headers["Cache-Control"] = "no-store"
    result = FinanceService(database).liability_stats(grant, branch_id)
    return FinanceLiabilityStatsResponse(
        total_debt=result.total_debt, cards=result.cards, loans=result.loans
    )


@router.get("/liabilities", responses=_SECURITY_RESPONSES)
def list_liabilities(
    response: Response,
    database: DatabaseSession,
    grant: FinanceReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    liability_type: Annotated[LiabilityType | None, Query(alias="type")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
    sort_by: Annotated[LiabilitySortField, Query(alias="sortBy")] = "name",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "asc",
) -> PaginatedFinanceLiabilitiesResponse:
    response.headers["Cache-Control"] = "no-store"
    result = FinanceService(database).list_liabilities(
        grant=grant,
        branch_id=branch_id,
        search=search,
        liability_type=liability_type,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return PaginatedFinanceLiabilitiesResponse(
        items=[_liability_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=page_count(result.total_items, page_size),
    )


@router.post(
    "/liabilities",
    status_code=status.HTTP_201_CREATED,
    responses=_MUTATION_RESPONSES,
)
def create_liability(
    payload: CreateFinanceLiabilityRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> FinanceLiabilityResponse:
    return _liability_response(
        FinanceService(database).create_liability(
            principal=principal,
            grant=grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.patch("/liabilities/{liability_id}", responses=_MUTATION_RESPONSES)
def update_liability(
    liability_id: UUID,
    payload: UpdateFinanceLiabilityRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
) -> FinanceLiabilityResponse:
    return _liability_response(
        FinanceService(database).update_liability(
            principal=principal,
            grant=grant,
            liability_id=liability_id,
            expected_version=payload.version,
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        )
    )


@router.delete(
    "/liabilities/{liability_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_MUTATION_RESPONSES,
)
def archive_liability(
    liability_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    version: Annotated[int, Query(ge=1)],
) -> Response:
    FinanceService(database).archive_liability(
        principal=principal,
        grant=grant,
        liability_id=liability_id,
        expected_version=version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/budgets/stats", responses=_SECURITY_RESPONSES)
def budget_stats(
    response: Response,
    database: DatabaseSession,
    grant: FinanceReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    period: Annotated[str | None, Query(pattern=r"^[0-9]{4}-[0-9]{2}$")] = None,
) -> FinanceBudgetStatsResponse:
    response.headers["Cache-Control"] = "no-store"
    result = FinanceService(database).budget_stats(grant, branch_id, period)
    return FinanceBudgetStatsResponse(
        total_budget=result.total_budget,
        spent=result.spent,
        remaining=result.remaining,
        over_budget=result.over_budget,
    )


@router.get("/budgets", responses=_SECURITY_RESPONSES)
def list_budgets(
    response: Response,
    database: DatabaseSession,
    grant: FinanceReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    budget_group: Annotated[BudgetGroup | None, Query(alias="group")] = None,
    period: Annotated[str | None, Query(pattern=r"^[0-9]{4}-[0-9]{2}$")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
    sort_by: Annotated[BudgetSortField, Query(alias="sortBy")] = "name",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "asc",
) -> PaginatedFinanceBudgetsResponse:
    response.headers["Cache-Control"] = "no-store"
    result = FinanceService(database).list_budgets(
        grant=grant,
        branch_id=branch_id,
        search=search,
        budget_group=budget_group,
        period=period,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return PaginatedFinanceBudgetsResponse(
        items=[_budget_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=page_count(result.total_items, page_size),
    )


@router.post(
    "/budgets",
    status_code=status.HTTP_201_CREATED,
    responses=_MUTATION_RESPONSES,
)
def create_budget(
    payload: CreateFinanceBudgetRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> FinanceBudgetResponse:
    service = FinanceService(database)
    budget = service.create_budget(
        principal=principal,
        grant=grant,
        values=payload.model_dump(by_alias=False),
        idempotency_key=idempotency_key,
    )
    return _budget_response(service.get_budget(grant, budget.id))


@router.patch("/budgets/{budget_id}", responses=_MUTATION_RESPONSES)
def update_budget(
    budget_id: UUID,
    payload: UpdateFinanceBudgetRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
) -> FinanceBudgetResponse:
    service = FinanceService(database)
    budget = service.update_budget(
        principal=principal,
        grant=grant,
        budget_id=budget_id,
        expected_version=payload.version,
        changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
    )
    return _budget_response(service.get_budget(grant, budget.id))


@router.delete(
    "/budgets/{budget_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_MUTATION_RESPONSES,
)
def archive_budget(
    budget_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    version: Annotated[int, Query(ge=1)],
) -> Response:
    FinanceService(database).archive_budget(
        principal=principal,
        grant=grant,
        budget_id=budget_id,
        expected_version=version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/accounts/stats", responses=_SECURITY_RESPONSES)
def account_stats(
    response: Response,
    database: DatabaseSession,
    grant: FinanceReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> FinanceAccountStatsResponse:
    response.headers["Cache-Control"] = "no-store"
    result = FinanceService(database).account_stats(grant, branch_id)
    return FinanceAccountStatsResponse(
        total=result.total,
        bank=result.bank,
        investment=result.investment,
        shareholders=result.shareholders,
    )


@router.get("/accounts", responses=_SECURITY_RESPONSES)
def list_accounts(
    response: Response,
    database: DatabaseSession,
    grant: FinanceReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    account_type: Annotated[AccountType | None, Query(alias="type")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
    sort_by: Annotated[AccountSortField, Query(alias="sortBy")] = "name",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "asc",
) -> PaginatedFinanceAccountsResponse:
    response.headers["Cache-Control"] = "no-store"
    result = FinanceService(database).list_accounts(
        grant=grant,
        branch_id=branch_id,
        search=search,
        account_type=account_type,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    return PaginatedFinanceAccountsResponse(
        items=[_account_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=page_count(result.total_items, page_size),
    )


@router.post(
    "/accounts",
    status_code=status.HTTP_201_CREATED,
    responses=_MUTATION_RESPONSES,
)
def create_account(
    payload: CreateFinanceAccountRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> FinanceAccountResponse:
    return _account_response(
        FinanceService(database).create_account(
            principal=principal,
            grant=grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.patch("/accounts/{account_id}", responses=_MUTATION_RESPONSES)
def update_account(
    account_id: UUID,
    payload: UpdateFinanceAccountRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
) -> FinanceAccountResponse:
    return _account_response(
        FinanceService(database).update_account(
            principal=principal,
            grant=grant,
            account_id=account_id,
            expected_version=payload.version,
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        )
    )


@router.delete(
    "/accounts/{account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_MUTATION_RESPONSES,
)
def archive_account(
    account_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    version: Annotated[int, Query(ge=1)],
) -> Response:
    FinanceService(database).archive_account(
        principal=principal,
        grant=grant,
        account_id=account_id,
        expected_version=version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/incomes", responses=_SECURITY_RESPONSES)
def list_incomes(
    response: Response,
    database: DatabaseSession,
    grant: FinanceReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    status_filter: Annotated[PaymentStatus | None, Query(alias="status")] = None,
    date_from: Annotated[date | None, Query(alias="dateFrom")] = None,
    date_to: Annotated[date | None, Query(alias="dateTo")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
    sort_by: Annotated[IncomeSortField, Query(alias="sortBy")] = "date",
    sort_direction: Annotated[SortDirection, Query(alias="sortDirection")] = "desc",
) -> PaginatedFinanceIncomesResponse:
    response.headers["Cache-Control"] = "no-store"
    result = FinanceService(database).list_incomes(
        grant=grant,
        branch_id=branch_id,
        search=search,
        status=status_filter,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    manual_ids = {item.id for item in result.items if item.origin == "manual"}
    manual_map = DocumentAttachmentService(database).attachments_by_owners(
        grant.workspace_id, "finance_manual_income", manual_ids
    )
    return PaginatedFinanceIncomesResponse(
        items=[_income_view_response(item, manual_attachments=manual_map) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=page_count(result.total_items, page_size),
    )


@router.patch("/incomes/{income_id}", responses=_MUTATION_RESPONSES)
def update_income(
    income_id: UUID,
    payload: UpdateFinanceIncomeRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
) -> FinanceIncomeResponse:
    return _income_view_response(
        FinanceService(database).update_income(
            principal=principal,
            grant=grant,
            income_id=income_id,
            expected_version=payload.version,
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        )
    )


@router.delete(
    "/incomes/{income_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_MUTATION_RESPONSES,
)
def void_income(
    income_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    version: Annotated[int, Query(ge=1)],
) -> Response:
    FinanceService(database).void_income(
        principal=principal,
        grant=grant,
        income_id=income_id,
        expected_version=version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/manual-incomes",
    status_code=status.HTTP_201_CREATED,
    responses=_MUTATION_RESPONSES,
)
def create_manual_income(
    payload: CreateFinanceManualIncomeRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> FinanceIncomeResponse:
    return _manual_income_response(
        FinanceService(database).create_manual_income(
            principal=principal,
            grant=grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.get("/manual-incomes/{income_id}", responses=_MUTATION_RESPONSES)
def get_manual_income(
    income_id: UUID,
    database: DatabaseSession,
    grant: FinanceReadGrant,
) -> FinanceIncomeResponse:
    return _manual_income_response(FinanceService(database).get_manual_income(grant, income_id))


@router.patch("/manual-incomes/{income_id}", responses=_MUTATION_RESPONSES)
def update_manual_income(
    income_id: UUID,
    payload: UpdateFinanceManualIncomeRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
) -> FinanceIncomeResponse:
    return _manual_income_response(
        FinanceService(database).update_manual_income(
            principal=principal,
            grant=grant,
            income_id=income_id,
            expected_version=payload.version,
            changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
        )
    )


@router.delete(
    "/manual-incomes/{income_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_MUTATION_RESPONSES,
)
def void_manual_income(
    income_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: FinanceManageGrant,
    version: Annotated[int, Query(ge=1)],
) -> Response:
    FinanceService(database).void_manual_income(
        principal=principal,
        grant=grant,
        income_id=income_id,
        expected_version=version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
