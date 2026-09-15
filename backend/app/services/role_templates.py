"""Standard role templates and the previous version for safe reconciliation."""

LEGACY_ROLE_PERMISSIONS = {
    "manager": frozenset(
        {
            "dashboard.read",
            "crm.read",
            "crm.manage",
            "finance.read",
            "finance.manage",
            "membership.read",
            "membership.manage",
            "report.read",
        }
    ),
    "cashier": frozenset(
        {
            "dashboard.read",
            "sales.read",
            "pos.read",
            "pos.sell",
            "pos.register.manage",
            "pos.cash.read",
            "pos.cash.manage",
            "pos.receivables.read",
            "pos.receivables.collect",
        }
    ),
    "supervisor": frozenset(
        {
            "dashboard.read",
            "crm.read",
            "crm.manage",
            "finance.read",
            "report.read",
            "sales.read",
            "pos.read",
            "pos.cash.read",
            "pos.receivables.read",
            "pos.receivables.collect",
            "pos.void",
            "sales.invoice.void",
        }
    ),
    "seller": frozenset(
        {
            "dashboard.read",
            "crm.read",
            "crm.manage",
            "sales.read",
            "sales.quote.manage",
            "pos.read",
            "pos.sell",
            "pos.receivables.read",
            "pos.receivables.collect",
        }
    ),
}

# Dependencies of CRM and POS workflows; commercial capabilities remain role-specific.
ROLE_DEPENDENCIES = frozenset(
    {"customer.read", "catalog.read", "inventory.read", "branch.read", "workspace.read"}
)
ROLE_PERMISSIONS = {
    code: permissions
    | ROLE_DEPENDENCIES
    | (frozenset({"customer.manage"}) if "crm.manage" in permissions else frozenset())
    for code, permissions in LEGACY_ROLE_PERMISSIONS.items()
}
