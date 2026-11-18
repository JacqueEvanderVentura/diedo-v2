"""Cheko/Helios cabinas → nombres Diedo for Charm DN, SDE, SGTO."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any
from uuid import UUID, uuid7

from sqlalchemy.orm import Session

from app.db.models import AppointmentResource
from app.repositories.agenda import AgendaRepository
from app.scripts.cheko.context import CHARM_CHEKO_BRANCH_IDS, CHEKO_ROOT, load_json
from app.services.master_data import normalize_name


@dataclass(frozen=True)
class CharmCabinaDef:
    name: str
    sort_order: int
    description: str | None


@lru_cache(maxsize=1)
def load_cheko_cabina_name_by_id() -> dict[str, str]:
    path = CHEKO_ROOT / "cabinas.json"
    if not path.is_file():
        return {}
    rows: list[dict[str, Any]] = load_json(path)
    by_id: dict[str, str] = {}
    for row in rows:
        sucursal_id = str(row.get("sucursal_id") or "")
        if sucursal_id not in CHARM_CHEKO_BRANCH_IDS:
            continue
        cabina_id = str(row.get("id") or "").strip()
        nombre = str(row.get("nombre") or "").strip()
        if cabina_id and nombre:
            by_id[cabina_id] = nombre
    return by_id


@lru_cache(maxsize=1)
def load_charm_cabina_defs_by_branch() -> dict[str, tuple[CharmCabinaDef, ...]]:
    path = CHEKO_ROOT / "cabinas.json"
    if not path.is_file():
        return {}
    rows: list[dict[str, Any]] = load_json(path)
    grouped: dict[str, list[CharmCabinaDef]] = {bid: [] for bid in CHARM_CHEKO_BRANCH_IDS}
    for row in rows:
        sucursal_id = str(row.get("sucursal_id") or "")
        if sucursal_id not in CHARM_CHEKO_BRANCH_IDS:
            continue
        nombre = str(row.get("nombre") or "").strip()
        if not nombre:
            continue
        orden = row.get("orden")
        sort_order = int(orden) if orden is not None else 0
        descripcion = row.get("descripcion")
        description = str(descripcion).strip() if descripcion else None
        if description == "":
            description = None
        grouped[sucursal_id].append(
            CharmCabinaDef(name=nombre, sort_order=sort_order, description=description)
        )
    return {key: tuple(defs) for key, defs in grouped.items()}


def cheko_resource_name(cabina_id: str | None) -> str | None:
    if not cabina_id:
        return None
    return load_cheko_cabina_name_by_id().get(cabina_id.strip())


def ensure_charm_appointment_resources(
    session: Session,
    *,
    workspace_id: UUID,
    diedo_branch_id: UUID,
    cheko_branch_id: str,
) -> int:
    """Create active Charm cabinas in Diedo when missing (match by normalized name)."""
    defs = load_charm_cabina_defs_by_branch().get(cheko_branch_id, ())
    if not defs:
        return 0
    repo = AgendaRepository(session)
    existing = [
        resource
        for resource in repo.list_resources(
            workspace_id=workspace_id,
            branch_id=diedo_branch_id,
        )
        if resource.status == "active"
    ]
    by_name = {normalize_name(resource.name): resource for resource in existing}
    created = 0
    for defn in defs:
        key = normalize_name(defn.name)
        if key in by_name:
            continue
        resource = AppointmentResource(
            workspace_id=workspace_id,
            branch_id=diedo_branch_id,
            code=f"cab-{uuid7().hex}",
            name=defn.name,
            description=defn.description,
            resource_type="room",
            status="active",
            sort_order=defn.sort_order,
        )
        repo.add_resource(resource)
        by_name[key] = resource
        created += 1
    if created:
        session.flush()
    return created
