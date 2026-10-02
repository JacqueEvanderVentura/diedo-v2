"""Immutable snapshots of CRM/POS quote state over time."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from app.db.models.sales import SalesQuote, SalesQuoteLine


def build_quote_revision_snapshot(
    quote: SalesQuote,
    lines: Sequence[SalesQuoteLine],
    *,
    invoice_number: str | None = None,
) -> dict[str, Any]:
    return {
        "number": quote.document_number,
        "crmStatus": quote.crm_status,
        "structuralStatus": quote.status,
        "customerName": quote.customer_name,
        "notes": quote.notes,
        "subtotal": str(quote.subtotal),
        "discountAmount": str(quote.discount_amount),
        "taxAmount": str(quote.tax_amount),
        "total": str(quote.total),
        "dueAt": quote.expires_at.isoformat() if quote.expires_at else None,
        "invoiceNumber": invoice_number,
        "lines": [
            {
                "name": line.item_name,
                "qty": str(line.quantity),
                "unitPrice": str(line.unit_price),
                "lineTotal": str(line.line_total),
            }
            for line in lines
        ],
    }


def revision_occurred_at(quote: SalesQuote, event: str) -> datetime:
    if event == "created":
        return quote.created_at
    if event in {"invoiced", "cancelled"} and quote.closed_at is not None:
        return quote.closed_at
    return quote.updated_at or datetime.now(UTC)
