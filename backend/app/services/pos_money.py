from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal
from uuid import UUID

MONEY_QUANTUM = Decimal("0.01")
QUANTITY_QUANTUM = Decimal("0.001")
PERCENT_QUANTUM = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    """Round a monetary value using the ERP's commercial half-up rule."""

    return value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def quantity(value: Decimal) -> Decimal:
    return value.quantize(QUANTITY_QUANTUM, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class PricingInput:
    item_id: UUID
    quantity: Decimal
    unit_price: Decimal
    tax_rate: Decimal


@dataclass(frozen=True)
class PricedLine:
    item_id: UUID
    quantity: Decimal
    unit_price: Decimal
    gross_amount: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    line_total: Decimal


@dataclass(frozen=True)
class PricedDocument:
    lines: tuple[PricedLine, ...]
    subtotal: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    tax_amount: Decimal
    total: Decimal


def price_document(
    lines: list[PricingInput],
    *,
    discount_type: Literal["percent", "fixed"] | None = None,
    discount_value: Decimal = Decimal("0"),
) -> PricedDocument:
    """Calculate authoritative POS totals and allocate document discount by line.

    Prices are tax-exclusive. A fixed or percentage document discount is allocated
    proportionally so tax is calculated from each line's discounted taxable base.
    The final allocation absorbs rounding residue, keeping header and line totals
    exactly reconcilable.
    """

    if not lines:
        raise ValueError("A sale must contain at least one line.")
    if discount_value < 0:
        raise ValueError("Discount cannot be negative.")
    if discount_type is None and discount_value != 0:
        raise ValueError("Discount type is required when discount is non-zero.")
    if discount_type == "percent" and discount_value > 100:
        raise ValueError("Percentage discount cannot exceed 100.")

    normalized: list[tuple[PricingInput, Decimal, Decimal]] = []
    for line in lines:
        normalized_quantity = quantity(line.quantity)
        if normalized_quantity <= 0:
            raise ValueError("Line quantity must be positive.")
        normalized_price = money(line.unit_price)
        if normalized_price < 0:
            raise ValueError("Unit price cannot be negative.")
        normalized_tax_rate = line.tax_rate.quantize(PERCENT_QUANTUM, rounding=ROUND_HALF_UP)
        if normalized_tax_rate < 0 or normalized_tax_rate > 100:
            raise ValueError("Tax rate must be between 0 and 100.")
        gross = money(normalized_quantity * normalized_price)
        normalized.append((line, gross, normalized_tax_rate))

    subtotal = money(sum((gross for _, gross, _ in normalized), Decimal("0")))
    requested_discount = Decimal("0")
    if discount_type == "percent":
        requested_discount = money(subtotal * discount_value / Decimal("100"))
    elif discount_type == "fixed":
        requested_discount = money(discount_value)
    total_discount = min(subtotal, requested_discount)

    remaining_discount = total_discount
    remaining_gross = subtotal
    priced_lines: list[PricedLine] = []
    for index, (line, gross, tax_rate) in enumerate(normalized):
        if remaining_discount <= 0 or gross <= 0:
            line_discount = Decimal("0")
        elif index == len(normalized) - 1 or remaining_gross <= gross:
            line_discount = min(gross, remaining_discount)
        else:
            line_discount = min(
                gross,
                money(remaining_discount * gross / remaining_gross),
            )
        remaining_discount = money(remaining_discount - line_discount)
        remaining_gross = money(remaining_gross - gross)
        taxable = money(gross - line_discount)
        tax = money(taxable * tax_rate / Decimal("100"))
        priced_lines.append(
            PricedLine(
                item_id=line.item_id,
                quantity=quantity(line.quantity),
                unit_price=money(line.unit_price),
                gross_amount=gross,
                discount_amount=line_discount,
                taxable_amount=taxable,
                tax_rate=tax_rate,
                tax_amount=tax,
                line_total=money(taxable + tax),
            )
        )

    allocated_discount = money(sum((line.discount_amount for line in priced_lines), Decimal("0")))
    taxable_amount = money(sum((line.taxable_amount for line in priced_lines), Decimal("0")))
    tax_amount = money(sum((line.tax_amount for line in priced_lines), Decimal("0")))
    total = money(sum((line.line_total for line in priced_lines), Decimal("0")))
    return PricedDocument(
        lines=tuple(priced_lines),
        subtotal=subtotal,
        discount_amount=allocated_discount,
        taxable_amount=taxable_amount,
        tax_amount=tax_amount,
        total=total,
    )
