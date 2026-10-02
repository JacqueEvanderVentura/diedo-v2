"""Canonical module catalog labels aligned with the ERP navigation."""

MODULE_DEFINITIONS: tuple[tuple[str, str, str, str, tuple[str, ...]], ...] = (
    ("foundation", "Base", "core", "available", ()),
    ("dashboard", "Dashboard", "optional", "available", ("foundation",)),
    ("iam", "Usuarios y permisos", "core", "available", ("foundation",)),
    ("crm", "CRM", "optional", "available", ("foundation",)),
    ("catalog", "Inventarios", "optional", "available", ("foundation",)),
    ("sales", "Ventas", "optional", "available", ("crm", "catalog")),
    ("purchasing", "Compras", "optional", "available", ("foundation", "catalog")),
    ("inventory", "Inventario y activos", "optional", "available", ("foundation", "catalog")),
    ("incidents", "Incidencias", "optional", "available", ("foundation",)),
    ("chat", "Chat", "optional", "available", ("foundation", "crm")),
    ("finance", "Finanzas", "optional", "available", ("foundation",)),
    ("reporting", "Reportes", "optional", "available", ("foundation",)),
    ("accounting", "Contabilidad", "optional", "planned", ("sales", "purchasing")),
    ("hr", "RRHH", "optional", "available", ("foundation",)),
    ("payroll", "Nómina", "optional", "planned", ("hr", "accounting")),
    ("pos", "Terminal POS", "optional", "available", ("sales", "inventory")),
    ("carwash", "Carwash", "optional", "available", ("pos", "hr")),
    ("appointments", "Agenda", "optional", "available", ("crm", "catalog", "hr")),
    ("lodging", "Hospedaje", "optional", "planned", ("crm", "catalog", "sales")),
)

MODULE_DISPLAY_NAMES = {code: name for code, name, _kind, _status, _deps in MODULE_DEFINITIONS}


def display_name_for_module(code: str, stored_name: str | None = None) -> str:
    return MODULE_DISPLAY_NAMES.get(code) or stored_name or code
