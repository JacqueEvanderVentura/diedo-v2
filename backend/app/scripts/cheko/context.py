"""Load Cheko context files (sucursales, categorías)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[4]
CHEKO_ROOT = _REPO_ROOT / "cheko-massive-import"

# Cheko sucursales usadas en exports de agenda/finanzas Charm.
CHARM_CHEKO_BRANCH_IDS = frozenset(
    {
        "0b3aade5-86c9-52a5-84d1-619d417c427c",  # Charm DN
        "1973ca3c-2bb4-551e-b6ec-2ec594a9b7f6",  # Charm SDE
        "63278b45-21ee-50ff-8a2f-2dc6e6787747",  # Charm SGTO
    }
)

FOLDER_TO_CHEKO_BRANCH = {
    "charm-dn": "0b3aade5-86c9-52a5-84d1-619d417c427c",
    "charm-sde": "1973ca3c-2bb4-551e-b6ec-2ec594a9b7f6",
    "charm-stgo": "63278b45-21ee-50ff-8a2f-2dc6e6787747",
}

AGENDA_FILES = {
    "charm-dn": CHEKO_ROOT / "agenda" / "charm-dn.json",
    "charm-sde": CHEKO_ROOT / "agenda" / "charm-sde.json",
    "charm-stgo": CHEKO_ROOT / "agenda" / "charm-stgo.json",
}

# Batches adicionales (export manual / delta) → agenda-{clave}.csv en out/
EXTRA_AGENDA_EXPORTS: dict[str, Path] = {
    "sde-update": CHEKO_ROOT / "agenda" / "sde-update.json",
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


@dataclass(frozen=True)
class ChekoContext:
    sucursales: list[dict[str, Any]]
    categories: list[dict[str, Any]]
    sucursal_by_id: dict[str, dict[str, Any]]
    category_by_id: dict[str, dict[str, Any]]


def load_cheko_context() -> ChekoContext:
    sucursales = load_json(CHEKO_ROOT / "finanzas" / "sucursales.json")
    categories = load_json(CHEKO_ROOT / "finanzas" / "categories.json")
    return ChekoContext(
        sucursales=sucursales,
        categories=categories,
        sucursal_by_id={str(row["id"]): row for row in sucursales},
        category_by_id={str(row["id"]): row for row in categories},
    )


def cheko_branch_name(cheko_branch_id: str, ctx: ChekoContext) -> str:
    row = ctx.sucursal_by_id.get(cheko_branch_id)
    nombre = (row or {}).get("nombre")
    return str(nombre or "").strip()
