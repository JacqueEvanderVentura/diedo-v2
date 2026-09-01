from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, cast
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, File, Form, Header, Query, Response, UploadFile, status
from starlette.responses import FileResponse

from app.api.deps import (
    AttachmentStorageDep,
    CurrentPrincipal,
    DatabaseSession,
    PosCashManageGrant,
    PosCashReadGrant,
    PosReadGrant,
    PosReceivablesCollectGrant,
    PosReceivablesManageGrant,
    PosReceivablesReadGrant,
    PosRegisterManageGrant,
    PosSellGrant,
    PosVoidGrant,
    SalesQuoteManageGrant,
    SalesReadGrant,
)
from app.config import settings
from app.db.models.administration import PaymentMethod
from app.db.models.sales import PaymentProof
from app.repositories.pos import (
    CashMovementRecord,
    CashRegisterRecord,
    CustomerPaymentRecord,
    PosCatalogRecord,
    QuoteRecord,
    ReceivableRecord,
    SaleRecord,
)
from app.schemas.common import ErrorResponse
from app.schemas.pos import (
    CashMovementLineResponse,
    CashMovementResponse,
    CashMovementType,
    CheckoutRequest,
    CheckoutResponse,
    CloseRegisterRequest,
    CreateManualCashMovementRequest,
    CreateQuoteRequest,
    CreateReceivablePaymentRequest,
    CustomerPaymentStatus,
    OpenRegisterRequest,
    PaginatedCashMovementsResponse,
    PaginatedQuotesResponse,
    PaginatedReceivablesResponse,
    PaginatedRegistersResponse,
    PaginatedSalesResponse,
    PaymentProofResponse,
    PosBranchReferenceResponse,
    PosCatalogItemResponse,
    PosCustomerReferenceResponse,
    PosItemReferenceResponse,
    PosPaymentMethodReferenceResponse,
    PosStateResponse,
    QuoteDetailResponse,
    QuoteKind,
    QuoteLineResponse,
    QuoteListItemResponse,
    QuotesSummaryResponse,
    QuoteStateResponse,
    QuoteStatus,
    ReceivableDetailResponse,
    ReceivableLineResponse,
    ReceivableListItemResponse,
    ReceivablePaymentResponse,
    ReceivablesSummaryResponse,
    ReceivableStateResponse,
    ReceivableStatus,
    RegisterDetailResponse,
    RegisterListItemResponse,
    RegisterOverviewResponse,
    RegisterPaymentMethodSummaryResponse,
    RegisterStateResponse,
    RegisterSummaryResponse,
    ReverseRequest,
    SaleDetailResponse,
    SaleLineResponse,
    SaleListItemResponse,
    SalePaymentResponse,
    SalesSummaryResponse,
    SaleStateResponse,
    SaleStatus,
    UpdateQuoteRequest,
    UpdateReceivableRequest,
    VoidRequest,
)
from app.services.pos import PosService
from app.services.pos_money import money

router = APIRouter(prefix="/api/v1/pos", tags=["pos"])

_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse},
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
}

IdempotencyKey = Annotated[
    str,
    Header(alias="Idempotency-Key", min_length=8, max_length=128),
]


def _page_count(total_items: int, page_size: int) -> int:
    return (total_items + page_size - 1) // page_size if total_items else 0


def _branch_response(branch: Any) -> PosBranchReferenceResponse:
    return PosBranchReferenceResponse(id=branch.id, name=branch.name)


def _customer_response(
    customer: Any | None,
    *,
    snapshot_id: UUID | None,
    snapshot_name: str | None,
) -> PosCustomerReferenceResponse | None:
    if snapshot_id is None and snapshot_name is None:
        return None
    return PosCustomerReferenceResponse(
        id=snapshot_id,
        name=snapshot_name or "Cliente mostrador",
    )


def _item_snapshot_response(
    item_id: UUID | None,
    name: str,
    sku: str | None,
) -> PosItemReferenceResponse:
    return PosItemReferenceResponse(id=item_id, name=name, sku=sku)


def _payment_method_response(method: PaymentMethod) -> PosPaymentMethodReferenceResponse:
    return PosPaymentMethodReferenceResponse(
        id=method.id,
        code=method.code,
        name=method.name,
        icon=method.icon,
        channel=cast(Any, method.channel),
        settlement_policy=cast(Any, method.settlement_policy),
        affects_cash_drawer=method.affects_cash_drawer,
        requires_evidence=method.requires_evidence,
    )


def _payment_snapshot_response(
    *,
    method: PaymentMethod | None,
    method_id: UUID,
    code: str | None,
    name: str | None,
    channel: str | None,
    settlement_policy: str | None,
    affects_cash_drawer: bool | None,
    requires_evidence: bool | None,
) -> PosPaymentMethodReferenceResponse:
    return PosPaymentMethodReferenceResponse(
        id=method_id,
        code=code or (method.code if method is not None else "unknown"),
        name=name or (method.name if method is not None else "Método de pago"),
        icon=method.icon if method is not None else "Wallet",
        channel=cast(Any, channel or (method.channel if method is not None else "other")),
        settlement_policy=cast(
            Any,
            settlement_policy or (method.settlement_policy if method is not None else "immediate"),
        ),
        affects_cash_drawer=(
            affects_cash_drawer
            if affects_cash_drawer is not None
            else (method.affects_cash_drawer if method is not None else False)
        ),
        requires_evidence=(
            requires_evidence
            if requires_evidence is not None
            else (method.requires_evidence if method is not None else False)
        ),
    )


def _catalog_response(record: PosCatalogRecord) -> PosCatalogItemResponse:
    if record.stock_quantity is None:
        stock_status = "not_tracked"
    elif record.stock_quantity <= 0:
        stock_status = "out"
    elif record.minimum_quantity is not None and record.stock_quantity <= record.minimum_quantity:
        stock_status = "low"
    else:
        stock_status = "available"
    if record.profile.sale_price is None:
        raise RuntimeError("A POS catalog item must have a sale price.")
    return PosCatalogItemResponse(
        id=record.item.id,
        name=record.item.name,
        sku=record.item.sku,
        item_type=cast(Any, record.item.item_type),
        unit_symbol=record.unit.symbol,
        sale_price=record.profile.sale_price,
        tax_rate=record.profile.tax_rate,
        stock_quantity=record.stock_quantity,
        stock_status=cast(Any, stock_status),
    )


def _expected_cash(record: CashRegisterRecord) -> Decimal:
    register = record.register
    if register.expected_cash is not None:
        return register.expected_cash
    return (
        register.opening_cash
        + register.cash_sales_amount
        + register.receivable_payments_amount
        + register.cash_income_amount
        - register.cash_expense_amount
    )


def _register_summary_response(record: CashRegisterRecord) -> RegisterSummaryResponse:
    register = record.register
    return RegisterSummaryResponse(
        opening_cash=money(register.opening_cash),
        cash_sales=money(register.cash_sales_amount),
        cash_receivable_payments=money(register.receivable_payments_amount),
        manual_income=money(register.cash_income_amount),
        cash_expenses=money(register.cash_expense_amount),
        expected_cash=money(_expected_cash(record)),
        total_sales=money(record.sales_total),
        sales_count=record.sales_count,
        voided_sales_count=record.voided_sales_count,
        sales_by_payment_method=[
            RegisterPaymentMethodSummaryResponse(
                payment_method=_payment_snapshot_response(
                    method=item.payment_method,
                    method_id=item.payment_method_id,
                    code=item.payment_method_code,
                    name=item.payment_method_name,
                    channel=item.payment_channel,
                    settlement_policy=item.settlement_policy,
                    affects_cash_drawer=item.affects_cash_drawer,
                    requires_evidence=item.requires_evidence,
                ),
                sales_total=money(item.sales_total),
                sales_count=item.sales_count,
            )
            for item in record.sales_by_payment_method
        ],
    )


def _movement_payment_response(
    record: CashMovementRecord,
) -> PosPaymentMethodReferenceResponse | None:
    movement = record.movement
    if movement.payment_method_id is None:
        return None
    return _payment_snapshot_response(
        method=record.payment_method,
        method_id=movement.payment_method_id,
        code=movement.payment_method_code,
        name=movement.payment_method_name,
        channel=movement.payment_channel,
        settlement_policy=movement.settlement_policy,
        affects_cash_drawer=movement.affects_cash_drawer,
        requires_evidence=movement.requires_evidence,
    )


def _cash_movement_response(record: CashMovementRecord) -> CashMovementResponse:
    movement = record.movement
    return CashMovementResponse(
        id=movement.id,
        register_id=movement.cash_register_id,
        type=cast(Any, movement.movement_type),
        concept=movement.concept,
        currency=movement.currency_code,
        amount=movement.amount,
        cash_delta=movement.cash_delta,
        payment_method=_movement_payment_response(record),
        reference=movement.reference,
        notes=movement.notes,
        lines=[
            CashMovementLineResponse(
                id=line.id,
                item=_item_snapshot_response(line.item_id, line.item_name, line.item_sku),
                description=line.item_name,
                quantity=line.quantity,
                unit_cost=line.unit_amount,
                line_total=line.line_total,
            )
            for line in record.lines
        ],
        sale_id=movement.sale_id,
        customer_payment_id=movement.customer_payment_id,
        reversal_of_id=movement.reversal_of_movement_id,
        inventory_movement_id=movement.inventory_movement_id,
        created_by_platform_user_id=movement.created_by_platform_user_id,
        created_at=movement.created_at,
    )


def _register_state_response(record: CashRegisterRecord) -> RegisterStateResponse:
    register = record.register
    return RegisterStateResponse(
        id=register.id,
        branch=_branch_response(record.branch),
        status=cast(Any, register.status),
        currency=register.currency_code,
        opening_cash=register.opening_cash,
        expected_cash=_expected_cash(record),
        counted_cash=register.actual_cash,
        difference=register.difference,
        notes=register.notes,
        opened_by_platform_user_id=register.opened_by_platform_user_id,
        opened_by_name=register.opened_by_name,
        opened_at=register.opened_at,
        closed_by_platform_user_id=register.closed_by_platform_user_id,
        closed_by_name=register.closed_by_name,
        closed_at=register.closed_at,
        version=register.version,
    )


def _register_detail_response(record: CashRegisterRecord) -> RegisterDetailResponse:
    values = _register_state_response(record).model_dump(by_alias=False)
    values.update(
        summary=_register_summary_response(record),
        movements=[_cash_movement_response(item) for item in record.movements],
        movements_total=record.movements_count,
    )
    return RegisterDetailResponse.model_validate(values)


def _register_overview_response(record: CashRegisterRecord) -> RegisterOverviewResponse:
    values = _register_state_response(record).model_dump(by_alias=False)
    values.update(summary=_register_summary_response(record))
    return RegisterOverviewResponse.model_validate(values)


def _register_list_response(record: CashRegisterRecord) -> RegisterListItemResponse:
    values = _register_state_response(record).model_dump(by_alias=False)
    values.update(
        summary=_register_summary_response(record),
        sales_count=record.sales_count,
        movements_count=record.movements_count,
    )
    return RegisterListItemResponse.model_validate(values)


def _quote_line_response(line: Any) -> QuoteLineResponse:
    subtotal = money(line.quantity * line.unit_price)
    return QuoteLineResponse(
        id=line.id,
        item=_item_snapshot_response(line.item_id, line.item_name, line.item_sku),
        quantity=line.quantity,
        unit_price=line.unit_price,
        subtotal=subtotal,
        discount_amount=line.discount_amount,
        tax_rate=line.tax_rate,
        tax_amount=line.tax_amount,
        total=line.line_total,
    )


def _quote_list_response(record: QuoteRecord) -> QuoteListItemResponse:
    quote = record.quote
    payment_method = (
        _payment_snapshot_response(
            method=record.payment_method,
            method_id=quote.payment_method_id,
            code=quote.payment_method_code,
            name=quote.payment_method_name,
            channel=quote.payment_channel,
            settlement_policy=quote.settlement_policy,
            affects_cash_drawer=quote.affects_cash_drawer,
            requires_evidence=quote.requires_evidence,
        )
        if quote.payment_method_id is not None
        else None
    )
    return QuoteListItemResponse(
        id=quote.id,
        number=quote.document_number,
        kind=cast(Any, quote.kind),
        status=cast(Any, quote.status),
        branch=_branch_response(record.branch),
        customer=_customer_response(
            record.customer,
            snapshot_id=quote.customer_id,
            snapshot_name=quote.customer_name,
        ),
        payment_method=payment_method,
        reference=quote.payment_reference,
        currency=quote.currency_code,
        subtotal=quote.subtotal,
        discount_amount=quote.discount_amount,
        tax_amount=quote.tax_amount,
        total=quote.total,
        due_at=quote.expires_at,
        created_at=quote.created_at,
        updated_at=quote.updated_at,
        version=quote.version,
    )


def _quote_detail_response(record: QuoteRecord) -> QuoteDetailResponse:
    values = _quote_list_response(record).model_dump(by_alias=False)
    values.update(
        lines=[_quote_line_response(line) for line in record.lines],
        notes=record.quote.notes,
        converted_sale_id=record.converted_sale_id,
    )
    return QuoteDetailResponse.model_validate(values)


def _sale_line_response(line: Any) -> SaleLineResponse:
    return SaleLineResponse(
        id=line.id,
        item=_item_snapshot_response(line.item_id, line.item_name, line.item_sku),
        quantity=line.quantity,
        unit_price=line.unit_price,
        subtotal=money(line.quantity * line.unit_price),
        discount_amount=line.discount_amount,
        tax_rate=line.tax_rate,
        tax_amount=line.tax_amount,
        total=line.line_total,
    )


def _sale_payment_response(record: SaleRecord) -> SalePaymentResponse | None:
    sale = record.sale
    if sale.settlement_policy != "immediate":
        return None
    return SalePaymentResponse(
        payment_method=_payment_snapshot_response(
            method=record.payment_method,
            method_id=sale.payment_method_id,
            code=sale.payment_method_code,
            name=sale.payment_method_name,
            channel=sale.payment_channel,
            settlement_policy=sale.settlement_policy,
            affects_cash_drawer=sale.affects_cash_drawer,
            requires_evidence=sale.requires_evidence,
        ),
        amount=sale.total,
        reference=sale.payment_reference,
        proofs=[],
    )


def _sale_list_response(record: SaleRecord) -> SaleListItemResponse:
    sale = record.sale
    return SaleListItemResponse(
        id=sale.id,
        number=sale.sale_number,
        branch=_branch_response(record.branch),
        register_id=sale.cash_register_id,
        customer=_customer_response(
            record.customer,
            snapshot_id=sale.customer_id,
            snapshot_name=sale.customer_name,
        ),
        status=cast(Any, sale.status),
        currency=sale.currency_code,
        subtotal=sale.subtotal,
        discount_amount=sale.discount_amount,
        tax_amount=sale.tax_amount,
        total=sale.total,
        payment_method=_payment_snapshot_response(
            method=record.payment_method,
            method_id=sale.payment_method_id,
            code=sale.payment_method_code,
            name=sale.payment_method_name,
            channel=sale.payment_channel,
            settlement_policy=sale.settlement_policy,
            affects_cash_drawer=sale.affects_cash_drawer,
            requires_evidence=sale.requires_evidence,
        ),
        reference=sale.payment_reference,
        sold_by_name=sale.sold_by_name,
        created_at=sale.completed_at,
        version=sale.version,
    )


def _sale_detail_response(record: SaleRecord) -> SaleDetailResponse:
    sale = record.sale
    values = _sale_list_response(record).model_dump(by_alias=False)
    values.update(
        quote_id=sale.quote_id,
        lines=[_sale_line_response(line) for line in record.lines],
        payment=_sale_payment_response(record),
        notes=sale.notes,
        void_reason=sale.void_reason,
        voided_by_platform_user_id=sale.voided_by_platform_user_id,
        voided_at=sale.voided_at,
        version=sale.version,
    )
    return SaleDetailResponse.model_validate(values)


def _checkout_response(result: Any) -> CheckoutResponse:
    record = cast(SaleRecord, result.sale)
    values = _sale_detail_response(record).model_dump(by_alias=False)
    values.update(
        receivable_id=result.receivable_id,
        inventory_movement_id=record.sale.inventory_movement_id,
    )
    return CheckoutResponse.model_validate(values)


def _proof_response(proof: PaymentProof) -> PaymentProofResponse:
    if proof.receivable_id is not None:
        owner_type = "receivable"
        owner_id = proof.receivable_id
    elif proof.customer_payment_id is not None:
        owner_type = "customer_payment"
        owner_id = proof.customer_payment_id
    else:
        raise RuntimeError("A payment proof must have an owner.")
    return PaymentProofResponse(
        id=proof.id,
        owner_type=owner_type,
        owner_id=owner_id,
        filename=proof.original_filename,
        content_type=proof.content_type,
        size=proof.size_bytes,
        checksum=proof.checksum_sha256,
        created_at=proof.created_at,
        content_url=f"/api/v1/pos/proofs/{proof.id}/content",
    )


def _customer_payment_response(record: CustomerPaymentRecord) -> ReceivablePaymentResponse:
    payment = record.payment
    return ReceivablePaymentResponse(
        id=payment.id,
        amount=payment.amount,
        payment_method=_payment_snapshot_response(
            method=record.payment_method,
            method_id=payment.payment_method_id,
            code=payment.payment_method_code,
            name=payment.payment_method_name,
            channel=payment.payment_channel,
            settlement_policy=payment.settlement_policy,
            affects_cash_drawer=payment.affects_cash_drawer,
            requires_evidence=payment.requires_evidence,
        ),
        reference=payment.reference,
        note=payment.note,
        register_id=payment.cash_register_id,
        status=cast(CustomerPaymentStatus, payment.status),
        proofs=[_proof_response(proof) for proof in record.proofs],
        received_by_platform_user_id=payment.received_by_platform_user_id,
        paid_at=payment.posted_at,
        reversed_at=payment.reversed_at,
        reversal_reason=payment.reversal_reason,
        version=payment.version,
    )


def _receivable_line_response(line: Any) -> ReceivableLineResponse:
    return ReceivableLineResponse(
        id=line.id,
        item=_item_snapshot_response(line.item_id, line.item_name, line.item_sku),
        description=line.item_name,
        quantity=line.quantity,
        unit_price=line.unit_price,
        total=line.line_total,
    )


def _receivable_list_response(record: ReceivableRecord) -> ReceivableListItemResponse:
    receivable = record.receivable
    payment_method = (
        _payment_snapshot_response(
            method=record.payment_method,
            method_id=receivable.payment_method_id,
            code=receivable.payment_method_code,
            name=receivable.payment_method_name,
            channel=receivable.payment_channel,
            settlement_policy=receivable.settlement_policy,
            affects_cash_drawer=receivable.affects_cash_drawer,
            requires_evidence=receivable.requires_evidence,
        )
        if receivable.payment_method_id is not None
        else None
    )
    overdue = (
        receivable.status in {"pending", "partial"}
        and receivable.due_date is not None
        and receivable.due_date < datetime.now(ZoneInfo(record.branch.timezone)).date()
    )
    return ReceivableListItemResponse(
        id=receivable.id,
        number=receivable.receivable_number,
        source=cast(Any, receivable.source),
        sale_id=receivable.sale_id,
        appointment_id=receivable.appointment_id,
        branch=_branch_response(record.branch),
        customer=PosCustomerReferenceResponse(
            id=receivable.customer_id,
            name=receivable.customer_name,
        ),
        payment_method=payment_method,
        status=cast(Any, receivable.status),
        overdue=overdue,
        currency=receivable.currency_code,
        original_amount=receivable.amount,
        paid_total=receivable.paid_amount,
        balance=receivable.amount - receivable.paid_amount,
        reference=receivable.reference,
        due_date=receivable.due_date,
        created_at=receivable.created_at,
        updated_at=receivable.updated_at,
        version=receivable.version,
    )


def _receivable_detail_response(record: ReceivableRecord) -> ReceivableDetailResponse:
    values = _receivable_list_response(record).model_dump(by_alias=False)
    values.update(
        notes=record.receivable.notes,
        lines=[_receivable_line_response(line) for line in record.lines],
        payments=[_customer_payment_response(payment) for payment in record.payments],
        proofs=[_proof_response(proof) for proof in record.proofs],
    )
    return ReceivableDetailResponse.model_validate(values)


def _receivable_state_response(record: ReceivableRecord) -> ReceivableStateResponse:
    receivable = record.receivable
    return ReceivableStateResponse(
        id=receivable.id,
        status=cast(Any, receivable.status),
        paid_total=receivable.paid_amount,
        balance=receivable.amount - receivable.paid_amount,
        version=receivable.version,
    )


def _sales_summary_response(summary: Any) -> SalesSummaryResponse:
    return SalesSummaryResponse(
        gross_sales=summary.gross_sales,
        discounts=summary.discounts,
        taxes=summary.taxes,
        net_sales=summary.net_sales,
        average_ticket=summary.average_ticket,
        sales_count=summary.sales_count,
        voided_count=summary.voided_count,
    )


def _quotes_summary_response(summary: Any) -> QuotesSummaryResponse:
    return QuotesSummaryResponse(
        open_count=summary.open_count,
        held_count=summary.held_count,
        converted_count=summary.converted_count,
        open_total=money(summary.open_total),
        held_total=money(summary.held_total),
    )


def _receivables_summary_response(summary: Any) -> ReceivablesSummaryResponse:
    return ReceivablesSummaryResponse(
        original_total=money(summary.original_total),
        paid_total=money(summary.paid_total),
        pending_total=money(summary.pending_total),
        overdue_total=money(summary.overdue_total),
        pending_count=summary.pending_count,
        partial_count=summary.partial_count,
        overdue_count=summary.overdue_count,
    )


def _state_response(result: Any) -> PosStateResponse:
    return PosStateResponse(
        branch_id=result.branch_id,
        register=(
            _register_detail_response(result.register) if result.register is not None else None
        ),
        catalog=[_catalog_response(item) for item in result.catalog],
        quotes=[_quote_detail_response(item) for item in result.quotes],
        sales=[_sale_detail_response(item) for item in result.sales],
        receivables=[_receivable_detail_response(item) for item in result.receivables],
        receivable_summary=_receivables_summary_response(result.receivable_summary),
        payment_methods=[_payment_method_response(item) for item in result.payment_methods],
    )


@router.get("/state", responses=_RESPONSES)
def get_pos_state(
    response: Response,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PosReadGrant,
    branch_id: Annotated[UUID, Query(alias="branchId")],
) -> PosStateResponse:
    response.headers["Cache-Control"] = "no-store"
    return _state_response(PosService(database).state(principal, grant, branch_id))


@router.get("/registers/current", responses=_RESPONSES)
def get_current_register(
    response: Response,
    database: DatabaseSession,
    grant: PosCashReadGrant,
    branch_id: Annotated[UUID, Query(alias="branchId")],
) -> RegisterDetailResponse | None:
    response.headers["Cache-Control"] = "no-store"
    result = PosService(database).current_register(grant, branch_id)
    return _register_detail_response(result) if result is not None else None


@router.get("/registers", responses=_RESPONSES)
def list_registers(
    response: Response,
    database: DatabaseSession,
    grant: PosCashReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
) -> PaginatedRegistersResponse:
    response.headers["Cache-Control"] = "no-store"
    result = PosService(database).list_registers(
        grant,
        branch_id=branch_id,
        page=page,
        page_size=page_size,
    )
    return PaginatedRegistersResponse(
        items=[_register_list_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=_page_count(result.total_items, page_size),
    )


@router.post(
    "/registers",
    status_code=status.HTTP_201_CREATED,
    responses=_RESPONSES,
)
def open_register(
    payload: OpenRegisterRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PosRegisterManageGrant,
    idempotency_key: IdempotencyKey,
) -> RegisterOverviewResponse:
    return _register_overview_response(
        PosService(database).open_register(
            principal=principal,
            grant=grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.get("/registers/{register_id}", responses=_RESPONSES)
def get_register(
    register_id: UUID,
    response: Response,
    database: DatabaseSession,
    grant: PosCashReadGrant,
) -> RegisterDetailResponse:
    response.headers["Cache-Control"] = "no-store"
    return _register_detail_response(PosService(database).get_register(grant, register_id))


@router.get("/registers/{register_id}/movements", responses=_RESPONSES)
def list_register_movements(
    register_id: UUID,
    response: Response,
    database: DatabaseSession,
    grant: PosCashReadGrant,
    movement_type: Annotated[CashMovementType | None, Query(alias="type")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
) -> PaginatedCashMovementsResponse:
    response.headers["Cache-Control"] = "no-store"
    result = PosService(database).list_register_movements(
        grant,
        register_id=register_id,
        movement_type=movement_type,
        page=page,
        page_size=page_size,
    )
    return PaginatedCashMovementsResponse(
        items=[_cash_movement_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=_page_count(result.total_items, page_size),
    )


@router.post("/registers/{register_id}/movements", responses=_RESPONSES)
def create_manual_movement(
    register_id: UUID,
    payload: CreateManualCashMovementRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PosCashManageGrant,
    idempotency_key: IdempotencyKey,
) -> CashMovementResponse:
    return _cash_movement_response(
        PosService(database).create_manual_movement(
            principal=principal,
            grant=grant,
            register_id=register_id,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.post("/registers/{register_id}/close", responses=_RESPONSES)
def close_register(
    register_id: UUID,
    payload: CloseRegisterRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PosRegisterManageGrant,
    idempotency_key: IdempotencyKey,
) -> RegisterOverviewResponse:
    return _register_overview_response(
        PosService(database).close_register(
            principal=principal,
            grant=grant,
            register_id=register_id,
            counted_cash=payload.counted_cash,
            notes=payload.notes,
            expected_version=payload.version,
            idempotency_key=idempotency_key,
        )
    )


@router.get("/quotes", responses=_RESPONSES)
def list_quotes(
    response: Response,
    database: DatabaseSession,
    grant: SalesReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    customer_id: Annotated[UUID | None, Query(alias="customerId")] = None,
    status_filter: Annotated[QuoteStatus | None, Query(alias="status")] = None,
    kind: QuoteKind | None = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
) -> PaginatedQuotesResponse:
    response.headers["Cache-Control"] = "no-store"
    result = PosService(database).list_quotes(
        grant,
        branch_id=branch_id,
        customer_id=customer_id,
        status=status_filter,
        kind=kind,
        page=page,
        page_size=page_size,
    )
    return PaginatedQuotesResponse(
        items=[_quote_list_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=_page_count(result.total_items, page_size),
    )


@router.post("/quotes", status_code=status.HTTP_201_CREATED, responses=_RESPONSES)
def create_quote(
    payload: CreateQuoteRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: SalesQuoteManageGrant,
    idempotency_key: IdempotencyKey,
) -> QuoteDetailResponse:
    return _quote_detail_response(
        PosService(database).create_quote(
            principal=principal,
            grant=grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.get("/quotes/summary", responses=_RESPONSES)
def quotes_summary(
    response: Response,
    database: DatabaseSession,
    grant: SalesReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> QuotesSummaryResponse:
    response.headers["Cache-Control"] = "no-store"
    return _quotes_summary_response(PosService(database).quotes_summary(grant, branch_id=branch_id))


@router.get("/quotes/{quote_id}", responses=_RESPONSES)
def get_quote(
    quote_id: UUID,
    database: DatabaseSession,
    grant: SalesReadGrant,
) -> QuoteDetailResponse:
    return _quote_detail_response(PosService(database).get_quote(grant, quote_id))


@router.patch("/quotes/{quote_id}", responses=_RESPONSES)
def update_quote(
    quote_id: UUID,
    payload: UpdateQuoteRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: SalesQuoteManageGrant,
) -> QuoteDetailResponse:
    return _quote_detail_response(
        PosService(database).update_quote(
            principal=principal,
            grant=grant,
            quote_id=quote_id,
            expected_version=payload.version,
            changes=payload.model_dump(
                exclude_unset=True,
                exclude={"version"},
                by_alias=False,
            ),
        )
    )


@router.post("/quotes/{quote_id}/cancel", responses=_RESPONSES)
def cancel_quote(
    quote_id: UUID,
    payload: VoidRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: SalesQuoteManageGrant,
) -> QuoteStateResponse:
    record = PosService(database).cancel_quote(
        principal=principal,
        grant=grant,
        quote_id=quote_id,
        reason=payload.reason,
        expected_version=payload.version,
    )
    return QuoteStateResponse(
        id=record.quote.id,
        kind=cast(Any, record.quote.kind),
        status=cast(Any, record.quote.status),
        converted_sale_id=record.converted_sale_id,
        version=record.quote.version,
    )


@router.post("/checkout", status_code=status.HTTP_201_CREATED, responses=_RESPONSES)
def checkout(
    payload: CheckoutRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PosSellGrant,
    idempotency_key: IdempotencyKey,
) -> CheckoutResponse:
    return _checkout_response(
        PosService(database).checkout(
            principal=principal,
            grant=grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=idempotency_key,
        )
    )


@router.get("/sales/summary", responses=_RESPONSES)
def sales_summary(
    response: Response,
    database: DatabaseSession,
    grant: SalesReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    date_from: Annotated[date | None, Query(alias="dateFrom")] = None,
    date_to: Annotated[date | None, Query(alias="dateTo")] = None,
) -> SalesSummaryResponse:
    response.headers["Cache-Control"] = "no-store"
    return _sales_summary_response(
        PosService(database).sales_summary(
            grant,
            branch_id=branch_id,
            date_from=date_from,
            date_to=date_to,
        )
    )


@router.get("/sales", responses=_RESPONSES)
def list_sales(
    response: Response,
    database: DatabaseSession,
    grant: SalesReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    register_id: Annotated[UUID | None, Query(alias="registerId")] = None,
    customer_id: Annotated[UUID | None, Query(alias="customerId")] = None,
    status_filter: Annotated[SaleStatus | None, Query(alias="status")] = None,
    date_from: Annotated[date | None, Query(alias="dateFrom")] = None,
    date_to: Annotated[date | None, Query(alias="dateTo")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
) -> PaginatedSalesResponse:
    response.headers["Cache-Control"] = "no-store"
    result = PosService(database).list_sales(
        grant,
        branch_id=branch_id,
        register_id=register_id,
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
        total_pages=_page_count(result.total_items, page_size),
    )


@router.get("/sales/{sale_id}", responses=_RESPONSES)
def get_sale(
    sale_id: UUID,
    database: DatabaseSession,
    grant: SalesReadGrant,
) -> SaleDetailResponse:
    return _sale_detail_response(PosService(database).get_sale(grant, sale_id))


@router.post("/sales/{sale_id}/void", responses=_RESPONSES)
def void_sale(
    sale_id: UUID,
    payload: VoidRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PosVoidGrant,
    idempotency_key: IdempotencyKey,
) -> SaleStateResponse:
    record = PosService(database).void_sale(
        principal=principal,
        grant=grant,
        sale_id=sale_id,
        reason=payload.reason,
        expected_version=payload.version,
        idempotency_key=idempotency_key,
    )
    return SaleStateResponse(
        id=record.sale.id,
        status=cast(Any, record.sale.status),
        void_reason=record.sale.void_reason,
        voided_at=record.sale.voided_at,
        version=record.sale.version,
    )


@router.get("/receivables/summary", responses=_RESPONSES)
def receivables_summary(
    response: Response,
    database: DatabaseSession,
    grant: PosReceivablesReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
) -> ReceivablesSummaryResponse:
    response.headers["Cache-Control"] = "no-store"
    return _receivables_summary_response(
        PosService(database).receivables_summary(
            grant,
            branch_id=branch_id,
        )
    )


@router.get("/receivables", responses=_RESPONSES)
def list_receivables(
    response: Response,
    database: DatabaseSession,
    grant: PosReceivablesReadGrant,
    branch_id: Annotated[UUID | None, Query(alias="branchId")] = None,
    customer_id: Annotated[UUID | None, Query(alias="customerId")] = None,
    status_filter: Annotated[ReceivableStatus | None, Query(alias="status")] = None,
    overdue: bool | None = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 50,
) -> PaginatedReceivablesResponse:
    response.headers["Cache-Control"] = "no-store"
    result = PosService(database).list_receivables(
        grant,
        branch_id=branch_id,
        customer_id=customer_id,
        status=status_filter,
        overdue=overdue,
        page=page,
        page_size=page_size,
    )
    return PaginatedReceivablesResponse(
        items=[_receivable_list_response(item) for item in result.items],
        page=page,
        page_size=page_size,
        total_items=result.total_items,
        total_pages=_page_count(result.total_items, page_size),
    )


@router.get("/receivables/{receivable_id}", responses=_RESPONSES)
def get_receivable(
    receivable_id: UUID,
    database: DatabaseSession,
    grant: PosReceivablesReadGrant,
) -> ReceivableDetailResponse:
    return _receivable_detail_response(PosService(database).get_receivable(grant, receivable_id))


@router.patch("/receivables/{receivable_id}", responses=_RESPONSES)
def update_receivable(
    receivable_id: UUID,
    payload: UpdateReceivableRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PosReceivablesManageGrant,
) -> ReceivableStateResponse:
    return _receivable_state_response(
        PosService(database).update_receivable(
            principal=principal,
            grant=grant,
            receivable_id=receivable_id,
            expected_version=payload.version,
            changes=payload.model_dump(
                exclude_unset=True,
                exclude={"version"},
                by_alias=False,
            ),
        )
    )


@router.post(
    "/receivables/{receivable_id}/payments",
    status_code=status.HTTP_201_CREATED,
    responses=_RESPONSES,
)
def create_receivable_payment(
    receivable_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PosReceivablesCollectGrant,
    storage: AttachmentStorageDep,
    idempotency_key: IdempotencyKey,
    amount: Annotated[Decimal, Form(gt=0)],
    method_id: Annotated[UUID, Form(alias="methodId")],
    version: Annotated[int, Form(ge=1)],
    reference: Annotated[str | None, Form(max_length=160)] = None,
    note: Annotated[str | None, Form(max_length=1000)] = None,
    register_id: Annotated[UUID | None, Form(alias="registerId")] = None,
    file: Annotated[UploadFile | None, File()] = None,
) -> ReceivableStateResponse:
    payload = CreateReceivablePaymentRequest(
        amount=amount,
        payment_method_id=method_id,
        reference=reference,
        note=note,
        register_id=register_id,
        version=version,
    )
    try:
        record = PosService(database).create_receivable_payment(
            principal=principal,
            grant=grant,
            receivable_id=receivable_id,
            amount=payload.amount,
            payment_method_id=payload.payment_method_id,
            reference=payload.reference,
            note=payload.note,
            register_id=payload.register_id,
            expected_version=payload.version,
            idempotency_key=idempotency_key,
            evidence_source=file.file if file is not None else None,
            filename=(file.filename or "comprobante") if file is not None else None,
            content_type=(file.content_type or "") if file is not None else None,
            storage=storage,
            max_bytes=settings.attachment_max_bytes,
        )
        return _receivable_state_response(record)
    finally:
        if file is not None:
            file.file.close()


@router.post(
    "/receivables/{receivable_id}/proofs",
    status_code=status.HTTP_201_CREATED,
    responses=_RESPONSES,
)
def upload_receivable_proof(
    receivable_id: UUID,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PosReceivablesCollectGrant,
    storage: AttachmentStorageDep,
    file: Annotated[UploadFile, File()],
) -> PaymentProofResponse:
    try:
        proof = PosService(database).upload_receivable_proof(
            principal=principal,
            grant=grant,
            receivable_id=receivable_id,
            evidence_source=file.file,
            filename=file.filename or "comprobante",
            content_type=file.content_type or "",
            storage=storage,
            max_bytes=settings.attachment_max_bytes,
        )
        return _proof_response(proof)
    finally:
        file.file.close()


@router.post("/receivables/{receivable_id}/cancel", responses=_RESPONSES)
def cancel_receivable(
    receivable_id: UUID,
    payload: VoidRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PosReceivablesManageGrant,
) -> ReceivableStateResponse:
    record = PosService(database).cancel_receivable(
        principal=principal,
        grant=grant,
        receivable_id=receivable_id,
        reason=payload.reason,
        expected_version=payload.version,
    )
    return _receivable_state_response(record)


@router.post("/payments/{payment_id}/reverse", responses=_RESPONSES)
def reverse_payment(
    payment_id: UUID,
    payload: ReverseRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: PosReceivablesCollectGrant,
    idempotency_key: IdempotencyKey,
) -> ReceivableStateResponse:
    return _receivable_state_response(
        PosService(database).reverse_payment(
            principal=principal,
            grant=grant,
            payment_id=payment_id,
            reason=payload.reason,
            expected_version=payload.version,
            idempotency_key=idempotency_key,
        )
    )


@router.get(
    "/proofs/{proof_id}/content",
    response_class=FileResponse,
    responses=_RESPONSES,
)
def get_proof_content(
    proof_id: UUID,
    database: DatabaseSession,
    grant: PosReceivablesReadGrant,
    storage: AttachmentStorageDep,
) -> FileResponse:
    proof = PosService(database).get_proof(grant, proof_id)
    return FileResponse(
        path=storage.path_for(proof.storage_key),
        media_type=proof.content_type,
        filename=proof.original_filename,
        headers={
            "Cache-Control": "private, no-store",
            "ETag": f'"{proof.checksum_sha256}"',
        },
    )
