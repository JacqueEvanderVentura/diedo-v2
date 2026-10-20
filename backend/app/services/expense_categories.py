"""Resolve finance expense categories: legacy slugs or catalog expense kinds."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.catalog import ItemCategory
from app.services.errors import InvalidOperationError

LEGACY_EXPENSE_CATEGORIES = frozenset(
    {
        "alquiler",
        "servicios",
        "nomina",
        "insumos",
        "marketing",
        "mantenimiento",
        "otros",
    }
)

LEGACY_EXPENSE_CATEGORY_LABELS: dict[str, str] = {
    "alquiler": "Alquiler",
    "servicios": "Servicios (luz/agua/internet)",
    "nomina": "Nómina",
    "insumos": "Insumos",
    "marketing": "Marketing",
    "mantenimiento": "Mantenimiento",
    "otros": "Otros",
}


def expense_category_api_value(category: str, category_id: UUID | None) -> str:
    if category_id is not None:
        return str(category_id)
    return category


def expense_category_display_name(
    category: str,
    category_id: UUID | None,
    catalog_name: str | None,
) -> str:
    if catalog_name:
        return catalog_name
    if category_id is not None:
        return str(category_id)
    return LEGACY_EXPENSE_CATEGORY_LABELS.get(category, category)


def _load_expense_catalog_category(
    session: Session,
    workspace_id: UUID,
    category_id: UUID,
) -> ItemCategory:
    row = session.scalar(
        select(ItemCategory).where(
            ItemCategory.workspace_id == workspace_id,
            ItemCategory.id == category_id,
            ItemCategory.status == "active",
        )
    )
    if row is None:
        raise InvalidOperationError("La categoría de egreso no existe.", "categoryId")
    if row.category_kind != "expense":
        raise InvalidOperationError(
            "La categoría seleccionada no es de egreso.",
            "categoryId",
        )
    return row


def resolve_expense_category_fields(
    session: Session,
    workspace_id: UUID,
    values: dict[str, Any],
) -> dict[str, Any]:
    """Return persistent ``category`` + ``category_id`` from create/update payload."""
    category_id = values.get("category_id")
    category = values.get("category")

    if category_id is not None:
        _load_expense_catalog_category(session, workspace_id, category_id)
        return {"category": "otros", "category_id": category_id}

    slug = (category or "otros").strip().lower()
    if slug in LEGACY_EXPENSE_CATEGORIES:
        return {"category": slug, "category_id": None}

    try:
        parsed = UUID(str(category))
    except TypeError, ValueError:
        raise InvalidOperationError(
            "La categoría del gasto no es válida. "
            "Usa una categoría configurada o una categoría estándar.",
            "category",
        ) from None

    _load_expense_catalog_category(session, workspace_id, parsed)
    return {"category": "otros", "category_id": parsed}


def normalize_expense_category_changes(
    session: Session,
    workspace_id: UUID,
    changes: dict[str, Any],
) -> dict[str, Any]:
    if "category_id" not in changes and "category" not in changes:
        return changes
    merged = {
        "category": changes.get("category"),
        "category_id": changes.get("category_id"),
    }
    if "category_id" not in changes:
        merged["category_id"] = None
    resolved = resolve_expense_category_fields(session, workspace_id, merged)
    updated = dict(changes)
    updated["category"] = resolved["category"]
    updated["category_id"] = resolved["category_id"]
    return updated
