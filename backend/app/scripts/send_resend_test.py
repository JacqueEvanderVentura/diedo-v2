from __future__ import annotations

import argparse
import json

from app.config import settings
from app.services.email import (
    EmailDeliveryResult,
    EmailServiceError,
    send_email,
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send one resumable Resend test email.")
    parser.add_argument("--to", required=True, help="Destination email address for the test.")
    parser.add_argument(
        "--subject",
        default="Prueba de envío desde API de prueba",
        help="Subject used for the test message.",
    )
    parser.add_argument(
        "--idempotency-key",
        default=None,
        help="Optional idempotency key to avoid duplicate sends.",
    )
    parser.add_argument(
        "--text",
        default="Mensaje de prueba del script administrativo de correo."
    )
    parser.add_argument(
        "--html",
        default="<p>Mensaje de prueba del script administrativo de correo.</p>",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    try:
        result: EmailDeliveryResult = send_email(
            to=args.to,
            subject=args.subject,
            html=args.html,
            text=args.text,
            idempotency_key=args.idempotency_key,
            config=settings,
            force_send=True,
        )
    except EmailServiceError as exc:
        payload = {
            "status": "failed",
            "error": "email_send_failed",
            "message": str(exc),
        }
        print(json.dumps(payload, ensure_ascii=False))
        raise SystemExit(1)

    print(json.dumps({"status": "sent", "provider_id": result.provider_id}, ensure_ascii=False))


if __name__ == "__main__":
    main()
