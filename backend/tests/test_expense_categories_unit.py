from uuid import uuid7

import pytest
from app.services.errors import InvalidOperationError
from app.services.expense_categories import (
    LEGACY_EXPENSE_CATEGORIES,
    expense_category_api_value,
    resolve_expense_category_fields,
)


def test_expense_category_api_value_prefers_catalog_id() -> None:
    category_id = uuid7()
    assert expense_category_api_value("otros", category_id) == str(category_id)
    assert expense_category_api_value("nomina", None) == "nomina"


def test_resolve_legacy_slug() -> None:
    resolved = resolve_expense_category_fields(None, uuid7(), {"category": "nomina"})
    assert resolved["category"] == "nomina"
    assert resolved["category_id"] is None


def test_resolve_rejects_unknown_slug() -> None:
    with pytest.raises(InvalidOperationError) as error:
        resolve_expense_category_fields(None, uuid7(), {"category": "salario-empleados"})
    assert error.value.parameter == "category"


def test_legacy_set_is_stable() -> None:
    assert "nomina" in LEGACY_EXPENSE_CATEGORIES
    assert "otros" in LEGACY_EXPENSE_CATEGORIES
