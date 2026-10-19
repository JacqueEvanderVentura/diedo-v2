from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.db.models.foundation import Workspace
from app.repositories.pos import PosRepository, QuoteRecord, SaleRecord
from app.schemas.invoice_documents import InvoiceDocumentRequest, InvoiceLineItemRequest
from app.services.invoice_billing import format_customer_tax_line, resolve_billing_branding
from app.services.invoice_html import build_invoice_document_html
from app.services.pdf_renderer import PdfRenderer, get_pdf_renderer


def _format_invoice_datetime(value: datetime, tz_name: str) -> str:
    localized = value.astimezone(ZoneInfo(tz_name))
    return localized.strftime("%d %b %Y, %I:%M %p").replace("AM", "a.m.").replace("PM", "p.m.")


def _discount_pct(subtotal: Decimal, discount_amt: Decimal) -> Decimal:
    if subtotal <= 0:
        return Decimal("0")
    return (discount_amt / subtotal * Decimal("100")).quantize(Decimal("0.1"))


def _paid_total_for_sale(
    repository: PosRepository,
    workspace_id: UUID,
    sale_id: UUID,
) -> Decimal:
    receivable = repository.receivable_for_sale(workspace_id, sale_id)
    if receivable is None:
        return Decimal("0")
    record = repository.receivable_record(receivable)
    return Decimal(sum((payment.payment.amount for payment in record.payments), Decimal("0")))


def sale_to_invoice_request(
    record: SaleRecord,
    workspace: Workspace,
    *,
    paid_amount: Decimal | None = None,
) -> InvoiceDocumentRequest:
    sale = record.sale
    branch = record.branch
    branding = resolve_billing_branding(workspace, branch)
    customer = record.customer
    customer_name = customer.display_name if customer is not None else "Cliente Mostrador"
    customer_phone = customer.phone if customer is not None else ""
    tax_line = (
        format_customer_tax_line(
            customer_type=customer.customer_type if customer else None,
            document_type=customer.document_type if customer else None,
            document_id=customer.document_id if customer else None,
        )
        if customer is not None
        else ""
    )
    subtotal = sale.subtotal
    discount_amt = sale.discount_amount
    tax_amt = sale.tax_amount
    total = sale.total
    paid = paid_amount if paid_amount is not None else Decimal("0")
    balance = max(Decimal("0"), total - paid)
    items = [
        InvoiceLineItemRequest(
            name=line.item_name,
            qty=line.quantity,
            price=line.unit_price,
            list_price=line.list_price,
            sku=line.item_sku,
        )
        for line in record.lines
    ]
    tax_pct = (
        (tax_amt / (subtotal - discount_amt) * Decimal("100")).quantize(Decimal("0.01"))
        if subtotal > discount_amt
        else workspace.tax_default_rate
    )
    return InvoiceDocumentRequest(
        id=sale.sale_number,
        kind="sale",
        issued_at=_format_invoice_datetime(sale.completed_at, branch.timezone),
        branch_name=branch.name,
        region=workspace.locale,
        customer_name=customer_name,
        customer_phone=customer_phone or "",
        customer_tax_line=tax_line,
        payment_method=record.payment_method.name,
        payment_reference=sale.payment_reference or "",
        business_name=branding["business_name"],
        legal_name=branding["legal_name"],
        business_rnc=branding["business_rnc"],
        business_address=branding["business_address"],
        business_phone=branding["business_phone"],
        business_email=branding["business_email"] or None,
        logo_data_url=branding["logo_data_url"],
        footer_note=branding["footer_note"],
        items=items,
        subtotal=subtotal,
        discount_amt=discount_amt,
        discount_pct=_discount_pct(subtotal, discount_amt),
        tax_pct=tax_pct,
        tax_amt=tax_amt,
        total=total,
        paid_amount=paid,
        balance_due=balance,
    )


def quote_to_invoice_request(record: QuoteRecord, workspace: Workspace) -> InvoiceDocumentRequest:
    quote = record.quote
    branch = record.branch
    branding = resolve_billing_branding(workspace, branch)
    customer = record.customer
    customer_name = (
        quote.customer_name
        or (customer.display_name if customer is not None else None)
        or "Cliente"
    )
    customer_phone = quote.customer_phone or (customer.phone if customer else "") or ""
    tax_line = (
        format_customer_tax_line(
            customer_type=customer.customer_type if customer else None,
            document_type=customer.document_type if customer else None,
            document_id=customer.document_id if customer else None,
        )
        if customer is not None
        else ""
    )
    subtotal = quote.subtotal
    discount_amt = quote.discount_amount
    tax_amt = quote.tax_amount
    total = quote.total
    items = [
        InvoiceLineItemRequest(
            name=line.item_name,
            qty=line.quantity,
            price=line.unit_price,
            list_price=line.list_price,
            sku=line.item_sku,
        )
        for line in record.lines
    ]
    tax_pct = (
        (tax_amt / (subtotal - discount_amt) * Decimal("100")).quantize(Decimal("0.01"))
        if subtotal > discount_amt
        else workspace.tax_default_rate
    )
    valid_until = ""
    if quote.expires_at is not None:
        valid_until = _format_invoice_datetime(quote.expires_at, branch.timezone)
    payment_method = (
        record.payment_method.name if record.payment_method is not None else "Pendiente de pago"
    )
    return InvoiceDocumentRequest(
        id=quote.document_number,
        kind="quote",
        issued_at=_format_invoice_datetime(quote.created_at, branch.timezone),
        valid_until=valid_until,
        branch_name=branch.name,
        region=workspace.locale,
        customer_name=customer_name,
        customer_phone=customer_phone,
        customer_tax_line=tax_line,
        payment_method=payment_method,
        payment_reference=quote.payment_reference or "",
        business_name=branding["business_name"],
        legal_name=branding["legal_name"],
        business_rnc=branding["business_rnc"],
        business_address=branding["business_address"],
        business_phone=branding["business_phone"],
        business_email=branding["business_email"] or None,
        logo_data_url=branding["logo_data_url"],
        footer_note=branding["footer_note"],
        items=items,
        subtotal=subtotal,
        discount_amt=discount_amt,
        discount_pct=_discount_pct(subtotal, discount_amt),
        tax_pct=tax_pct,
        tax_amt=tax_amt,
        total=total,
    )


class InvoicePdfService:
    def __init__(self, session: Session, renderer: PdfRenderer | None = None) -> None:
        self._session = session
        self._repository = PosRepository(session)
        self._renderer = renderer

    def _render(self, payload: InvoiceDocumentRequest) -> bytes:
        html = build_invoice_document_html(payload)
        renderer = self._renderer or get_pdf_renderer()
        return renderer.render_html(html)

    def render_document(self, payload: InvoiceDocumentRequest) -> bytes:
        return self._render(payload)

    def render_sale_pdf(self, workspace_id: UUID, record: SaleRecord) -> bytes:
        workspace = self._repository.workspace(workspace_id)
        if workspace is None:
            raise RuntimeError("Workspace missing for sale invoice PDF.")
        paid = _paid_total_for_sale(self._repository, workspace_id, record.sale.id)
        payload = sale_to_invoice_request(record, workspace, paid_amount=paid)
        return self._render(payload)

    def render_quote_pdf(self, workspace_id: UUID, record: QuoteRecord) -> bytes:
        workspace = self._repository.workspace(workspace_id)
        if workspace is None:
            raise RuntimeError("Workspace missing for quote document PDF.")
        payload = quote_to_invoice_request(record, workspace)
        return self._render(payload)
