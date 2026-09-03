from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import (
    Asset,
    AuditEntry,
    Branch,
    Employee,
    EmployeeBranchAssignment,
    Incident,
    IncidentActivity,
    IncidentAttachment,
    IncidentCounter,
    IncidentParticipant,
    PlatformUser,
    WorkspaceMembership,
)


@dataclass(frozen=True)
class IncidentParticipantRecord:
    membership_id: UUID
    name: str


@dataclass(frozen=True)
class IncidentActivityRecord:
    id: UUID
    activity_type: str
    author_membership_id: UUID | None
    author_name: str
    message: str
    created_at: datetime


@dataclass(frozen=True)
class IncidentAttachmentRecord:
    id: UUID
    original_filename: str
    content_type: str
    size_bytes: int
    checksum_sha256: str
    created_at: datetime


@dataclass(frozen=True)
class IncidentAttachmentContentRecord(IncidentAttachmentRecord):
    content: bytes


@dataclass(frozen=True)
class IncidentRecord:
    incident: Incident
    employee_name: str | None
    participants: tuple[IncidentParticipantRecord, ...]
    activity: tuple[IncidentActivityRecord, ...]
    attachments: tuple[IncidentAttachmentRecord, ...]


@dataclass(frozen=True)
class IncidentPage:
    items: tuple[IncidentRecord, ...]
    total_items: int


@dataclass(frozen=True)
class IncidentStatsRecord:
    total: int
    abiertas: int
    en_proceso: int
    criticas: int


@dataclass(frozen=True)
class NewIncidentImage:
    original_filename: str
    content_type: str
    content: bytes
    checksum_sha256: str


class IncidentRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_incidents(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        search: str | None,
        incident_type: str | None,
        priority: str | None,
        status: str | None,
        date_from: date | None,
        date_to: date | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> IncidentPage:
        predicates = self._incident_predicates(
            workspace_id=workspace_id,
            visible_branch_ids=visible_branch_ids,
            branch_id=branch_id,
        )
        if search:
            pattern = f"%{search.casefold()}%"
            predicates.append(
                or_(
                    func.lower(Incident.code).like(pattern),
                    func.lower(Incident.title).like(pattern),
                    func.lower(Incident.description).like(pattern),
                )
            )
        if incident_type is not None:
            predicates.append(Incident.incident_type == incident_type)
        if priority is not None:
            predicates.append(Incident.priority == priority)
        if status is not None:
            predicates.append(Incident.status == status)
        if date_from is not None:
            predicates.append(
                Incident.created_at >= datetime.combine(date_from, time.min, tzinfo=UTC)
            )
        if date_to is not None:
            predicates.append(
                Incident.created_at
                < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=UTC)
            )

        total_items = self._session.scalar(select(func.count(Incident.id)).where(*predicates)) or 0
        order_fields: dict[str, Any] = {
            "code": Incident.code,
            "title": func.lower(Incident.title),
            "priority": Incident.priority,
            "status": Incident.status,
            "createdAt": Incident.created_at,
            "updatedAt": Incident.updated_at,
        }
        order_field = order_fields[sort_by]
        order = order_field.desc() if sort_direction == "desc" else order_field.asc()
        incidents = tuple(
            self._session.scalars(
                select(Incident)
                .where(*predicates)
                .order_by(order, Incident.id)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return IncidentPage(
            items=self._records_for_incidents(incidents),
            total_items=int(total_items),
        )

    def incident_stats(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> IncidentStatsRecord:
        predicates = self._incident_predicates(
            workspace_id=workspace_id,
            visible_branch_ids=visible_branch_ids,
            branch_id=branch_id,
        )
        row = self._session.execute(
            select(
                func.count(Incident.id),
                func.count(Incident.id).filter(Incident.status == "abierta"),
                func.count(Incident.id).filter(Incident.status == "en_proceso"),
                func.count(Incident.id).filter(
                    and_(Incident.priority == "critica", Incident.status != "cerrada")
                ),
            ).where(*predicates)
        ).one()
        return IncidentStatsRecord(
            total=int(row[0]),
            abiertas=int(row[1]),
            en_proceso=int(row[2]),
            criticas=int(row[3]),
        )

    def get_incident(
        self,
        *,
        workspace_id: UUID,
        incident_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
    ) -> IncidentRecord | None:
        predicates = self._incident_predicates(
            workspace_id=workspace_id,
            visible_branch_ids=visible_branch_ids,
        )
        incident = self._session.scalar(
            select(Incident).where(*predicates, Incident.id == incident_id)
        )
        if incident is None:
            return None
        return self._records_for_incidents((incident,))[0]

    def get_incident_for_update(self, workspace_id: UUID, incident_id: UUID) -> Incident | None:
        return self._session.scalar(
            select(Incident)
            .where(Incident.workspace_id == workspace_id, Incident.id == incident_id)
            .with_for_update()
        )

    def incident_by_creation_key(
        self, workspace_id: UUID, idempotency_key: str
    ) -> tuple[UUID, str] | None:
        row = self._session.execute(
            select(Incident.id, Incident.request_fingerprint).where(
                Incident.workspace_id == workspace_id,
                Incident.creation_idempotency_key == idempotency_key,
            )
        ).one_or_none()
        return (row[0], row[1]) if row is not None else None

    def create_incident(
        self,
        *,
        workspace_id: UUID,
        reporter_membership_id: UUID,
        reporter_name: str,
        actor_platform_user_id: UUID,
        values: dict[str, object],
        participant_names: dict[UUID, str],
        idempotency_key: str,
        request_fingerprint: str,
        request_id: str,
    ) -> UUID:
        counter_statement = (
            insert(IncidentCounter)
            .values(workspace_id=workspace_id, last_value=1194)
            .on_conflict_do_update(
                index_elements=[IncidentCounter.workspace_id],
                set_={"last_value": IncidentCounter.last_value + 1},
            )
            .returning(IncidentCounter.last_value)
        )
        number = self._session.scalar(counter_statement)
        if number is None:
            raise RuntimeError("Incident counter did not return a value.")
        incident = Incident(
            workspace_id=workspace_id,
            reported_by_membership_id=reporter_membership_id,
            reported_by_name=reporter_name,
            code=f"INC-{number}",
            creation_idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
            updated_by_platform_user_id=actor_platform_user_id,
            **values,
        )
        self._session.add(incident)
        self._session.flush()
        for membership_id, name in participant_names.items():
            self._session.add(
                IncidentParticipant(
                    workspace_id=workspace_id,
                    incident_id=incident.id,
                    membership_id=membership_id,
                    participant_name=name,
                )
            )
        self._session.add(
            IncidentActivity(
                workspace_id=workspace_id,
                incident_id=incident.id,
                activity_type="created",
                author_membership_id=reporter_membership_id,
                author_name=reporter_name,
                message="Incidencia reportada y abierta.",
            )
        )
        self.add_audit(
            workspace_id=workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="incidents.create",
            target_type="incident",
            target_id=incident.id,
            request_id=request_id,
            details={
                "branchId": str(incident.branch_id),
                "code": incident.code,
                "priority": incident.priority,
                "type": incident.incident_type,
            },
        )
        self._session.flush()
        return incident.id

    def update_status(
        self,
        *,
        incident: Incident,
        status: str,
        status_label: str,
        actor_membership_id: UUID,
        actor_platform_user_id: UUID,
        actor_name: str,
        request_id: str,
    ) -> None:
        previous_status = incident.status
        incident.status = status
        self._touch(incident, actor_platform_user_id)
        self._session.add(
            IncidentActivity(
                workspace_id=incident.workspace_id,
                incident_id=incident.id,
                activity_type="status_changed",
                author_membership_id=actor_membership_id,
                author_name=actor_name,
                message=f"Estado cambiado a {status_label.lower()}.",
            )
        )
        self.add_audit(
            workspace_id=incident.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="incidents.status.update",
            target_type="incident",
            target_id=incident.id,
            request_id=request_id,
            details={
                "from": previous_status,
                "to": status,
                "version": incident.version,
            },
        )
        self._session.flush()

    def add_comment(
        self,
        *,
        incident: Incident,
        message: str,
        actor_membership_id: UUID,
        actor_platform_user_id: UUID,
        actor_name: str,
        request_id: str,
    ) -> None:
        self._touch(incident, actor_platform_user_id)
        self._session.add(
            IncidentActivity(
                workspace_id=incident.workspace_id,
                incident_id=incident.id,
                activity_type="comment",
                author_membership_id=actor_membership_id,
                author_name=actor_name,
                message=message,
            )
        )
        self.add_audit(
            workspace_id=incident.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="incidents.comment.create",
            target_type="incident",
            target_id=incident.id,
            request_id=request_id,
            details={"version": incident.version},
        )
        self._session.flush()

    def add_attachments(
        self,
        *,
        incident: Incident,
        images: tuple[NewIncidentImage, ...],
        actor_membership_id: UUID,
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> None:
        for image in images:
            self._session.add(
                IncidentAttachment(
                    workspace_id=incident.workspace_id,
                    incident_id=incident.id,
                    uploaded_by_membership_id=actor_membership_id,
                    original_filename=image.original_filename,
                    content_type=image.content_type,
                    size_bytes=len(image.content),
                    checksum_sha256=image.checksum_sha256,
                    content=image.content,
                )
            )
        self._touch(incident, actor_platform_user_id)
        self.add_audit(
            workspace_id=incident.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="incidents.attachment.create",
            target_type="incident",
            target_id=incident.id,
            request_id=request_id,
            details={"count": len(images), "version": incident.version},
        )
        self._session.flush()

    def get_attachment_content(
        self,
        *,
        workspace_id: UUID,
        incident_id: UUID,
        attachment_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
    ) -> IncidentAttachmentContentRecord | None:
        statement: Select[tuple[Any, ...]] = (
            select(
                IncidentAttachment.id,
                IncidentAttachment.original_filename,
                IncidentAttachment.content_type,
                IncidentAttachment.size_bytes,
                IncidentAttachment.checksum_sha256,
                IncidentAttachment.created_at,
                IncidentAttachment.content,
            )
            .join(
                Incident,
                (Incident.workspace_id == IncidentAttachment.workspace_id)
                & (Incident.id == IncidentAttachment.incident_id),
            )
            .where(
                IncidentAttachment.workspace_id == workspace_id,
                IncidentAttachment.incident_id == incident_id,
                IncidentAttachment.id == attachment_id,
            )
        )
        if visible_branch_ids is not None:
            statement = statement.where(Incident.branch_id.in_(visible_branch_ids))
        row = self._session.execute(statement).one_or_none()
        if row is None:
            return None
        return IncidentAttachmentContentRecord(
            id=row.id,
            original_filename=row.original_filename,
            content_type=row.content_type,
            size_bytes=row.size_bytes,
            checksum_sha256=row.checksum_sha256,
            created_at=row.created_at,
            content=row.content,
        )

    def get_active_branch(self, workspace_id: UUID, branch_id: UUID) -> Branch | None:
        return self._session.scalar(
            select(Branch).where(
                Branch.workspace_id == workspace_id,
                Branch.id == branch_id,
                Branch.status == "active",
            )
        )

    def active_asset_in_branch(
        self, workspace_id: UUID, branch_id: UUID, asset_id: UUID
    ) -> Asset | None:
        return self._session.scalar(
            select(Asset).where(
                Asset.workspace_id == workspace_id,
                Asset.branch_id == branch_id,
                Asset.id == asset_id,
                Asset.status != "baja",
            )
        )

    def active_employee_in_branch(
        self, workspace_id: UUID, branch_id: UUID, employee_id: UUID
    ) -> Employee | None:
        return self._session.scalar(
            select(Employee)
            .join(
                EmployeeBranchAssignment,
                (EmployeeBranchAssignment.workspace_id == Employee.workspace_id)
                & (EmployeeBranchAssignment.employee_id == Employee.id),
            )
            .where(
                Employee.workspace_id == workspace_id,
                Employee.id == employee_id,
                Employee.status == "active",
                EmployeeBranchAssignment.branch_id == branch_id,
                EmployeeBranchAssignment.status == "active",
            )
        )

    def active_participant_names(
        self, workspace_id: UUID, membership_ids: set[UUID]
    ) -> dict[UUID, str]:
        if not membership_ids:
            return {}
        rows = self._session.execute(
            select(WorkspaceMembership.id, PlatformUser.display_name)
            .join(PlatformUser, PlatformUser.id == WorkspaceMembership.platform_user_id)
            .where(
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.id.in_(membership_ids),
                WorkspaceMembership.status == "active",
                PlatformUser.status == "active",
            )
        )
        return {row[0]: row[1] for row in rows}

    def add_audit(
        self,
        *,
        workspace_id: UUID,
        actor_platform_user_id: UUID,
        action: str,
        target_type: str,
        target_id: UUID,
        request_id: str,
        details: dict[str, object],
    ) -> None:
        self._session.add(
            AuditEntry(
                workspace_id=workspace_id,
                actor_platform_user_id=actor_platform_user_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                outcome="success",
                request_id=request_id,
                details=details,
            )
        )

    @staticmethod
    def _touch(incident: Incident, actor_platform_user_id: UUID) -> None:
        incident.updated_by_platform_user_id = actor_platform_user_id
        incident.updated_at = datetime.now(UTC)
        incident.version += 1

    @staticmethod
    def _incident_predicates(
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None = None,
    ) -> list[Any]:
        predicates: list[Any] = [Incident.workspace_id == workspace_id]
        if visible_branch_ids is not None:
            predicates.append(Incident.branch_id.in_(visible_branch_ids))
        if branch_id is not None:
            predicates.append(Incident.branch_id == branch_id)
        return predicates

    def _records_for_incidents(self, incidents: tuple[Incident, ...]) -> tuple[IncidentRecord, ...]:
        if not incidents:
            return ()
        incident_ids = {incident.id for incident in incidents}
        employee_ids = {incident.employee_id for incident in incidents if incident.employee_id}
        employee_names = {
            employee.id: f"{employee.first_name} {employee.last_name}".strip()
            for employee in self._session.scalars(
                select(Employee).where(Employee.id.in_(employee_ids))
            )
        }
        participants_by_incident: defaultdict[UUID, list[IncidentParticipantRecord]] = defaultdict(
            list
        )
        for participant in self._session.execute(
            select(IncidentParticipant)
            .where(IncidentParticipant.incident_id.in_(incident_ids))
            .order_by(IncidentParticipant.created_at, IncidentParticipant.id)
        ).scalars():
            participants_by_incident[participant.incident_id].append(
                IncidentParticipantRecord(
                    membership_id=participant.membership_id,
                    name=participant.participant_name,
                )
            )

        activity_by_incident: defaultdict[UUID, list[IncidentActivityRecord]] = defaultdict(list)
        for activity in self._session.execute(
            select(IncidentActivity)
            .where(IncidentActivity.incident_id.in_(incident_ids))
            .order_by(IncidentActivity.created_at.desc(), IncidentActivity.id.desc())
        ).scalars():
            activity_by_incident[activity.incident_id].append(
                IncidentActivityRecord(
                    id=activity.id,
                    activity_type=activity.activity_type,
                    author_membership_id=activity.author_membership_id,
                    author_name=activity.author_name,
                    message=activity.message,
                    created_at=activity.created_at,
                )
            )

        attachments_by_incident: defaultdict[UUID, list[IncidentAttachmentRecord]] = defaultdict(
            list
        )
        attachment_rows = self._session.execute(
            select(
                IncidentAttachment.incident_id,
                IncidentAttachment.id,
                IncidentAttachment.original_filename,
                IncidentAttachment.content_type,
                IncidentAttachment.size_bytes,
                IncidentAttachment.checksum_sha256,
                IncidentAttachment.created_at,
            )
            .where(IncidentAttachment.incident_id.in_(incident_ids))
            .order_by(IncidentAttachment.created_at, IncidentAttachment.id)
        )
        for attachment_row in attachment_rows:
            attachments_by_incident[attachment_row.incident_id].append(
                IncidentAttachmentRecord(
                    id=attachment_row.id,
                    original_filename=attachment_row.original_filename,
                    content_type=attachment_row.content_type,
                    size_bytes=attachment_row.size_bytes,
                    checksum_sha256=attachment_row.checksum_sha256,
                    created_at=attachment_row.created_at,
                )
            )

        return tuple(
            IncidentRecord(
                incident=incident,
                employee_name=(
                    employee_names.get(incident.employee_id)
                    if incident.employee_id is not None
                    else None
                ),
                participants=tuple(participants_by_incident[incident.id]),
                activity=tuple(activity_by_incident[incident.id]),
                attachments=tuple(attachments_by_incident[incident.id]),
            )
            for incident in incidents
        )
