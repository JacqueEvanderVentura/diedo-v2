from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from html import escape
from typing import Any
from urllib.parse import urlencode

from app.config import settings
from app.db.models import Appointment
from app.services.email import EmailServiceError, send_email

logger = logging.getLogger(__name__)

_BRAND_BLUE = "#2563eb"
_BRAND_BLUE_DARK = "#1d4ed8"
_BRAND_BLUE_SOFT = "#eff6ff"
_BORDER = "#e2e8f0"
_TEXT = "#0f172a"
_TEXT_MUTED = "#64748b"
_SURFACE = "#ffffff"
_PAGE_BG = "#f8fafc"

_MONTHS_ES = (
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)

_WEEKDAYS_ES = (
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
    "domingo",
)


@dataclass(frozen=True)
class AppointmentEmailTemplate:
    subject: str
    headline: str
    intro: str
    status_label: str
    status_bg: str
    status_color: str
    action_label: str
    action_url_key: str


_TEMPLATES: dict[str, AppointmentEmailTemplate] = {
    "appointment.confirmed": AppointmentEmailTemplate(
        subject="Tu cita ha sido confirmada",
        headline="Tu cita está confirmada",
        intro=(
            "Tu cita para {service_name} quedó confirmada para el {date_label} a las {time_label}."
        ),
        status_label="Confirmada",
        status_bg="#d1fae5",
        status_color="#047857",
        action_label="Gestionar cita",
        action_url_key="manage_url",
    ),
    "appointment.reminder": AppointmentEmailTemplate(
        subject="Recordatorio de tu cita",
        headline="Tu cita se acerca",
        intro=(
            "Te recordamos que tienes una cita para {service_name} el {date_label} "
            "a las {time_label}."
        ),
        status_label="Recordatorio",
        status_bg="#fef3c7",
        status_color="#b45309",
        action_label="Gestionar cita",
        action_url_key="manage_url",
    ),
    "appointment.cancelled": AppointmentEmailTemplate(
        subject="Tu cita fue cancelada",
        headline="Tu cita fue cancelada",
        intro=(
            "Tu cita para {service_name} del {date_label} a las {time_label} "
            "fue cancelada. Puedes agendar otra cita desde el enlace de abajo."
        ),
        status_label="Cancelada",
        status_bg="#fee2e2",
        status_color="#b91c1c",
        action_label="Agendar otra cita",
        action_url_key="booking_url",
    ),
    "appointment.rescheduled": AppointmentEmailTemplate(
        subject="Tu cita fue reagendada",
        headline="Tu cita fue reagendada",
        intro=(
            "Tu cita para {service_name} quedó reagendada para el {date_label} a las {time_label}."
        ),
        status_label="Reagendada",
        status_bg=_BRAND_BLUE_SOFT,
        status_color=_BRAND_BLUE_DARK,
        action_label="Gestionar cita",
        action_url_key="manage_url",
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


def _booking_link_url(branch_id: object) -> str:
    base = settings.public_app_url.rstrip("/")
    return f"{base}/agendar?{urlencode({'branch': str(branch_id)})}"


def _brand_logo_url() -> str:
    return f"{settings.public_app_url.rstrip('/')}/helios-360-icon.png"


def _format_date_es(value: date) -> str:
    weekday = _WEEKDAYS_ES[value.weekday()]
    month = _MONTHS_ES[value.month - 1]
    return f"{weekday} {value.day} de {month} de {value.year}"


def _html(value: object) -> str:
    return escape(str(value), quote=True)


def _detail_row(label: str, value: object) -> str:
    return f"""
                    <tr>
                      <td style="padding:12px 0;border-bottom:1px solid {_BORDER};
                        color:{_TEXT_MUTED};font-size:13px;line-height:20px;">
                        {_html(label)}
                      </td>
                      <td align="right" style="padding:12px 0;border-bottom:1px solid {_BORDER};
                        color:{_TEXT};font-size:14px;font-weight:600;line-height:20px;">
                        {_html(value)}
                      </td>
                    </tr>"""


def _render_html_email(
    *,
    preheader: str,
    headline: str,
    intro: str,
    customer_name: str,
    status_label: str,
    status_bg: str,
    status_color: str,
    action_label: str,
    action_url: str,
    detail_heading: str,
    details: list[tuple[str, object]],
    workspace_name: str,
    branch_name: str,
) -> str:
    detail_rows = "".join(_detail_row(label, value) for label, value in details)
    logo_url = _brand_logo_url()
    footer_context = f"{workspace_name} · {branch_name}"
    return f"""<!doctype html>
<html lang="es">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{_html(headline)}</title>
  </head>
  <body style="margin:0;padding:0;background:{_PAGE_BG};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      {_html(preheader)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
      style="background:{_PAGE_BG};border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
            style="width:100%;max-width:600px;background:{_SURFACE};border:1px solid {_BORDER};
              border-radius:18px;overflow:hidden;border-collapse:separate;">
            <tr>
              <td style="padding:24px 28px 18px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="{_html(logo_url)}" width="40" height="40" alt="Helios 360"
                        style="display:inline-block;border:0;vertical-align:middle;
                        border-radius:10px;" />
                      <span style="display:inline-block;margin-left:12px;vertical-align:middle;
                        color:{_TEXT};font-family:Inter,Arial,sans-serif;font-size:18px;
                        font-weight:700;line-height:24px;">
                        Helios 360
                      </span>
                    </td>
                    <td align="right" style="vertical-align:middle;">
                      <span style="display:inline-block;padding:6px 10px;border-radius:999px;
                        background:{status_bg};color:{status_color};font-family:Inter,Arial,sans-serif;
                        font-size:12px;font-weight:700;line-height:16px;">
                        {_html(status_label)}
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                  style="background:{_BRAND_BLUE};border-radius:16px;border-collapse:separate;">
                  <tr>
                    <td style="padding:28px;">
                      <div style="color:#dbeafe;font-family:Inter,Arial,sans-serif;font-size:13px;
                        font-weight:700;letter-spacing:0;text-transform:uppercase;line-height:18px;">
                        Agenda en línea
                      </div>
                      <h1 style="margin:10px 0 0;color:#ffffff;font-family:Inter,Arial,sans-serif;
                        font-size:28px;font-weight:800;line-height:34px;">
                        {_html(headline)}
                      </h1>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 8px;font-family:Inter,Arial,sans-serif;">
                <p style="margin:0 0 12px;color:{_TEXT};font-size:16px;line-height:24px;">
                  Hola {_html(customer_name)},
                </p>
                <p style="margin:0;color:{_TEXT_MUTED};font-size:15px;line-height:24px;">
                  {_html(intro)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                  style="background:#f8fafc;border:1px solid {_BORDER};border-radius:14px;
                    border-collapse:separate;font-family:Inter,Arial,sans-serif;">
                  <tr>
                    <td style="padding:18px 20px 4px;">
                      <div style="color:{_TEXT};font-size:16px;font-weight:800;line-height:22px;">
                        {_html(detail_heading)}
                      </div>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                        style="border-collapse:collapse;">
                        {detail_rows}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 28px 26px;font-family:Inter,Arial,sans-serif;">
                <a href="{_html(action_url)}"
                  style="display:inline-block;background:{_BRAND_BLUE};color:#ffffff;text-decoration:none;
                    border-radius:12px;padding:14px 22px;font-size:15px;font-weight:800;
                    line-height:20px;">
                  {_html(action_label)}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 26px;background:#f8fafc;border-top:1px solid {_BORDER};
                font-family:Inter,Arial,sans-serif;">
                <p style="margin:0 0 8px;color:{_TEXT};font-size:13px;font-weight:700;
                  line-height:20px;">
                  {_html(footer_context)}
                </p>
                <p style="margin:0;color:{_TEXT_MUTED};font-size:12px;line-height:19px;">
                  Enviado por Helios 360. Si el botón no abre, usa este enlace:
                  <a href="{_html(action_url)}" style="color:{_BRAND_BLUE_DARK};
                    text-decoration:underline;">
                    {_html(action_url)}
                  </a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def _plain_text_email(
    *,
    customer_name: str,
    intro: str,
    action_label: str,
    action_url: str,
    detail_heading: str,
    details: list[tuple[str, object]],
    workspace_name: str,
    branch_name: str,
) -> str:
    lines = [
        f"Hola {customer_name},",
        "",
        intro,
        "",
        f"{detail_heading}:",
    ]
    lines.extend(f"{label}: {value}" for label, value in details)
    lines.extend(
        [
            "",
            f"{action_label}: {action_url}",
            "",
            f"{workspace_name} | {branch_name}",
            "Enviado por Helios 360.",
        ]
    )
    return "\n".join(lines) + "\n"


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
    template = _TEMPLATES[event]
    date_label = _format_date_es(appointment.scheduled_date)
    time_label = appointment.scheduled_time.strftime("%H:%M")
    context = {
        "customer_name": appointment.customer_name,
        "service_name": appointment.service_name,
        "date_label": date_label,
        "time_label": time_label,
        "branch_name": branch_name,
        "workspace_name": workspace_name,
        "manage_url": _profile_url(appointment, management_token),
        "booking_url": _booking_url(appointment),
    }
    intro = template.intro.format(**context)
    details: list[tuple[str, object]] = [
        ("Servicio", appointment.service_name),
        ("Fecha", date_label),
        ("Hora", f"{time_label} h"),
        ("Duración", f"{appointment.duration_minutes} minutos"),
        ("Establecimiento", workspace_name),
        ("Sucursal", branch_name),
    ]
    if timezone:
        details.append(("Zona horaria", f"Hora del establecimiento ({timezone})"))
    action_url = context[template.action_url_key]
    text = _plain_text_email(
        customer_name=appointment.customer_name,
        intro=intro,
        action_label=template.action_label,
        action_url=action_url,
        detail_heading="Detalles de la cita",
        details=details,
        workspace_name=workspace_name,
        branch_name=branch_name,
    )
    html = _render_html_email(
        preheader=intro,
        headline=template.headline,
        intro=intro,
        customer_name=appointment.customer_name,
        status_label=template.status_label,
        status_bg=template.status_bg,
        status_color=template.status_color,
        action_label=template.action_label,
        action_url=action_url,
        detail_heading="Detalles de la cita",
        details=details,
        workspace_name=workspace_name,
        branch_name=branch_name,
    )
    return {
        "to": to,
        "subject": f"{template.subject} — {workspace_name}",
        "html": html,
        "text": text,
    }


def render_booking_link_email(
    *, to: str, name: str, branch_name: str, workspace_name: str, branch_id: object
) -> dict[str, str]:
    url = _booking_link_url(branch_id)
    intro = "Puedes elegir el horario que mejor te funcione para agendar tu cita en línea."
    details: list[tuple[str, object]] = [
        ("Establecimiento", workspace_name),
        ("Sucursal", branch_name),
    ]
    text = _plain_text_email(
        customer_name=name,
        intro=intro,
        action_label="Agendar cita",
        action_url=url,
        detail_heading="Información para agendar",
        details=details,
        workspace_name=workspace_name,
        branch_name=branch_name,
    )
    html = _render_html_email(
        preheader=f"Agenda tu cita en {workspace_name}.",
        headline="Agenda tu cita en línea",
        intro=intro,
        customer_name=name,
        status_label="Invitación",
        status_bg=_BRAND_BLUE_SOFT,
        status_color=_BRAND_BLUE_DARK,
        action_label="Agendar cita",
        action_url=url,
        detail_heading="Información para agendar",
        details=details,
        workspace_name=workspace_name,
        branch_name=branch_name,
    )
    return {
        "to": to,
        "subject": f"Agenda tu cita — {workspace_name}",
        "text": text,
        "html": html,
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
