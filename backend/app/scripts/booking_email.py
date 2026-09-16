"""Inspect booking setup and explicitly retry persisted notifications."""

import argparse
import json
from typing import Any
from uuid import UUID

from sqlalchemy import select

from app.config import settings
from app.db.models import Employee, EmployeeBranchAssignment
from app.db.models.email_notifications import EmailNotification
from app.db.session import get_session_factory
from app.services.appointment_reminders import AppointmentReminderService
from app.services.email_notifications import deliver_email
from app.services.public_booking import PublicBookingService


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    diagnose = commands.add_parser("diagnose")
    diagnose.add_argument("--branch", required=True, type=UUID)
    listing = commands.add_parser("list")
    listing.add_argument("--workspace", required=True, type=UUID)
    retry = commands.add_parser("retry")
    retry.add_argument("--id", required=True, type=UUID)
    reminders = commands.add_parser("reminders")
    reminders.add_argument("--workspace", type=UUID)
    reminders.add_argument("--recipient")
    reminders.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    result: Any
    with get_session_factory()() as session:
        if args.command == "retry":
            result = deliver_email(session, args.id)
        elif args.command == "reminders":
            result = (
                AppointmentReminderService(session)
                .process_due(
                    workspace_id=args.workspace,
                    recipient_email=args.recipient,
                    dry_run=args.dry_run,
                )
                .as_dict()
            )
        elif args.command == "list":
            rows = session.scalars(
                select(EmailNotification)
                .where(
                    EmailNotification.workspace_id == args.workspace,
                )
                .order_by(EmailNotification.created_at.desc())
                .limit(100)
            ).all()
            result = [
                {
                    "id": row.id,
                    "status": row.status,
                    "attempts": row.attempts,
                    "providerId": row.provider_id,
                    "message": row.error,
                }
                for row in rows
            ]
        else:
            service = PublicBookingService(session)
            context = service.get_context(args.branch)
            branch, _ = service._resolve_branch(args.branch)
            employees = session.execute(
                select(
                    Employee.id,
                    Employee.status,
                    Employee.online_booking_selectable,
                    EmployeeBranchAssignment.status.label("assignment_status"),
                )
                .join(
                    EmployeeBranchAssignment,
                    (EmployeeBranchAssignment.employee_id == Employee.id)
                    & (EmployeeBranchAssignment.workspace_id == Employee.workspace_id),
                )
                .where(
                    Employee.workspace_id == branch.workspace_id,
                    EmployeeBranchAssignment.branch_id == branch.id,
                )
            ).all()
            result = {
                "branch": args.branch,
                "specialists": len(context["specialists"]),
                "services": len(context["services"]),
                "hasResources": context["has_resources"],
                "employees": [dict(row._mapping) for row in employees],
                "emailEnabled": settings.email_enabled,
                "resendKeyConfigured": bool(settings.resend_api_key),
                "publicAppUrl": settings.public_app_url,
            }
        print(json.dumps(result, default=str, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
