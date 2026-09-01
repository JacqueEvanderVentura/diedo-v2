from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from uuid import UUID, uuid5

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import DemoSeedRegistry

_DEMO_NAMESPACE = UUID("0b995e4e-d36a-5a4f-82b7-84a536c9fa59")


def registered_entity[ModelT](
    session: Session,
    workspace_id: UUID,
    entity_type: str,
    seed_key: str,
    entity_id: UUID,
    payload: Mapping[str, object],
    model: type[ModelT],
) -> ModelT | None:
    registry = session.scalar(
        select(DemoSeedRegistry).where(
            DemoSeedRegistry.workspace_id == workspace_id,
            DemoSeedRegistry.entity_type == entity_type,
            DemoSeedRegistry.seed_key == seed_key,
        )
    )
    if registry is None:
        if session.get(model, entity_id) is not None:
            raise RuntimeError("A demo UUID exists without a seed registry claim.")
        return None
    if registry.entity_id != entity_id:
        raise RuntimeError("The registered demo UUID does not match the manifest identity.")
    checksum = checksum_payload(payload)
    if registry.checksum != checksum:
        registry.checksum = checksum
        registry.version += 1
    entity = session.get(model, entity_id)
    if entity is None:
        raise RuntimeError("A registered demo entity is missing.")
    return entity


def register_entity(
    session: Session,
    workspace_id: UUID,
    entity_type: str,
    seed_key: str,
    entity_id: UUID,
    seed_version: str,
    payload: Mapping[str, object],
) -> None:
    session.add(
        DemoSeedRegistry(
            workspace_id=workspace_id,
            entity_type=entity_type,
            seed_key=seed_key,
            entity_id=entity_id,
            seed_version=seed_version,
            checksum=checksum_payload(payload),
        )
    )
    session.flush()


def stable_demo_id(seed_version: str, entity_type: str, seed_key: str) -> UUID:
    return uuid5(_DEMO_NAMESPACE, f"{seed_version}:{entity_type}:{seed_key}")


def checksum_payload(payload: Mapping[str, object]) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
