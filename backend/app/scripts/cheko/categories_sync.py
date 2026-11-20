"""Sync Cheko expense categories into item_categories (expense kind)."""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.catalog import ItemCategory
from app.scripts.cheko.context import ChekoContext


def ensure_expense_categories(
    session: Session,
    workspace_id: UUID,
    ctx: ChekoContext,
) -> dict[str, UUID]:
    """Map Cheko category id -> Diedo item_category id (expense kind)."""
    existing = session.scalars(
        select(ItemCategory).where(ItemCategory.workspace_id == workspace_id)
    ).all()
    by_name: dict[str, ItemCategory] = {row.normalized_name: row for row in existing}
    mapping: dict[str, UUID] = {}

    for category in ctx.categories:
        if category.get("tipo") != "gasto":
            continue
        cheko_id = str(category["id"])
        name = (category.get("nombre") or "").strip()
        if not name:
            continue
        norm = name.casefold()
        match = by_name.get(norm)
        if match is not None and match.category_kind == "expense":
            mapping[cheko_id] = match.id
            continue
        if match is not None:
            name = f"{name} (egreso Cheko)"
            norm = name.casefold()
            match = by_name.get(norm)
        if match is not None and match.category_kind == "expense":
            mapping[cheko_id] = match.id
            continue
        category_id = uuid4()
        created = ItemCategory(
            id=category_id,
            workspace_id=workspace_id,
            name=name,
            normalized_name=norm,
            description="Importación Cheko",
            category_kind="expense",
            status="active",
        )
        session.add(created)
        by_name[norm] = created
        mapping[cheko_id] = category_id
        if len(mapping) % 50 == 0:
            session.flush()
    session.flush()
    return mapping
