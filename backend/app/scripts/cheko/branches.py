"""Map Cheko sucursal IDs to Diedo branch UUIDs by name."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.foundation import Branch
from app.scripts.cheko.context import CHARM_CHEKO_BRANCH_IDS, ChekoContext, cheko_branch_name

# Nombres esperados en Diedo (aprox.) por sucursal Cheko.
CHEKO_TO_DIEDO_NAME_HINTS: dict[str, tuple[str, ...]] = {
    "0b3aade5-86c9-52a5-84d1-619d417c427c": ("charm dn", "charm dn ", "main"),
    "1973ca3c-2bb4-551e-b6ec-2ec594a9b7f6": ("charm sde", "sde", "este"),
    "63278b45-21ee-50ff-8a2f-2dc6e6787747": (
        "charm stgo",
        "charm sgto",
        "charm santiago",
        "santiago",
    ),
}


def _normalize(value: str) -> str:
    return value.casefold().strip()


def resolve_charm_branch_map(
    session: Session,
    workspace_id: UUID,
    ctx: ChekoContext,
) -> dict[str, UUID]:
    rows = session.scalars(
        select(Branch).where(
            Branch.workspace_id == workspace_id,
            Branch.status == "active",
        )
    ).all()
    by_normalized: dict[str, UUID] = {_normalize(b.name): b.id for b in rows}

    mapping: dict[str, UUID] = {}
    for cheko_id in CHARM_CHEKO_BRANCH_IDS:
        hints = CHEKO_TO_DIEDO_NAME_HINTS.get(cheko_id, ())
        matched: UUID | None = None
        for hint in hints:
            if hint in by_normalized:
                matched = by_normalized[hint]
                break
        if matched is None:
            cheko_name = _normalize(cheko_branch_name(cheko_id, ctx))
            for branch_name, branch_id in by_normalized.items():
                if cheko_name and (cheko_name in branch_name or branch_name in cheko_name):
                    matched = branch_id
                    break
        if matched is None:
            raise RuntimeError(
                f"No se encontró sucursal Diedo para Cheko {cheko_id} "
                f"({cheko_branch_name(cheko_id, ctx)})"
            )
        mapping[cheko_id] = matched
    return mapping
