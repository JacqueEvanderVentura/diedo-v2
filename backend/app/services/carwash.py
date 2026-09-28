import hashlib
import json
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.db.models import AuditEntry, CarwashServiceConfig
from app.repositories.carwash import CarwashRepository, CarwashServiceRecord
from app.schemas.carwash import CreateCarwashServicesRequest, UpdateCarwashServiceRequest
from app.schemas.inventory import CreateInventoryServiceRequest
from app.services.auth import AuthPrincipal
from app.services.authorization import AuthorizationService, PermissionGrant
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)
from app.services.inventory import InventoryService


class CarwashService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.repository = CarwashRepository(session)

    def require_branch(self, grant: PermissionGrant, branch_id: UUID) -> None:
        if grant.allowed_branch_ids is not None and branch_id not in grant.allowed_branch_ids:
            raise AuthorizationError("No tienes acceso a esta sucursal.")
        if self.repository.branch(grant.workspace_id, branch_id) is None:
            raise ResourceNotFoundError("La sucursal no existe o no está activa.", "branchId")

    def settings_grant(self, principal: AuthPrincipal, branch_id: UUID) -> PermissionGrant:
        auth = AuthorizationService(self.session)
        read = auth.require_permission(principal, "carwash.read")
        manage = auth.require_permission(principal, "carwash.settings.manage")
        self.require_branch(read, branch_id)
        self.require_branch(manage, branch_id)
        return manage

    def get(
        self, principal: AuthPrincipal, config_id: UUID, *, lock: bool = False
    ) -> CarwashServiceRecord:
        record = self.repository.get_service(principal.workspace_id, config_id, lock=lock)
        if record is None:
            raise ResourceNotFoundError("La configuración de Carwash no existe.", "serviceId")
        self.settings_grant(principal, record.config.branch_id)
        return record

    def _replay(
        self, principal: AuthPrincipal, key: str, fingerprint: str
    ) -> list[CarwashServiceRecord] | None:
        records = self.repository.creation(principal.workspace_id, key)
        if not records:
            return None
        if any(record.request_fingerprint != fingerprint for record in records):
            raise ConflictError(
                "Idempotency-Key ya fue usado con otro contenido.", "Idempotency-Key"
            )
        return [self.get(principal, record.id) for record in records]

    def create_batch(
        self, principal: AuthPrincipal, payload: CreateCarwashServicesRequest, key: str
    ) -> list[CarwashServiceRecord]:
        self.settings_grant(principal, payload.branch_id)
        inventory_grant = None
        if any(line.new_service for line in payload.services):
            inventory_grant = AuthorizationService(self.session).require_permission(
                principal, "inventory.manage"
            )
            self.require_branch(inventory_grant, payload.branch_id)
        fingerprint = hashlib.sha256(
            json.dumps(payload.model_dump(mode="json"), sort_keys=True).encode()
        ).hexdigest()
        replay = self._replay(principal, key, fingerprint)
        if replay is not None:
            return replay
        ids = []
        try:
            for position, line in enumerate(payload.services):
                item_id = line.item_id
                if line.new_service is not None:
                    assert inventory_grant is not None
                    commercial = CreateInventoryServiceRequest(
                        **line.new_service.model_dump(), branch_ids=[payload.branch_id]
                    )
                    item_key = "carwash:" + hashlib.sha256(f"{key}:{position}".encode()).hexdigest()
                    created = InventoryService(self.session).create_item_in_transaction(
                        principal=principal,
                        grant=inventory_grant,
                        item_type="service",
                        values=commercial.model_dump(by_alias=False),
                        idempotency_key=item_key,
                    )
                    item_id = created.item.id
                assert item_id is not None
                catalog = self.repository.catalog_service(
                    principal.workspace_id, payload.branch_id, item_id
                )
                if catalog is None:
                    raise ResourceNotFoundError(
                        "El servicio no pertenece a esta sucursal.", "itemId"
                    )
                if catalog.unavailable_reason:
                    raise InvalidOperationError(catalog.unavailable_reason, "itemId")
                config = CarwashServiceConfig(
                    workspace_id=principal.workspace_id,
                    branch_id=payload.branch_id,
                    item_id=item_id,
                    washer_rate=line.washer_rate,
                    supervisor_rate=line.supervisor_rate,
                    enabled=True,
                    creation_key=key,
                    creation_position=position,
                    request_fingerprint=fingerprint,
                )
                self.session.add(config)
                self.session.flush()
                ids.append(config.id)
                self._audit(principal, config, "create", None)
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            replay = self._replay(principal, key, fingerprint)
            if replay is not None:
                return replay
            raise ConflictError(
                "Uno de los servicios ya está configurado en esta sucursal. Recarga el listado.",
                "itemId",
            ) from exc
        except Exception:
            self.session.rollback()
            raise
        return [self.get(principal, config_id) for config_id in ids]

    def update(
        self, principal: AuthPrincipal, config_id: UUID, payload: UpdateCarwashServiceRequest
    ) -> CarwashServiceRecord:
        record = self.get(principal, config_id, lock=True)
        config = record.config
        if config.version != payload.version:
            raise ConflictError(
                "La configuración cambió mientras editabas. Recarga antes de guardar.", "version"
            )
        if payload.enabled and record.catalog.unavailable_reason:
            raise InvalidOperationError(record.catalog.unavailable_reason, "enabled")
        before = self._configuration(config)
        config.enabled = payload.enabled
        config.washer_rate = payload.washer_rate
        config.supervisor_rate = payload.supervisor_rate
        config.version += 1
        self._audit(principal, config, "update", before)
        self.session.commit()
        return self.get(principal, config_id)

    @staticmethod
    def _configuration(config: CarwashServiceConfig) -> dict[str, object]:
        return {
            "enabled": config.enabled,
            "washerRate": str(config.washer_rate),
            "supervisorRate": str(config.supervisor_rate),
            "version": config.version,
        }

    def _audit(
        self,
        principal: AuthPrincipal,
        config: CarwashServiceConfig,
        action: str,
        before: dict[str, object] | None,
    ) -> None:
        self.session.add(
            AuditEntry(
                workspace_id=principal.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action=f"carwash.service.{action}",
                target_type="carwash_service",
                target_id=config.id,
                outcome="success",
                request_id=get_request_id(),
                details={
                    "branchId": str(config.branch_id),
                    "itemId": str(config.item_id),
                    "before": before,
                    "after": self._configuration(config),
                },
            )
        )
