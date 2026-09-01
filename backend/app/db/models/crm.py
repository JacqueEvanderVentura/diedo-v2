"""Persistence owned by the customer relationship management capability."""

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
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


class CustomerCrmProfile(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    """CRM-only attributes for the shared customer master record."""

    __tablename__ = "customer_crm_profiles"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_customer_crm_profiles_workspace_id"),
        UniqueConstraint(
            "workspace_id", "customer_id", name="uq_customer_crm_profiles_workspace_customer"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            ondelete="RESTRICT",
            name="fk_customer_crm_profiles_workspace_customer",
        ),
        CheckConstraint(
            "lifecycle_status IN ('activo', 'prospecto', 'inactivo')",
            name="lifecycle_status_values",
        ),
        CheckConstraint("loyalty_points >= 0", name="loyalty_points_non_negative"),
        Index(
            "ix_customer_crm_profiles_workspace_status",
            "workspace_id",
            "lifecycle_status",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    customer_id: Mapped[UUID] = mapped_column(nullable=False)
    lifecycle_status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="activo", server_default=text("'activo'")
    )
    loyalty_points: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    notes: Mapped[str | None] = mapped_column(String(2000))
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class CrmLead(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    """Branch-scoped prospect with deterministic scoring and conversion trace."""

    __tablename__ = "crm_leads"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_crm_leads_workspace_id"),
        UniqueConstraint(
            "workspace_id", "creation_idempotency_key", name="uq_crm_leads_workspace_idempotency"
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_crm_leads_workspace_branch",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "assigned_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_crm_leads_workspace_assignee",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "converted_customer_id"],
            ["customers.workspace_id", "customers.id"],
            ondelete="RESTRICT",
            name="fk_crm_leads_workspace_converted_customer",
        ),
        CheckConstraint(
            "status IN ('nuevo', 'contactado', 'calificado', 'descartado', 'convertido')",
            name="status_values",
        ),
        CheckConstraint(
            "source IN ('manual', 'serp', 'serper', 'referral', 'import')",
            name="source_values",
        ),
        CheckConstraint(
            "char_length(name) > 0 OR char_length(company) > 0", name="identity_required"
        ),
        CheckConstraint("score_auto BETWEEN 0 AND 100", name="score_auto_range"),
        CheckConstraint(
            "score_manual IS NULL OR score_manual BETWEEN 0 AND 100", name="score_manual_range"
        ),
        CheckConstraint("score BETWEEN 0 AND 100", name="score_range"),
        CheckConstraint(
            "(status = 'convertido' AND converted_customer_id IS NOT NULL AND "
            "converted_at IS NOT NULL AND conversion_idempotency_key IS NOT NULL AND "
            "conversion_request_fingerprint IS NOT NULL) OR "
            "(status <> 'convertido' AND converted_customer_id IS NULL AND converted_at IS NULL "
            "AND conversion_idempotency_key IS NULL AND conversion_request_fingerprint IS NULL)",
            name="conversion_state_consistent",
        ),
        CheckConstraint(
            "char_length(creation_idempotency_key) >= 8", name="idempotency_key_length"
        ),
        CheckConstraint("char_length(request_fingerprint) = 64", name="fingerprint_length"),
        CheckConstraint(
            "conversion_idempotency_key IS NULL OR char_length(conversion_idempotency_key) >= 8",
            name="conversion_idempotency_key_length",
        ),
        CheckConstraint(
            "conversion_request_fingerprint IS NULL OR "
            "char_length(conversion_request_fingerprint) = 64",
            name="conversion_fingerprint_length",
        ),
        Index(
            "uq_crm_leads_workspace_converted_customer",
            "workspace_id",
            "converted_customer_id",
            unique=True,
            postgresql_where=text("converted_customer_id IS NOT NULL"),
        ),
        Index(
            "uq_crm_leads_workspace_conversion_idempotency",
            "workspace_id",
            "conversion_idempotency_key",
            unique=True,
            postgresql_where=text("conversion_idempotency_key IS NOT NULL"),
        ),
        Index(
            "ix_crm_leads_workspace_branch_status_updated",
            "workspace_id",
            "branch_id",
            "status",
            "updated_at",
        ),
        Index(
            "ix_crm_leads_workspace_assignee_status",
            "workspace_id",
            "assigned_membership_id",
            "status",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    assigned_membership_id: Mapped[UUID] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(
        String(200), nullable=False, default="", server_default=text("''")
    )
    company: Mapped[str] = mapped_column(
        String(200), nullable=False, default="", server_default=text("''")
    )
    email: Mapped[str | None] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(40))
    website: Mapped[str | None] = mapped_column(String(500))
    location: Mapped[str | None] = mapped_column(String(240))
    source: Mapped[str] = mapped_column(
        String(16), nullable=False, default="manual", server_default=text("'manual'")
    )
    source_url: Mapped[str | None] = mapped_column(String(1000))
    scraped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    raw_snippet: Mapped[str | None] = mapped_column(String(4000))
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="nuevo", server_default=text("'nuevo'")
    )
    score_auto: Mapped[int] = mapped_column(Integer, nullable=False)
    score_manual: Mapped[int | None] = mapped_column(Integer)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    module_fits: Mapped[dict[str, int]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    score_reasons: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    score_notes: Mapped[str | None] = mapped_column(String(2000))
    converted_customer_id: Mapped[UUID | None] = mapped_column(nullable=True)
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    creation_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    conversion_idempotency_key: Mapped[str | None] = mapped_column(String(128))
    conversion_request_fingerprint: Mapped[str | None] = mapped_column(String(64))
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class CrmOpportunity(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    """Pipeline deal linked to a lead and optionally to the converted customer."""

    __tablename__ = "crm_opportunities"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_crm_opportunities_workspace_id"),
        UniqueConstraint(
            "workspace_id",
            "creation_idempotency_key",
            name="uq_crm_opportunities_workspace_idempotency",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_crm_opportunities_workspace_branch",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "lead_id"],
            ["crm_leads.workspace_id", "crm_leads.id"],
            ondelete="RESTRICT",
            name="fk_crm_opportunities_workspace_lead",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            ondelete="RESTRICT",
            name="fk_crm_opportunities_workspace_customer",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "assigned_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_crm_opportunities_workspace_assignee",
        ),
        CheckConstraint(
            "stage IN ('nuevo', 'contactado', 'propuesta', 'negociacion', 'cerrado', 'perdido')",
            name="stage_values",
        ),
        CheckConstraint("value >= 0", name="value_non_negative"),
        CheckConstraint("char_length(currency_code) = 3", name="currency_code_length"),
        CheckConstraint("currency_code = upper(currency_code)", name="currency_code_uppercase"),
        CheckConstraint(
            "(stage IN ('cerrado', 'perdido') AND closed_at IS NOT NULL) OR "
            "(stage NOT IN ('cerrado', 'perdido') AND closed_at IS NULL)",
            name="closed_state_consistent",
        ),
        CheckConstraint(
            "stage <> 'perdido' OR lost_reason IS NOT NULL", name="lost_reason_required"
        ),
        CheckConstraint(
            "char_length(creation_idempotency_key) >= 8", name="idempotency_key_length"
        ),
        CheckConstraint("char_length(request_fingerprint) = 64", name="fingerprint_length"),
        Index(
            "uq_crm_opportunities_workspace_lead",
            "workspace_id",
            "lead_id",
            unique=True,
            postgresql_where=text("lead_id IS NOT NULL"),
        ),
        Index(
            "ix_crm_opportunities_workspace_branch_stage_updated",
            "workspace_id",
            "branch_id",
            "stage",
            "updated_at",
        ),
        Index(
            "ix_crm_opportunities_workspace_customer",
            "workspace_id",
            "customer_id",
            "updated_at",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    lead_id: Mapped[UUID | None] = mapped_column(nullable=True)
    customer_id: Mapped[UUID | None] = mapped_column(nullable=True)
    assigned_membership_id: Mapped[UUID] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    stage: Mapped[str] = mapped_column(
        String(16), nullable=False, default="nuevo", server_default=text("'nuevo'")
    )
    value: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(2000))
    lost_reason: Mapped[str | None] = mapped_column(String(1000))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    creation_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class CrmActivity(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    """Chronological CRM interaction or follow-up task."""

    __tablename__ = "crm_activities"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_crm_activities_workspace_id"),
        UniqueConstraint(
            "workspace_id",
            "creation_idempotency_key",
            name="uq_crm_activities_workspace_idempotency",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_crm_activities_workspace_branch",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "lead_id"],
            ["crm_leads.workspace_id", "crm_leads.id"],
            ondelete="RESTRICT",
            name="fk_crm_activities_workspace_lead",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "opportunity_id"],
            ["crm_opportunities.workspace_id", "crm_opportunities.id"],
            ondelete="RESTRICT",
            name="fk_crm_activities_workspace_opportunity",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            ondelete="RESTRICT",
            name="fk_crm_activities_workspace_customer",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "assigned_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_crm_activities_workspace_assignee",
        ),
        CheckConstraint(
            "activity_type IN ('llamada', 'email', 'reunion', 'nota', 'tarea')",
            name="activity_type_values",
        ),
        CheckConstraint(
            "char_length(creation_idempotency_key) >= 8", name="idempotency_key_length"
        ),
        CheckConstraint("char_length(request_fingerprint) = 64", name="fingerprint_length"),
        Index(
            "ix_crm_activities_workspace_branch_completed_due",
            "workspace_id",
            "branch_id",
            "completed_at",
            "due_at",
        ),
        Index(
            "ix_crm_activities_workspace_opportunity_created",
            "workspace_id",
            "opportunity_id",
            "created_at",
        ),
        Index(
            "ix_crm_activities_workspace_customer_created",
            "workspace_id",
            "customer_id",
            "created_at",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    lead_id: Mapped[UUID | None] = mapped_column(nullable=True)
    opportunity_id: Mapped[UUID | None] = mapped_column(nullable=True)
    customer_id: Mapped[UUID | None] = mapped_column(nullable=True)
    assigned_membership_id: Mapped[UUID] = mapped_column(nullable=False)
    activity_type: Mapped[str] = mapped_column(String(16), nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[str | None] = mapped_column(String(2000))
    customer_name: Mapped[str | None] = mapped_column(String(200))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    creation_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class CrmSettings(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    """Workspace-scoped lead-scoring configuration."""

    __tablename__ = "crm_settings"
    __table_args__ = (UniqueConstraint("workspace_id", name="uq_crm_settings_workspace"),)

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    scoring_weights: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    updated_by_platform_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT")
    )
