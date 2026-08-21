# Foundation schema

Status: implemented locally on 2026-08-21.

This document defines the physical PostgreSQL boundary that can be implemented before selecting the
first commercial ERP flow. It complements [`GLOBAL.md`](GLOBAL.md) and the logical domain documents;
it does not replace them.

## Implemented scope

The first migration installs only stable, cross-cutting concepts:

- organization: `workspaces`, `legal_entities`, `legal_entity_identities`, and `branches`;
- identity and access: `platform_users`, `workspace_memberships`, `permissions`, `roles`,
  `role_permissions`, `access_scopes`, and `role_assignments`;
- modularity: `module_definitions` and `module_entitlements`;
- regional configuration: `regional_packs`, `regional_rule_versions`, and
  `legal_entity_regional_rules`;
- append-only evidence: `audit_entries`.

No CRM, catalog, sales, purchasing, inventory, accounting, HR, payroll, POS, appointment, or lodging
tables are included. Their unresolved state machines and evidence requirements remain implementation
gates in the domain documentation. Attachment metadata is also deferred until its ownership,
classification, retention, and local storage boundary are selected with the first consuming flow.

## Physical decisions

- PostgreSQL 18 is the local source of truth.
- Primary keys use UUIDv7, generated in Python 3.14 or by PostgreSQL `uuidv7()`. This provides opaque,
  time-ordered API identifiers without sequence enumeration. The AWS target must support this function
  or receive an equivalent migration-safe UUIDv7 default before deployment.
- Every workspace-owned aggregate stores `workspace_id` directly.
- Composite foreign keys include `workspace_id` when referencing another workspace-owned aggregate.
  This makes cross-workspace references invalid in PostgreSQL even if an application query is wrong.
- Database names are lowercase `snake_case`; API schemas expose `camelCase`.
- Lifecycle values use checked text columns instead of PostgreSQL enum types so future transitions can
  be migrated without enum coupling.
- Effective periods are validated with check constraints. All timestamps with time-of-day use
  `timestamptz`.
- Foreign-key and principal workspace query paths have explicit indexes. PostgreSQL does not create
  indexes automatically for referencing foreign keys.
- Delete behavior is restrictive. Lifecycle changes should be explicit instead of cascading away
  business evidence.
- `audit_entries` has no update endpoint or mutable timestamp. Application code treats it as
  append-only; a database trigger can be added when privileged database roles are introduced.

## Local bootstrap

After applying migrations, run:

```bash
python -m app.scripts.bootstrap_local
```

The command is limited to development and test environments and is safe to repeat. It creates:

- one non-sensitive `local-erp` workspace;
- one legal entity and main branch;
- one local external identity and active workspace membership;
- a system administrator role, workspace scope, and foundation permissions;
- global module metadata, enabling only `foundation` and `iam`;
- a Dominican Republic regional pack in `planned` state, with no unverified fiscal rules activated.

The bootstrap intentionally creates no password, API token, customer, employee, invoice, payment,
stock, accounting, or fiscal record.

## Runtime verification

Development and test environments expose `GET /dev/foundation`. It reads PostgreSQL and reports the
installed organization counts and enabled modules. The route is not registered in staging or
production.

## Next design decision

Before adding another migration, select one end-to-end flow and close its documented implementation
gaps. The recommended first candidate is the workspace administration flow because it exercises the
foundation without introducing money, stock, tax, or payroll invariants. The alternative is a
customer-and-catalog foundation slice if early product discovery needs commercial data sooner.
