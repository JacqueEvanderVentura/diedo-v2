"""Fiscal profiles, identity invariants, and atomic branch reassignment.

Revision ID: 20260829_0007
Revises: 20260829_0006
Create Date: 2026-08-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260829_0007"
down_revision: str | Sequence[str] | None = "20260829_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _run_identity_preflight() -> None:
    op.execute(
        sa.text(
            """
            DO $fiscal_preflight$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM legal_entity_identities
                    WHERE is_primary
                      AND (identifier_type IS NULL OR identifier_value IS NULL)
                ) THEN
                    RAISE EXCEPTION USING
                        MESSAGE = '0007 preflight: primary identity lacks identifier.',
                        HINT = 'Set the real identifier or mark it non-primary; ' ||
                               'no value is filled.';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM legal_entity_identities
                    WHERE jurisdiction_code <> upper(jurisdiction_code)
                       OR (
                           identifier_type IS NOT NULL
                           AND identifier_type <> upper(identifier_type)
                       )
                ) THEN
                    RAISE EXCEPTION USING
                        MESSAGE = '0007 preflight: identity codes are not uppercase.',
                        HINT = 'Review and explicitly normalize jurisdiction_code ' ||
                               'and identifier_type.';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM legal_entity_identities
                    WHERE jurisdiction_code = 'DO'
                      AND identifier_type = 'RNC'
                      AND identifier_value !~ '^[0-9]{9}$'
                ) THEN
                    RAISE EXCEPTION USING
                        MESSAGE = '0007 preflight: a Dominican RNC is not 9 digits.',
                        HINT = 'Validate the real RNC and store its canonical value ' ||
                               'before retrying.';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM legal_entity_identities
                    WHERE is_primary AND valid_to IS NULL
                    GROUP BY workspace_id, legal_entity_id
                    HAVING count(*) > 1
                ) THEN
                    RAISE EXCEPTION USING
                        MESSAGE = '0007 preflight: entity has multiple current primaries.',
                        HINT = 'Close superseded identity periods before retrying the migration.';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM legal_entity_identities
                    WHERE identifier_value IS NOT NULL
                    GROUP BY workspace_id, jurisdiction_code, identifier_type, identifier_value
                    HAVING count(*) > 1
                ) THEN
                    RAISE EXCEPTION USING
                        MESSAGE = '0007 preflight: identifier is duplicated in a workspace.',
                        HINT = 'Resolve ownership/history duplicates manually; ' ||
                               'no value is changed.';
                END IF;
            END
            $fiscal_preflight$;
            """
        )
    )


def upgrade() -> None:
    _run_identity_preflight()
    op.create_check_constraint(
        op.f("ck_legal_entity_identities_primary_requires_identifier"),
        "legal_entity_identities",
        "NOT is_primary OR identifier_value IS NOT NULL",
    )
    op.create_check_constraint(
        op.f("ck_legal_entity_identities_jurisdiction_uppercase"),
        "legal_entity_identities",
        "upper(jurisdiction_code) = jurisdiction_code",
    )
    op.create_check_constraint(
        op.f("ck_legal_entity_identities_identifier_type_uppercase"),
        "legal_entity_identities",
        "identifier_type IS NULL OR upper(identifier_type) = identifier_type",
    )
    op.create_check_constraint(
        op.f("ck_legal_entity_identities_do_rnc_format"),
        "legal_entity_identities",
        "NOT (jurisdiction_code = 'DO' AND identifier_type = 'RNC') "
        "OR identifier_value ~ '^[0-9]{9}$'",
    )
    op.create_index(
        "uq_entity_identities_current_primary",
        "legal_entity_identities",
        ["workspace_id", "legal_entity_id"],
        unique=True,
        postgresql_where=sa.text("is_primary AND valid_to IS NULL"),
    )
    op.create_index(
        "uq_entity_identities_workspace_identifier",
        "legal_entity_identities",
        ["workspace_id", "jurisdiction_code", "identifier_type", "identifier_value"],
        unique=True,
        postgresql_where=sa.text("identifier_value IS NOT NULL"),
    )

    op.drop_constraint(
        "fk_access_scopes_workspace_entity_branch",
        "access_scopes",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_access_scopes_workspace_entity_branch",
        "access_scopes",
        "branches",
        ["workspace_id", "legal_entity_id", "branch_id"],
        ["workspace_id", "legal_entity_id", "id"],
        ondelete="RESTRICT",
        onupdate="CASCADE",
    )

    # Access scopes are authorization targets, not permission grants. Backfilling
    # them makes every existing aggregate addressable without changing who has access.
    op.execute(
        """
        INSERT INTO access_scopes (
            workspace_id, scope_type, legal_entity_id, branch_id, id, created_at, updated_at
        )
        SELECT
            entity.workspace_id,
            'legal_entity',
            entity.id,
            NULL,
            uuidv7(),
            now(),
            now()
        FROM legal_entities AS entity
        WHERE NOT EXISTS (
            SELECT 1
            FROM access_scopes AS scope
            WHERE scope.workspace_id = entity.workspace_id
              AND scope.scope_type = 'legal_entity'
              AND scope.legal_entity_id = entity.id
        )
        """
    )
    op.execute(
        """
        INSERT INTO access_scopes (
            workspace_id, scope_type, legal_entity_id, branch_id, id, created_at, updated_at
        )
        SELECT
            branch.workspace_id,
            'branch',
            branch.legal_entity_id,
            branch.id,
            uuidv7(),
            now(),
            now()
        FROM branches AS branch
        WHERE NOT EXISTS (
            SELECT 1
            FROM access_scopes AS scope
            WHERE scope.workspace_id = branch.workspace_id
              AND scope.scope_type = 'branch'
              AND scope.branch_id = branch.id
        )
        """
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_access_scopes_workspace_entity_branch",
        "access_scopes",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_access_scopes_workspace_entity_branch",
        "access_scopes",
        "branches",
        ["workspace_id", "legal_entity_id", "branch_id"],
        ["workspace_id", "legal_entity_id", "id"],
        ondelete="RESTRICT",
    )

    op.drop_index(
        "uq_entity_identities_workspace_identifier",
        table_name="legal_entity_identities",
    )
    op.drop_index(
        "uq_entity_identities_current_primary",
        table_name="legal_entity_identities",
    )
    op.drop_constraint(
        op.f("ck_legal_entity_identities_do_rnc_format"),
        "legal_entity_identities",
        type_="check",
    )
    op.drop_constraint(
        op.f("ck_legal_entity_identities_identifier_type_uppercase"),
        "legal_entity_identities",
        type_="check",
    )
    op.drop_constraint(
        op.f("ck_legal_entity_identities_jurisdiction_uppercase"),
        "legal_entity_identities",
        type_="check",
    )
    op.drop_constraint(
        op.f("ck_legal_entity_identities_primary_requires_identifier"),
        "legal_entity_identities",
        type_="check",
    )
