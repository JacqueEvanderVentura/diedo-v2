from __future__ import annotations

import logging
from html import escape
from typing import Any
from urllib.parse import urlencode

from app.config import settings
from app.db.models import Appointment

logger = logging.getLogger(__name__)

_TEMPLATES: dict[str, tuple[str, str]] = {
    "appointment.confirmed": (
        "Tu cita ha sido confirmada",
        "Hola {customer_name},\n\nTu cita para {service_name} el {date} a las {time} "
        "en {branch_name} fue confirmada.\n\nGestiona tu cita: {manage_url}\n",
    ),
    "appointment.reminder": (
        "Recordatorio de tu cita",
        "Hola {customer_name},\n\nTe recordamos tu cita para {service_name} mañana "
        "({date} a las {time}) en {branch_name}.\n\nGestiona tu cita: {manage_url}\n",
    ),
    "appointment.cancelled": (
        "Tu cita fue cancelada",
        "Hola {customer_name},\n\nTu cita para {service_name} el {date} a las {time} "
        "en {branch_name} fue cancelada.\n\nAgenda otra cita: {booking_url}\n",
    ),
    "appointment.rescheduled": (
        "Tu cita fue reagendada",
        "Hola {customer_name},\n\nTu cita para {service_name} quedó para el {date} "
        "a las {time} en {branch_name}.\n\nGestiona tu cita: {manage_url}\n",
    ),
}


def _profile_url(appointment: Appointment, management_token: str) -> str:
    base = settings.public_app_url.rstrip("/")
    query = urlencode(
        {
            "branch": str(appointment.branch_id),
            "appointment": str(appointment.id),
            "token": management_token,
        }
    )
    return f"{base}/agendar/perfil?{query}"


def _booking_url(appointment: Appointment) -> str:
    base = settings.public_app_url.rstrip("/")
    return f"{base}/agendar?branch={appointment.branch_id}"


def send_appointment_email(
    *,
    event: str,
    to: str,
    appointment: Appointment,
    branch_name: str,
    workspace_name: str,
    management_token: str,
) -> dict[str, Any]:
    if not settings.mail_enabled or not to:
        return {"sent": False, "mode": "dry-run", "event": event}
    subject_template, text_template = _TEMPLATES[event]
    context = {
        "customer_name": appointment.customer_name,
        "service_name": appointment.service_name,
        "date": appointment.scheduled_date.isoformat(),
        "time": appointment.scheduled_time.strftime("%H:%M"),
        "branch_name": branch_name,
        "workspace_name": workspace_name,
        "manage_url": _profile_url(appointment, management_token),
        "booking_url": _booking_url(appointment),
    }
    subject = subject_template.format(**context)
    text = text_template.format(**context)
    html = (
        f"<p>{escape(text).replace(chr(10), '<br/>')}</p>"
        f'<p><a href="{escape(context["manage_url"])}">Gestionar cita</a></p>'
    )
    try:
        import resend
    except ModuleNotFoundError:
        logger.warning("Paquete resend no instalado; ejecuta pip install -r requirements.txt")
        return {"sent": False, "mode": "missing-resend-package", "event": event}
    api_key = settings.resend_api_key.get_secret_value() if settings.resend_api_key else ""
    if not api_key:
        logger.warning("RESEND_API_KEY ausente; omitiendo envío.")
        return {"sent": False, "mode": "missing-api-key", "event": event}
    resend.api_key = api_key
    payload: dict[str, Any] = {
        "from": settings.mail_from,
        "to": [to],
        "subject": subject,
        "html": html,
        "text": text,
    }
    if settings.mail_reply_to:
        payload["reply_to"] = settings.mail_reply_to
    response = resend.Emails.send(payload)  # type: ignore[arg-type]
    return {"sent": True, "mode": "resend", "event": event, "id": response.get("id")}
