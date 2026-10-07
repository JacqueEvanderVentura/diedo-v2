from __future__ import annotations

import html
from decimal import Decimal
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config import settings
from app.schemas.invoice_documents import InvoiceDocumentRequest

_TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "templates"
_ENV = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(enabled_extensions=("html",)),
)


def format_dop(value: Decimal | float | int) -> str:
    amount = Decimal(str(value or 0))
    quantized = amount.quantize(Decimal("0.01"))
    sign = "-" if quantized < 0 else ""
    absolute = abs(quantized)
    whole, fraction = f"{absolute:.2f}".split(".")
    grouped: list[str] = []
    while whole:
        grouped.insert(0, whole[-3:])
        whole = whole[:-3]
    formatted_whole = ".".join(grouped) if grouped else "0"
    return f"{sign}RD$ {formatted_whole},{fraction}"


def _escape(value: object) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def _item_price_html(unit: Decimal, list_price: Decimal) -> str:
    if unit < list_price - Decimal("0.001"):
        return (
            f'<s class="strike">{_escape(format_dop(list_price))}</s> {_escape(format_dop(unit))}'
        )
    return _escape(format_dop(unit))


def _logo_html(logo_data_url: str, business_name: str) -> str:
    if logo_data_url.strip():
        safe_src = logo_data_url.replace('"', "&quot;")
        return f'<img src="{safe_src}" alt="" class="brand-logo" />'
    logo_url = f"{settings.public_app_url.rstrip('/')}/favicon.svg"
    safe_title = _escape(business_name or "Helios 360")
    return f'<img src="{logo_url}" alt="{safe_title}" class="brand-logo" />'


def _legal_lines(data: InvoiceDocumentRequest) -> list[dict[str, str]]:
    is_expense = data.kind == "expense"
    is_quote = data.kind == "quote"
    default_note = (
        f"Comprobante de gasto · {data.business_name}"
        if is_expense
        else (
            f"Cotización sujeta a disponibilidad · {data.business_name}"
            if is_quote
            else f"Gracias por su compra · {data.business_name}"
        )
    )
    note = (data.footer_note or "").strip() or default_note
    legal_title = (
        data.legal_name
        if data.legal_name and data.legal_name != data.business_name
        else data.business_name
    )
    address_lines = [line.strip() for line in data.business_address.splitlines() if line.strip()]
    rnc_line = f"RNC: {data.business_rnc}" if data.business_rnc else ""
    raw_lines = [legal_title, rnc_line, *address_lines, note]
    filtered = [line for line in raw_lines if line]
    lines: list[dict[str, str]] = []
    for index, line in enumerate(filtered):
        lines.append(
            {
                "text": line,
                "class_name": (
                    "invoice-footer-legal-name" if index == 0 else "invoice-footer-legal-line"
                ),
            }
        )
    return lines


def build_invoice_document_html(data: InvoiceDocumentRequest) -> str:
    is_expense = data.kind == "expense"
    is_quote = data.kind == "quote"
    doc_title = "Gasto" if is_expense else "Cotización" if is_quote else "Factura"
    total_color = "#dc2626" if is_expense else "#d97706" if is_quote else "#2563eb"
    balance = (
        data.balance_due
        if data.balance_due is not None
        else max(Decimal("0"), data.total - data.paid_amount)
    )
    paid = data.paid_amount
    tax_label = (data.tax_label or "").strip() or f"ITBIS ({data.tax_pct}%)"
    line_rows: list[dict[str, Any]] = []
    for item in data.items:
        unit = Decimal(item.price)
        list_price = Decimal(item.list_price if item.list_price is not None else item.price)
        qty = Decimal(item.qty)
        line_rows.append(
            {
                "name": item.name,
                "sku": item.sku,
                "qty": _escape(qty),
                "price_html": _item_price_html(unit, list_price),
                "line_total": _escape(format_dop(unit * qty)),
            }
        )
    branch_footer = ""
    if data.branch_name:
        branch_footer = " · ".join(part for part in (data.branch_name, data.region) if part)
    address_line = data.business_address.splitlines()[0].strip() if data.business_address else ""
    template = _ENV.get_template("invoice_document.html")
    html: str = template.render(
        id=_escape(data.id),
        doc_title=doc_title,
        total_color=total_color,
        business_name=_escape(data.business_name),
        business_rnc=_escape(data.business_rnc),
        business_address_line=_escape(address_line),
        region=_escape(data.region),
        logo_html=_logo_html(data.logo_data_url, data.business_name),
        issued_at=_escape(data.issued_at),
        customer_name=_escape(data.customer_name),
        customer_tax_line=_escape(data.customer_tax_line),
        customer_phone=_escape(data.customer_phone),
        payment_label="Condición" if is_quote else "Pago",
        payment_method=_escape(data.payment_method),
        payment_reference=_escape(data.payment_reference),
        valid_until=_escape(data.valid_until) if is_quote and data.valid_until else "",
        line_rows=line_rows,
        subtotal_fmt=_escape(format_dop(data.subtotal)),
        show_discount=data.discount_amt > 0,
        discount_pct_fmt=_escape(f"{data.discount_pct:.1f}"),
        discount_amt_fmt=_escape(format_dop(data.discount_amt)),
        tax_label=_escape(tax_label),
        tax_amt_fmt=_escape(format_dop(data.tax_amt)),
        total_fmt=_escape(format_dop(data.total)),
        show_paid=not is_quote and paid > 0,
        paid_amount_fmt=_escape(format_dop(paid)),
        show_balance=not is_quote and balance > Decimal("0.009"),
        balance_fmt=_escape(format_dop(balance)),
        business_phone=_escape(data.business_phone),
        business_email=_escape(data.business_email or ""),
        legal_lines=_legal_lines(data),
        branch_footer=_escape(branch_footer),
    )
    return html
