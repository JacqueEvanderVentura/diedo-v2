from hashlib import sha256
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Branch, Workspace
from app.services.authorization import PermissionGrant
from app.services.email_notifications import deliver_email, enqueue_email
from app.services.errors import AuthorizationError, ResourceNotFoundError
from app.services.mailer import render_booking_link_email
from app.services.public_booking import PublicBookingService


def send_booking_link(
    session: Session,
    *,
    grant: PermissionGrant,
    branch_id: UUID,
    name: str,
    email: str,
    idempotency_key: str,
) -> dict:
    if grant.allowed_branch_ids is not None and branch_id not in grant.allowed_branch_ids:
        raise AuthorizationError("No tienes acceso a esta sucursal.", "branchId")
    branch = session.scalar(
        select(Branch).where(
            Branch.id == branch_id,
            Branch.workspace_id == grant.workspace_id,
            Branch.status == "active",
        )
    )
    if branch is None:
        raise ResourceNotFoundError("La sucursal no existe.", "branchId")
    workspace = session.get(Workspace, grant.workspace_id)
    assert workspace is not None
    key = "booking-link/" + sha256(f"{branch_id}/{idempotency_key}".encode()).hexdigest()
    PublicBookingService(session)._lock(key)
    content = render_booking_link_email(
        to=email,
        name=name,
        branch_name=branch.name,
        workspace_name=workspace.name,
        branch_id=branch.id,
    )
    notification = enqueue_email(
        session,
        workspace_id=grant.workspace_id,
        event_key=key,
        to=content["to"],
        subject=content["subject"],
        html=content["html"],
        text=content["text"],
    )
    session.commit()
    return deliver_email(session, notification.id)
