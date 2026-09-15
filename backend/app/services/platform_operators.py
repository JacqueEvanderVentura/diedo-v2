from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid7

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.security import hash_password, normalize_email
from app.db.models import AuditEntry, PlatformUser, Workspace, WorkspaceMembership
from app.schemas.platform_operators import CreatePlatformOperatorInput
from app.services.errors import ConflictError
from app.services.platform_workspace import PLATFORM_WORKSPACE_SLUG


@dataclass(frozen=True)
class CreatedPlatformOperator:
    user_id: UUID
    workspace_id: UUID
    email: str
    created: bool


def create_platform_operator(
    session: Session, data: CreatePlatformOperatorInput
) -> CreatedPlatformOperator:
    """Administrative CLI use only; the caller owns the transaction.

    Backoffice authorization uses the platform flag, not tenant role permissions.
    A new operator receives only its internal login membership, never client roles.
    """
    session.execute(
        insert(Workspace)
        .values(
            slug=PLATFORM_WORKSPACE_SLUG,
            name="Helios Platform",
            status="active",
            default_currency="DOP",
            timezone="America/Santo_Domingo",
            locale="es-DO",
        )
        .on_conflict_do_nothing(index_elements=[Workspace.slug])
    )
    # Serialize creation and retries, including the first internal workspace.
    workspace = session.scalar(
        select(Workspace).where(Workspace.slug == PLATFORM_WORKSPACE_SLUG).with_for_update()
    )
    if workspace is None or workspace.status != "active":
        raise ConflictError("El workspace interno de plataforma no está activo.")
    email = normalize_email(str(data.email))
    existing = session.scalar(
        select(PlatformUser).where(PlatformUser.normalized_email == email).with_for_update()
    )
    if existing is not None:
        memberships = session.scalars(
            select(WorkspaceMembership).where(WorkspaceMembership.platform_user_id == existing.id)
        ).all()
        if not existing.is_platform_operator or any(
            member.workspace_id != workspace.id for member in memberships
        ):
            raise ConflictError("Ese correo pertenece a una cuenta de cliente. Usa otro correo.")
        if (
            existing.status != "active"
            or not existing.password_hash
            or len(memberships) != 1
            or memberships[0].status != "active"
            or not memberships[0].is_default
        ):
            raise ConflictError("El operador existe pero requiere recuperación administrativa.")
        return CreatedPlatformOperator(existing.id, workspace.id, existing.email, False)

    now = datetime.now(UTC)
    user_id = uuid7()
    session.add(
        PlatformUser(
            id=user_id,
            external_subject=f"platform-operator:{user_id}",
            email=email,
            normalized_email=email,
            display_name=data.display_name,
            password_hash=hash_password(data.password.get_secret_value()),
            password_changed_at=now,
            status="active",
            is_platform_operator=True,
        )
    )
    session.flush()
    session.add(
        WorkspaceMembership(
            workspace_id=workspace.id,
            platform_user_id=user_id,
            status="active",
            activated_at=now,
            is_default=True,
        )
    )
    session.add(
        AuditEntry(
            workspace_id=workspace.id,
            actor_platform_user_id=None,
            action="platform_operator.create",
            target_type="platform_user",
            target_id=user_id,
            outcome="success",
            details={"actorType": "administrative_cli", "email": email},
        )
    )
    session.flush()
    return CreatedPlatformOperator(user_id, workspace.id, email, True)
