"""Persist booking notifications and public request fingerprints."""

import sqlalchemy as sa
from alembic import op

revision = "20260915_0032"
down_revision = "20260912_0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # An employee cannot attend two branches simultaneously. Existing overlaps
    # must be resolved by an operator; this migration never moves appointments.
    op.drop_constraint("excl_appointments_employee_period", "appointments")
    op.execute("""ALTER TABLE appointments ADD CONSTRAINT excl_appointments_employee_period
        EXCLUDE USING gist (workspace_id WITH =, employee_id WITH =, scheduled_period WITH &&)
        WHERE (employee_id IS NOT NULL AND record_status = 'active' AND status = 'confirmed')""")
    op.add_column("appointments", sa.Column("public_request_fingerprint", sa.String(64)))
    op.create_table(
        "email_notifications",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("appointment_id", sa.Uuid()),
        sa.Column("event_key", sa.String(200), nullable=False),
        sa.Column("recipient", sa.String(320), nullable=False),
        sa.Column("subject", sa.String(300), nullable=False),
        sa.Column("html_body", sa.Text(), nullable=False),
        sa.Column("text_body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(24), server_default="pending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("first_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("provider_id", sa.String(200)),
        sa.Column("error", sa.String(300)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("workspace_id", "event_key", name="uq_email_notifications_event"),
        sa.ForeignKeyConstraint(
            ["workspace_id", "appointment_id"],
            ["appointments.workspace_id", "appointments.id"],
            name="fk_email_notifications_appointment",
            ondelete="RESTRICT",
        ),
    )


def downgrade() -> None:
    op.drop_table("email_notifications")
    op.drop_column("appointments", "public_request_fingerprint")
    op.drop_constraint("excl_appointments_employee_period", "appointments")
    op.execute("""ALTER TABLE appointments ADD CONSTRAINT excl_appointments_employee_period
        EXCLUDE USING gist (workspace_id WITH =, branch_id WITH =,
                            employee_id WITH =, scheduled_period WITH &&)
        WHERE (employee_id IS NOT NULL AND record_status = 'active' AND status = 'confirmed')""")
