"""CRM pipeline report: origin mix, win/loss by channel, stage dwell from move activities."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from statistics import median
from typing import Any
from uuid import UUID

from app.db.models import CrmActivity, CrmLead

_LEAD_STAGE_LABELS: dict[str, str] = {
    "nuevo": "Nuevo",
    "contactado": "Contactado",
    "propuesta": "Interesado",
    "negociacion": "Seguimiento",
    "cerrado": "Ganado",
    "perdido": "Perdido",
}

_LABEL_TO_STAGE: dict[str, str] = {label: code for code, label in _LEAD_STAGE_LABELS.items()}

_DWELL_STAGES: tuple[str, ...] = ("nuevo", "contactado", "propuesta", "negociacion")
_TERMINAL_STATUSES = frozenset({"cerrado", "perdido"})
_OPEN_STATUSES = frozenset({"nuevo", "contactado", "propuesta", "negociacion"})

_ACQUISITION_LABELS: dict[str, str] = {
    "whatsapp": "WhatsApp",
    "instagram": "Instagram",
    "ai": "AI",
    "app": "App Helios 360",
    "referral": "Referido",
    "otros": "Otros",
    "pos_walk_in": "Mostrador / POS",
    "unknown": "Sin origen",
}

_DISCOVERY_SOURCES = frozenset({"serp", "serper"})


@dataclass(frozen=True)
class StageMoveEvent:
    lead_id: UUID
    from_stage: str
    to_stage: str
    occurred_at: datetime


def effective_acquisition_source(lead: CrmLead) -> str:
    if lead.acquisition_source:
        return lead.acquisition_source
    if lead.source in _DISCOVERY_SOURCES:
        return "ai"
    return "unknown"


def parse_stage_move_title(title: str | None) -> tuple[str, str] | None:
    if not title or not title.startswith("Movido de "):
        return None
    rest = title[len("Movido de ") :]
    if " a " not in rest:
        return None
    from_label, to_label = rest.split(" a ", 1)
    from_stage = _LABEL_TO_STAGE.get(from_label.strip())
    to_stage = _LABEL_TO_STAGE.get(to_label.strip())
    if not from_stage or not to_stage:
        return None
    return from_stage, to_stage


def stage_moves_from_activities(activities: tuple[CrmActivity, ...]) -> list[StageMoveEvent]:
    events: list[StageMoveEvent] = []
    for activity in activities:
        if activity.lead_id is None or activity.activity_type != "nota":
            continue
        parsed = parse_stage_move_title(activity.title)
        if parsed is None:
            continue
        from_stage, to_stage = parsed
        occurred = activity.completed_at or activity.created_at
        if occurred.tzinfo is None:
            occurred = occurred.replace(tzinfo=UTC)
        events.append(
            StageMoveEvent(
                lead_id=activity.lead_id,
                from_stage=from_stage,
                to_stage=to_stage,
                occurred_at=occurred.astimezone(UTC),
            )
        )
    events.sort(key=lambda item: (item.lead_id, item.occurred_at))
    return events


def _lead_created_at(lead: CrmLead) -> datetime:
    created = lead.created_at
    if created.tzinfo is None:
        return created.replace(tzinfo=UTC)
    return created.astimezone(UTC)


def compute_dwell_hours_by_stage(
    leads: tuple[CrmLead, ...],
    moves: list[StageMoveEvent],
) -> dict[str, list[float]]:
    moves_by_lead: dict[UUID, list[StageMoveEvent]] = defaultdict(list)
    for move in moves:
        moves_by_lead[move.lead_id].append(move)

    dwell_samples: dict[str, list[float]] = defaultdict(list)
    lead_ids = {lead.id for lead in leads}

    for lead_id in lead_ids:
        lead_moves = moves_by_lead.get(lead_id, [])
        if not lead_moves:
            continue
        lead = next(item for item in leads if item.id == lead_id)
        created = _lead_created_at(lead)
        previous_at = created
        for move in lead_moves:
            if move.from_stage in _DWELL_STAGES:
                hours = (move.occurred_at - previous_at).total_seconds() / 3600.0
                if hours >= 0:
                    dwell_samples[move.from_stage].append(hours)
            previous_at = move.occurred_at

    return dwell_samples


def compute_dwell_by_origin(
    leads: tuple[CrmLead, ...],
    moves: list[StageMoveEvent],
    *,
    stages: tuple[str, ...] = ("nuevo", "contactado"),
) -> dict[str, dict[str, list[float]]]:
    lead_by_id = {lead.id: lead for lead in leads}
    moves_by_lead: dict[UUID, list[StageMoveEvent]] = defaultdict(list)
    for move in moves:
        moves_by_lead[move.lead_id].append(move)

    samples: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))

    for lead_id, lead_moves in moves_by_lead.items():
        if not lead_moves:
            continue
        lead = lead_by_id.get(lead_id)
        if lead is None:
            continue
        origin = effective_acquisition_source(lead)
        created = _lead_created_at(lead)
        previous_at = created
        for move in lead_moves:
            if move.from_stage in stages:
                hours = (move.occurred_at - previous_at).total_seconds() / 3600.0
                if hours >= 0:
                    samples[origin][move.from_stage].append(hours)
            previous_at = move.occurred_at

    return samples


def _hours_stats(values: list[float]) -> dict[str, Any]:
    if not values:
        return {"sample_count": 0, "avg_hours": None, "median_hours": None}
    return {
        "sample_count": len(values),
        "avg_hours": sum(values) / len(values),
        "median_hours": float(median(values)),
    }


def build_pipeline_report_payload(
    leads: tuple[CrmLead, ...],
    activities: tuple[CrmActivity, ...],
) -> dict[str, Any]:
    total = len(leads)
    with_origin = sum(1 for lead in leads if effective_acquisition_source(lead) != "unknown")

    won = sum(1 for lead in leads if lead.status == "cerrado")
    lost = sum(1 for lead in leads if lead.status == "perdido")
    closed = won + lost
    loss_rate = (lost / closed) if closed else None
    win_rate = (won / closed) if closed else None

    open_leads = [lead for lead in leads if lead.status in _OPEN_STATUSES]
    open_count = len(open_leads)
    open_value = sum((lead.pipeline_value or Decimal("0")) for lead in open_leads)

    by_stage: dict[str, int] = defaultdict(int)
    for lead in leads:
        by_stage[lead.status] += 1

    origin_buckets: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "count": 0,
            "won": 0,
            "lost": 0,
            "open": 0,
            "won_value": Decimal("0"),
            "lost_value": Decimal("0"),
        }
    )
    for lead in leads:
        origin = effective_acquisition_source(lead)
        bucket = origin_buckets[origin]
        bucket["count"] += 1
        if lead.status == "cerrado":
            bucket["won"] += 1
            bucket["won_value"] += lead.pipeline_value or Decimal("0")
        elif lead.status == "perdido":
            bucket["lost"] += 1
            bucket["lost_value"] += lead.pipeline_value or Decimal("0")
        elif lead.status in _OPEN_STATUSES:
            bucket["open"] += 1

    by_origin: list[dict[str, Any]] = []

    def _origin_sort_key(item: tuple[str, dict[str, Any]]) -> tuple[int, str]:
        return (-item[1]["count"], item[0])

    for origin_id, bucket in sorted(origin_buckets.items(), key=_origin_sort_key):
        closed_origin = bucket["won"] + bucket["lost"]
        by_origin.append(
            {
                "id": origin_id,
                "label": _ACQUISITION_LABELS.get(origin_id, origin_id),
                "count": bucket["count"],
                "share_pct": (bucket["count"] / total) if total else Decimal("0"),
                "won": bucket["won"],
                "lost": bucket["lost"],
                "open": bucket["open"],
                "win_rate": (bucket["won"] / closed_origin) if closed_origin else None,
                "loss_rate": (bucket["lost"] / closed_origin) if closed_origin else None,
                "avg_won_value": (bucket["won_value"] / bucket["won"] if bucket["won"] else None),
                "avg_lost_value": (
                    bucket["lost_value"] / bucket["lost"] if bucket["lost"] else None
                ),
            }
        )

    moves = stage_moves_from_activities(activities)
    dwell_samples = compute_dwell_hours_by_stage(leads, moves)
    stage_dwell = []
    for stage in _DWELL_STAGES:
        stats = _hours_stats(dwell_samples.get(stage, []))
        stage_dwell.append(
            {
                "stage": stage,
                "label": _LEAD_STAGE_LABELS[stage],
                **stats,
            }
        )

    dwell_by_origin_raw = compute_dwell_by_origin(leads, moves)
    stage_dwell_by_origin: list[dict[str, Any]] = []
    for origin_id in sorted(dwell_by_origin_raw.keys()):
        stage_stats: dict[str, Any] = {}
        for stage in ("nuevo", "contactado"):
            stats = _hours_stats(dwell_by_origin_raw[origin_id].get(stage, []))
            stage_stats[stage] = stats
        stage_dwell_by_origin.append(
            {
                "id": origin_id,
                "label": _ACQUISITION_LABELS.get(origin_id, origin_id),
                "nuevo": stage_stats["nuevo"],
                "contactado": stage_stats["contactado"],
            }
        )

    lost_reason_counts: dict[str, int] = defaultdict(int)
    for lead in leads:
        if lead.status == "perdido" and lead.lost_reason:
            reason = " ".join(lead.lost_reason.split())
            lost_reason_counts[reason] += 1
    lost_reasons = [
        {"reason": reason, "count": count}
        for reason, count in sorted(
            lost_reason_counts.items(), key=lambda item: (-item[1], item[0].casefold())
        )[:12]
    ]

    stage_snapshot = [
        {
            "stage": stage,
            "label": _LEAD_STAGE_LABELS.get(stage, stage),
            "count": by_stage.get(stage, 0),
        }
        for stage in ("nuevo", "contactado", "propuesta", "negociacion", "cerrado", "perdido")
    ]

    return {
        "total_leads": total,
        "with_origin_count": with_origin,
        "with_origin_pct": (with_origin / total) if total else Decimal("0"),
        "won_count": won,
        "lost_count": lost,
        "loss_rate": loss_rate,
        "win_rate": win_rate,
        "open_pipeline_count": open_count,
        "open_pipeline_value": open_value,
        "by_origin": by_origin,
        "by_stage": stage_snapshot,
        "stage_dwell": stage_dwell,
        "stage_dwell_by_origin": stage_dwell_by_origin,
        "lost_reasons": lost_reasons,
    }
