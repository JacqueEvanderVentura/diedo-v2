# Foundation schema

Status: foundation and initial Phase 1/2 slices implemented; Phases 0, 1, and 2 remain reopened.

The current schema and contracts are usable, but this document is not evidence that the full
cross-module stories or API/demo parity in the Plan V2 have been completed.

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
- append-only evidence: `audit_entries`;
- Phase 0 reliability: composite identity integrity in `auth_sessions` and
  `demo_seed_registry` ownership for canonical fixtures;
- Phase 1 configuration: workspace default tax rate, branch configuration,
  `payment_methods` and `user_invitations`;
- Phase 2 master data: `customers`, `customer_branch_assignments`, `employees`,
  `employee_branch_assignments`, `employee_supervisors`, `employee_schedules`, and owner-scoped
  `attachments`.

Commercial modules are documented separately from this foundation contract. Catalog, inventory,
assets, HR, and appointments now have dedicated tables and API contracts; sales, purchasing,
accounting, payroll, POS, and lodging remain outside this foundation slice.

## Physical decisions

- PostgreSQL 18 is the local source of truth.
- Primary keys use UUIDv7, generated in Python 3.14 or by PostgreSQL `uuidv7()`. This provides opaque,
  time-ordered API identifiers without sequence enumeration. The AWS target must support this function
  or receive an equivalent migration-safe UUIDv7 default before deployment.
- Every workspace-owned aggregate stores `workspace_id` directly.
- Composite foreign keys include `workspace_id` when referencing another workspace-owned aggregate.
  This makes cross-workspace references invalid in PostgreSQL even if an application query is wrong.
- `auth_sessions` additionally references membership and platform user as one composite identity, so
  a valid user cannot be paired with another user's membership.
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
- global module metadata, enabling `foundation`, `iam`, `catalog`, `crm`, `hr`, `agenda`, and
  `inventory`;
- a Dominican Republic regional pack in `planned` state, with no unverified fiscal rules activated.

By default the bootstrap creates no password. In development or test, setting
`LOCAL_BOOTSTRAP_ADMIN_PASSWORD` sets or rotates the local owner's Argon2 password for that explicit
bootstrap run.
The bootstrap never creates an API key, customer, employee, commercial item, stock balance,
invoice, payment, accounting, or fiscal record. It only provisions the default warehouse and asset
category lookups required by inventory.

## Canonical demo seed

`demo-data/v1/manifest.json` is the source of truth for the synthetic reference workspace. It
contains schema/seed versions, per-file counts and SHA-256 checksums. Backend loading validates
Pydantic contracts and checksums; frontend generation consumes the same files. The canonical data
includes five customers, thirteen basic employees, six catalog categories, and twenty-two catalog
items with deterministic assignments across HQ, NORTH, DOWNTOWN, and EAST. Inventory adds 21 price
and cost profiles, 40 stock balances (six products and four supplies per branch), 16 physical
assets, and 35 opening movements. Future HR-only fields remain isolated in fixture metadata.

`schemaVersion` records the exact Alembic revision expected by that application build. After a new
migration is validated with the canonical seed, update the manifest and regenerate the frontend
snapshot with `npm run generate:demo`.

Run only in development or test with `DEMO_SEED_ENABLED=true`:

```bash
python -m app.scripts.seed_demo
```

The command is idempotent and uses stable UUIDs plus `demo_seed_registry`; it updates only entities
claimed by that registry. With the flag false it performs no writes. Password material always comes
from the local/test environment and is not present in fixtures.

## Runtime verification

Development and test environments expose `GET /dev/foundation`. It reads PostgreSQL and reports the
installed organization counts and enabled modules. The route is not registered in staging or
production.

`GET /health/ready` separately validates PostgreSQL connectivity and the expected Alembic revision
(`20260831_0010`). It returns `503` when the schema is incompatible; authenticated capabilities stay
in `/api/v1/auth/me` rather than readiness.

## Next design decision

The inventory backend and its canonical demo data are implemented. Frontend API/demo adapters and
the remaining cross-module sales and purchasing stories are tracked separately in the full-stack
Plan V2.
