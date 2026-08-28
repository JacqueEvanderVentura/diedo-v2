from datetime import datetime
from uuid import UUID, uuid7

from sqlalchemy import DateTime, Integer, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column


class UuidPrimaryKeyMixin:
    """UUIDv7 identity shared by externally addressable records."""

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid7,
        server_default=text("uuidv7()"),
    )


class TimestampMixin:
    """Database-owned timestamps for mutable aggregates."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class VersionMixin:
    """Optimistic version marker for future compare-and-swap writes."""

    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default=text("1"),
    )
