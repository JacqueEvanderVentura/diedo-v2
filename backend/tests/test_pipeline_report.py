from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid7

from app.db.models import CrmActivity, CrmLead
from app.services.pipeline_report import (
    build_pipeline_report_payload,
    compute_dwell_hours_by_stage,
    effective_acquisition_source,
    parse_stage_move_title,
    stage_moves_from_activities,
)


def _lead(
    *,
    status: str = "nuevo",
    acquisition_source: str | None = "whatsapp",
    source: str = "manual",
    created_at: datetime | None = None,
) -> CrmLead:
    lead = CrmLead(
        id=uuid7(),
        workspace_id=uuid7(),
        branch_id=uuid7(),
        assigned_membership_id=uuid7(),
        name="Lead",
        company="",
        source=source,
        acquisition_source=acquisition_source,
        status=status,
        pipeline_value=Decimal("1000"),
        creation_idempotency_key="idem-key-12345678",
        request_fingerprint="a" * 64,
    )
    lead.created_at = created_at or datetime(2026, 9, 1, 12, 0, tzinfo=UTC)
    return lead


def _move_activity(
    lead: CrmLead,
    title: str,
    completed_at: datetime,
) -> CrmActivity:
    return CrmActivity(
        id=uuid7(),
        workspace_id=lead.workspace_id,
        branch_id=lead.branch_id,
        lead_id=lead.id,
        assigned_membership_id=lead.assigned_membership_id,
        activity_type="nota",
        title=title,
        customer_name=lead.name,
        completed_at=completed_at,
        creation_idempotency_key="act-key-12345678",
        request_fingerprint="b" * 64,
    )


def test_parse_stage_move_title() -> None:
    assert parse_stage_move_title("Movido de Nuevo a Contactado") == ("nuevo", "contactado")
    assert parse_stage_move_title("Movido de Interesado a Seguimiento") == (
        "propuesta",
        "negociacion",
    )
    assert parse_stage_move_title("Nota") is None


def test_effective_acquisition_source_discovery() -> None:
    lead = _lead(acquisition_source=None, source="serper")
    assert effective_acquisition_source(lead) == "ai"


def test_dwell_requires_stage_moves() -> None:
    lead = _lead()
    moves = stage_moves_from_activities(
        (
            _move_activity(
                lead,
                "Movido de Nuevo a Contactado",
                lead.created_at + timedelta(hours=24),
            ),
        )
    )
    samples = compute_dwell_hours_by_stage((lead,), moves)
    assert samples["nuevo"] == [24.0]

    payload = build_pipeline_report_payload((lead,), ())
    assert payload["stage_dwell"][0]["sample_count"] == 0
    assert payload["stage_dwell"][0]["avg_hours"] is None


def test_by_origin_separates_channels() -> None:
    wa = _lead(acquisition_source="whatsapp", status="perdido")
    wa.lost_reason = "Precio"
    ig = _lead(acquisition_source="instagram", status="cerrado")
    ai = _lead(acquisition_source="ai", status="perdido")
    ai.lost_reason = "Sin respuesta"

    payload = build_pipeline_report_payload((wa, ig, ai), ())
    origins = {row["id"]: row for row in payload["by_origin"]}
    assert set(origins) == {"whatsapp", "instagram", "ai"}
    assert origins["whatsapp"]["lost"] == 1
    assert origins["instagram"]["won"] == 1
    assert origins["ai"]["loss_rate"] == 1.0
