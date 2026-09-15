from __future__ import annotations

import logging
from html import escape
from typing import Any
from urllib.parse import urlencode

from app.config import settings
from app.db.models import Appointment
from app.services.email import EmailServiceError, send_email

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


def render_appointment_email(
    *,
    event: str,
    to: str,
    appointment: Appointment,
    branch_name: str,
    workspace_name: str,
    management_token: str,
    timezone: str | None = None,
) -> dict[str, Any]:
    subject_template, text_template = _TEMPLATES[event]
    context = {
        "customer_name": appointment.customer_name,
        "service_name": appointment.service_name,
        "date": appointment.scheduled_date.isoformat(),
        "time": appointment.scheduled_time.strftime("%H:%M"),
        "branch_name": f"{branch_name}, {workspace_name}",
        "workspace_name": workspace_name,
        "manage_url": _profile_url(appointment, management_token),
        "booking_url": _booking_url(appointment),
    }
    subject = subject_template.format(**context)
    text = text_template.format(**context)
    text += f"\nDuración: {appointment.duration_minutes} minutos.\n"
    if timezone:
        text += f"Hora del establecimiento ({timezone}).\n"
    html = (
        f"<p>{escape(text).replace(chr(10), '<br/>')}</p>"
        f'<p><a href="{escape(context["manage_url"])}">Gestionar cita</a></p>'
    )
    return {"to": to, "subject": f"{subject} — {workspace_name}", "html": html, "text": text}


def render_booking_link_email(
    *, to: str, name: str, branch_name: str, workspace_name: str, branch_id: object
) -> dict[str, str]:
    url = f"{settings.public_app_url.rstrip('/')}/agendar?{urlencode({'branch': str(branch_id)})}"
    text = f"Hola {name},\n\nAgenda tu cita en {branch_name}, {workspace_name}:\n{url}\n"
    return {
        "to": to,
        "subject": f"Agenda tu cita — {workspace_name}",
        "text": text,
        "html": f"<p>{escape(text).replace(chr(10), '<br/>')}</p>"
        f'<p><a href="{escape(url)}">Agendar cita</a></p>',
    }


def send_appointment_email(
    *,
    event: str,
    to: str,
    appointment: Appointment,
    branch_name: str,
    workspace_name: str,
    management_token: str,
) -> dict[str, Any]:
    """Compatibility entrypoint for the existing, unscheduled reminder command."""
    if not settings.email_enabled or not to:
        return {"sent": False, "mode": "dry-run", "event": event}
    content = render_appointment_email(
        event=event,
        to=to,
        appointment=appointment,
        branch_name=branch_name,
        workspace_name=workspace_name,
        management_token=management_token,
    )
    try:
        result = send_email(
            **content, idempotency_key=f"{event}/{appointment.id}/{appointment.version}"
        )
        return {"sent": True, "mode": "resend", "event": event, "id": result.provider_id}
    except EmailServiceError:
        return {"sent": False, "mode": "failed", "event": event}
