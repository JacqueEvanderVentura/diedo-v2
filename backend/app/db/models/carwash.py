from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin, VersionMixin


class CarwashServiceConfig(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "carwash_service_configs"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "branch_id", "id", name="uq_carwash_service_configs_scope_id"
        ),
        UniqueConstraint(
            "workspace_id", "branch_id", "item_id", name="uq_carwash_service_configs_scope_item"
        ),
        UniqueConstraint(
            "workspace_id",
            "creation_key",
            "creation_position",
            name="uq_carwash_service_configs_creation",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "item_id", "branch_id"],
            [
                "item_branch_assignments.workspace_id",
                "item_branch_assignments.item_id",
                "item_branch_assignments.branch_id",
            ],
            name="fk_carwash_service_configs_item_branch",
            ondelete="RESTRICT",
        ),
        CheckConstraint("washer_rate >= 0 AND washer_rate <= 100", name="washer_rate_range"),
        CheckConstraint(
            "supervisor_rate >= 0 AND supervisor_rate <= 100", name="supervisor_rate_range"
        ),
        CheckConstraint("washer_rate + supervisor_rate <= 100", name="commission_total_range"),
        CheckConstraint("creation_position >= 0", name="creation_position_non_negative"),
        CheckConstraint("version >= 1", name="version_positive"),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    item_id: Mapped[UUID] = mapped_column(nullable=False)
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    washer_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("20"), server_default=text("20")
    )
    supervisor_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("5"), server_default=text("5")
    )
    # Immutable metadata allows atomic batch retries without duplicating catalog items.
    creation_key: Mapped[str] = mapped_column(String(128), nullable=False)
    creation_position: Mapped[int] = mapped_column(Integer, nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
