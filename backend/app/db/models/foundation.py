from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin, VersionMixin


class Workspace(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "workspaces"
    __table_args__ = (
        CheckConstraint(
            "status IN ('onboarding', 'active', 'suspended', 'closing', 'closed')",
            name="status_values",
        ),
        CheckConstraint("char_length(default_currency) = 3", name="currency_length"),
        CheckConstraint(
            "tax_default_rate >= 0 AND tax_default_rate <= 100",
            name="tax_default_rate_range",
        ),
    )

    slug: Mapped[str] = mapped_column(String(63), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="onboarding", server_default=text("'onboarding'")
    )
    default_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    locale: Mapped[str] = mapped_column(String(16), nullable=False)
    tax_default_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )


class LegalEntity(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "legal_entities"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_legal_entities_workspace_id_id"),
        UniqueConstraint("workspace_id", "code", name="uq_legal_entities_workspace_code"),
        CheckConstraint("status IN ('active', 'inactive', 'archived')", name="status_values"),
        Index("ix_legal_entities_workspace_status", "workspace_id", "status"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    legal_name: Mapped[str] = mapped_column(String(200), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="active", server_default=text("'active'")
    )


class LegalEntityIdentity(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "legal_entity_identities"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "legal_entity_id"],
            ["legal_entities.workspace_id", "legal_entities.id"],
            ondelete="RESTRICT",
            name="fk_entity_identities_workspace_entity",
        ),
        CheckConstraint(
            "(identifier_type IS NULL) = (identifier_value IS NULL)",
            name="identifier_pair",
        ),
        CheckConstraint(
            "NOT is_primary OR identifier_value IS NOT NULL",
            name="primary_requires_identifier",
        ),
        CheckConstraint(
            "upper(jurisdiction_code) = jurisdiction_code",
            name="jurisdiction_uppercase",
        ),
        CheckConstraint(
            "identifier_type IS NULL OR upper(identifier_type) = identifier_type",
            name="identifier_type_uppercase",
        ),
        CheckConstraint(
            "NOT (jurisdiction_code = 'DO' AND identifier_type = 'RNC') "
            "OR identifier_value ~ '^[0-9]{9}$'",
            name="do_rnc_format",
        ),
        CheckConstraint("valid_to IS NULL OR valid_to >= valid_from", name="valid_period"),
        Index(
            "ix_entity_identities_workspace_entity",
            "workspace_id",
            "legal_entity_id",
        ),
        Index(
            "uq_entity_identities_current_primary",
            "workspace_id",
            "legal_entity_id",
            unique=True,
            postgresql_where=text("is_primary AND valid_to IS NULL"),
        ),
        Index(
            "uq_entity_identities_workspace_identifier",
            "workspace_id",
            "jurisdiction_code",
            "identifier_type",
            "identifier_value",
            unique=True,
            postgresql_where=text("identifier_value IS NOT NULL"),
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    legal_entity_id: Mapped[UUID] = mapped_column(nullable=False)
    registered_name: Mapped[str] = mapped_column(String(200), nullable=False)
    jurisdiction_code: Mapped[str] = mapped_column(String(2), nullable=False)
    identifier_type: Mapped[str | None] = mapped_column(String(32))
    identifier_value: Mapped[str | None] = mapped_column(String(80))
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date)
    is_primary: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )


class Branch(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "branches"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_branches_workspace_id_id"),
        UniqueConstraint(
            "workspace_id",
            "legal_entity_id",
            "id",
            name="uq_branches_workspace_entity_id",
        ),
        UniqueConstraint("workspace_id", "code", name="uq_branches_workspace_code"),
        ForeignKeyConstraint(
            ["workspace_id", "legal_entity_id"],
            ["legal_entities.workspace_id", "legal_entities.id"],
            ondelete="RESTRICT",
            name="fk_branches_workspace_entity",
        ),
        CheckConstraint("status IN ('active', 'inactive', 'archived')", name="status_values"),
        Index("ix_branches_workspace_entity", "workspace_id", "legal_entity_id"),
        Index("ix_branches_workspace_status", "workspace_id", "status"),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    legal_entity_id: Mapped[UUID] = mapped_column(nullable=False)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="active", server_default=text("'active'")
    )
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    configuration: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )


class ModuleDefinition(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "module_definitions"
    __table_args__ = (
        CheckConstraint("kind IN ('core', 'optional')", name="kind_values"),
        CheckConstraint("status IN ('planned', 'available', 'deprecated')", name="status_values"),
    )

    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    dependency_codes: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )


class ModuleEntitlement(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "module_entitlements"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "module_definition_id", name="uq_entitlements_workspace_module"
        ),
        CheckConstraint("status IN ('enabled', 'disabled', 'suspended')", name="status_values"),
        CheckConstraint(
            "effective_until IS NULL OR effective_until >= effective_from",
            name="effective_period",
        ),
        Index("ix_entitlements_module", "module_definition_id"),
        Index("ix_entitlements_workspace_status", "workspace_id", "status"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    module_definition_id: Mapped[UUID] = mapped_column(
        ForeignKey("module_definitions.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    effective_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RegionalPack(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "regional_packs"
    __table_args__ = (
        CheckConstraint("status IN ('planned', 'available', 'deprecated')", name="status_values"),
        CheckConstraint("char_length(jurisdiction_code) = 2", name="jurisdiction_length"),
    )

    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    jurisdiction_code: Mapped[str] = mapped_column(String(2), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)


class RegionalRuleVersion(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "regional_rule_versions"
    __table_args__ = (
        UniqueConstraint(
            "regional_pack_id",
            "rule_type",
            "version_number",
            name="uq_regional_rules_pack_type_version",
        ),
        CheckConstraint("status IN ('draft', 'active', 'retired')", name="status_values"),
        CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="period"),
        Index(
            "ix_regional_rules_pack_type_status",
            "regional_pack_id",
            "rule_type",
            "status",
        ),
    )

    regional_pack_id: Mapped[UUID] = mapped_column(
        ForeignKey("regional_packs.id", ondelete="RESTRICT"), nullable=False
    )
    rule_type: Mapped[str] = mapped_column(String(48), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    configuration: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class LegalEntityRegionalRule(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "legal_entity_regional_rules"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "legal_entity_id"],
            ["legal_entities.workspace_id", "legal_entities.id"],
            ondelete="RESTRICT",
            name="fk_entity_regional_rules_workspace_entity",
        ),
        CheckConstraint("status IN ('active', 'retired')", name="status_values"),
        CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="period"),
        Index("ix_entity_regional_rules_rule", "regional_rule_version_id"),
        Index(
            "ix_entity_regional_rules_workspace_entity",
            "workspace_id",
            "legal_entity_id",
            "status",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    legal_entity_id: Mapped[UUID] = mapped_column(nullable=False)
    regional_rule_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("regional_rule_versions.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)
