from datetime import date, time
from types import SimpleNamespace
from uuid import uuid7

from app.config import settings
from app.services import mailer


def test_send_appointment_email_dry_run(monkeypatch) -> None:
    monkeypatch.setattr(settings, "email_enabled", False)
    appointment = SimpleNamespace(
        id=uuid7(),
        branch_id=uuid7(),
        customer_name="Ana",
        service_name="Facial",
        scheduled_date=date(2026, 9, 12),
        scheduled_time=time(10, 0),
    )
    result = mailer.send_appointment_email(
        event="appointment.confirmed",
        to="cliente@example.com",
        appointment=appointment,
        branch_name="Norte",
        workspace_name="Charm",
        management_token="token",
    )
    assert result["sent"] is False
    assert result["mode"] == "dry-run"


def test_appointment_template_escapes_content_and_uses_public_origin(monkeypatch):
    monkeypatch.setattr(settings, "public_app_url", "https://example.workers.dev")
    appointment = SimpleNamespace(
        id=uuid7(),
        branch_id=uuid7(),
        customer_name="<script>Ana</script>",
        service_name="Facial",
        scheduled_date=date(2027, 2, 15),
        scheduled_time=time(10),
        duration_minutes=45,
    )
    content = mailer.render_appointment_email(
        event="appointment.confirmed",
        to="client@example.com",
        appointment=appointment,
        branch_name="Norte",
        workspace_name="Mi establecimiento",
        management_token="token",
        timezone="America/Santo_Domingo",
    )
    assert "<script>" not in content["html"]
    assert "&lt;script&gt;" in content["html"]
    assert 'src="https://example.workers.dev/helios-360-icon.png"' in content["html"]
    assert "#2563eb" in content["html"]
    assert "https://example.workers.dev/agendar/perfil?" in content["text"]
    assert "45 minutos" in content["text"]
    assert "Mi establecimiento" in content["text"]
    assert "America/Santo_Domingo" in content["text"]


def test_reminder_uses_explicit_date_instead_of_relative_tomorrow(monkeypatch):
    monkeypatch.setattr(settings, "public_app_url", "https://example.workers.dev")
    appointment = SimpleNamespace(
        id=uuid7(),
        branch_id=uuid7(),
        customer_name="Ana",
        service_name="Facial",
        scheduled_date=date(2026, 9, 12),
        scheduled_time=time(10),
        duration_minutes=45,
    )
    content = mailer.render_appointment_email(
        event="appointment.reminder",
        to="client@example.com",
        appointment=appointment,
        branch_name="Norte",
        workspace_name="Mi establecimiento",
        management_token="token",
    )
    assert "mañana" not in content["text"].lower()
    assert "sábado 12 de septiembre de 2026" in content["text"]
    assert "Gestionar cita" in content["html"]


def test_cancelled_email_links_to_booking_instead_of_management(monkeypatch):
    monkeypatch.setattr(settings, "public_app_url", "https://example.workers.dev")
    appointment = SimpleNamespace(
        id=uuid7(),
        branch_id=uuid7(),
        customer_name="Ana",
        service_name="Facial",
        scheduled_date=date(2026, 9, 12),
        scheduled_time=time(10),
        duration_minutes=45,
    )
    content = mailer.render_appointment_email(
        event="appointment.cancelled",
        to="client@example.com",
        appointment=appointment,
        branch_name="Norte",
        workspace_name="Mi establecimiento",
        management_token="secret-token",
    )
    assert "Agendar otra cita" in content["text"]
    assert "https://example.workers.dev/agendar?branch=" in content["text"]
    assert "/agendar/perfil" not in content["html"]
    assert "Gestionar cita" not in content["html"]


def test_booking_link_email_uses_invitation_layout_without_appointment_details(monkeypatch):
    monkeypatch.setattr(settings, "public_app_url", "https://example.workers.dev")
    branch_id = uuid7()
    content = mailer.render_booking_link_email(
        to="client@example.com",
        name="<Ana>",
        branch_name="Norte",
        workspace_name="Mi establecimiento",
        branch_id=branch_id,
    )
    assert "<Ana>" in content["text"]
    assert "<Ana>" not in content["html"]
    assert "&lt;Ana&gt;" in content["html"]
    assert "Información para agendar" in content["html"]
    assert "Agendar cita" in content["html"]
    assert f"https://example.workers.dev/agendar?branch={branch_id}" in content["text"]
    assert "Servicio" not in content["text"]
