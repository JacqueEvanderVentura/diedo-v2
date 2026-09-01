from decimal import Decimal
from uuid import uuid7

import pytest
from app.services.pos_money import PricingInput, price_document


def test_price_document_uses_line_tax_and_reconciles_fixed_discount() -> None:
    taxed = uuid7()
    exempt = uuid7()

    result = price_document(
        [
            PricingInput(taxed, Decimal("2"), Decimal("100"), Decimal("18")),
            PricingInput(exempt, Decimal("1"), Decimal("50"), Decimal("0")),
        ],
        discount_type="fixed",
        discount_value=Decimal("25"),
    )

    assert result.subtotal == Decimal("250.00")
    assert result.discount_amount == Decimal("25.00")
    assert result.taxable_amount == Decimal("225.00")
    assert result.tax_amount == Decimal("32.40")
    assert result.total == Decimal("257.40")
    assert sum((line.line_total for line in result.lines), Decimal("0")) == result.total


def test_price_document_rounding_residue_stays_reconciled() -> None:
    result = price_document(
        [
            PricingInput(uuid7(), Decimal("1"), Decimal("0.05"), Decimal("18")),
            PricingInput(uuid7(), Decimal("1"), Decimal("0.05"), Decimal("18")),
            PricingInput(uuid7(), Decimal("1"), Decimal("0.05"), Decimal("18")),
        ],
        discount_type="fixed",
        discount_value=Decimal("0.10"),
    )

    assert result.discount_amount == Decimal("0.10")
    assert result.taxable_amount == Decimal("0.05")
    assert result.total == sum((line.line_total for line in result.lines), Decimal("0"))


@pytest.mark.parametrize(
    ("discount_type", "discount_value"),
    [(None, Decimal("1")), ("percent", Decimal("100.01")), ("fixed", Decimal("-1"))],
)
def test_price_document_rejects_invalid_discounts(
    discount_type: str | None, discount_value: Decimal
) -> None:
    with pytest.raises(ValueError):
        price_document(
            [PricingInput(uuid7(), Decimal("1"), Decimal("10"), Decimal("18"))],
            discount_type=discount_type,  # type: ignore[arg-type]
            discount_value=discount_value,
        )
