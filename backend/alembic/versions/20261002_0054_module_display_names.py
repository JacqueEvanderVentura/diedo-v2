"""Align module_definitions.name with ERP navigation labels.

Revision ID: 20261002_0054
Revises: 20260928_0053
Create Date: 2026-10-02

"""

from collections.abc import Sequence

from alembic import op

revision: str = "20261002_0054"
down_revision: str | Sequence[str] | None = "20260928_0053"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NAMES = (
    ("foundation", "Base"),
    ("dashboard", "Dashboard"),
    ("iam", "Usuarios y permisos"),
    ("crm", "CRM"),
    ("catalog", "Inventarios"),
    ("sales", "Ventas"),
    ("purchasing", "Compras"),
    ("inventory", "Inventario y activos"),
    ("incidents", "Incidencias"),
    ("chat", "Chat"),
    ("finance", "Finanzas"),
    ("reporting", "Reportes"),
    ("accounting", "Contabilidad"),
    ("hr", "RRHH"),
    ("payroll", "Nómina"),
    ("pos", "Terminal POS"),
    ("carwash", "Carwash"),
    ("appointments", "Agenda"),
    ("lodging", "Hospedaje"),
)


def upgrade() -> None:
    for code, name in _NAMES:
        op.execute(
            f"UPDATE module_definitions SET name = '{name}', updated_at = now() WHERE code = '{code}'"
        )


def downgrade() -> None:
    previous = {
        "foundation": "Foundation",
        "iam": "Identity and access",
        "crm": "Customer relationship management",
        "catalog": "Product and service catalog",
        "sales": "Sales",
        "purchasing": "Purchasing",
        "inventory": "Inventory and assets",
        "incidents": "Incidents",
        "accounting": "Accounting",
        "hr": "Human resources",
        "payroll": "Payroll",
        "pos": "Point of sale",
        "appointments": "Appointments",
        "lodging": "Lodging",
    }
    for code, name in previous.items():
        op.execute(
            f"UPDATE module_definitions SET name = '{name}', updated_at = now() WHERE code = '{code}'"
        )
