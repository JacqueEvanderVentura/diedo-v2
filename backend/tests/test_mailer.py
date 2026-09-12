from datetime import date, time
from types import SimpleNamespace
from uuid import uuid7

from app.config import settings
from app.services import mailer


def test_send_appointment_email_dry_run(monkeypatch) -> None:
    monkeypatch.setattr(settings, "mail_enabled", False)
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
