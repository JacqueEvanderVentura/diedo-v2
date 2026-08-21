---
title: Database Handoff
status: ready-for-domain-review
tags: [handoff, database, api]
---

# Database handoff

This note defines the gate between the logical model and a later PostgreSQL/SQLAlchemy/Alembic/API
implementation. No physical schema or public API is introduced by the current delivery.

## Locked domain decisions

- Shared PostgreSQL schema with an explicit workspace isolation key on every business aggregate.
- `Workspace -> LegalEntity -> Branch` hierarchy.
- Platform user, workspace membership, employee, and customer are separate entities.
- Custom roles, stable permission codes, and workspace/legal-entity/branch role-assignment scopes.
- Core domains remain sources of truth; optional packages extend rather than duplicate them.
- Dominican Republic rules are a versioned regional pack.
- Confirmed money, stock, status, and fiscal history uses append-only entries or explicit reversals.
- Reports are projections and never independent transaction sources.

## Future backend module boundaries

The modular monolith should group code by capability once implementation begins:

1. Foundation: workspaces, legal entities, branches, settings, entitlements, audit.
2. Identity/access: platform identities, memberships, roles, permissions, scopes.
3. Regional rules: tax, fiscal documents, payroll rules, currency configuration.
4. Parties/CRM: parties, customers, leads, opportunities, activities, quotes.
5. Sales/payments: sales, invoices, tenders, allocations, receivables, cash sessions.
6. Catalog/inventory: items, pricing, variants, locations, movement ledger, alerts.
7. Appointments/commissions: scheduling, resources, completion, accruals.
8. HR/payroll: employment, assignments, leave, payroll, generated documents.
9. Finance: income/expense, recurrence, budgets, liabilities, accounts.
10. Incidents/reporting and optional package modules such as carwash.

Application services own transactions. API schemas and persistence mappings remain separate, as
required by the backend global contract.

## Physical schema requirements for the next phase

- Choose one canonical ID strategy and use it consistently; do not reuse legacy Firebase IDs as the
  new primary-key policy.
- Add `workspace_id` to business primary/unique/reference constraints even where it appears
  transitively available.
- Prefer composite foreign keys that include `workspace_id` for workspace-owned relationships so a
  cross-workspace reference is impossible at the database boundary.
- Enforce legal-entity/branch ownership using durable foreign keys or a validated ownership table;
  authorization checks alone are insufficient.
- Use `NOT NULL`, foreign keys, unique constraints, checks, and explicit delete behavior for durable
  invariants.
- Store UTC-aware durable timestamps and retain local date/time/time-zone context for schedules and
  reporting periods.
- Store monetary amounts as fixed precision plus currency and quantities as fixed precision plus
  unit semantics.
- Use effective-date overlap constraints where rule or assignment versions must not overlap.
- Add optimistic versions to mutable aggregates that can be concurrently edited.
- Make ledger records immutable at the application layer and restrict destructive database access.
- Derive indexes from documented query shapes after route/API design; do not pre-index every foreign
  key or filter speculatively.

## Suggested migration order

1. Platform identity references, workspace, legal entity, branch, regional-pack selection.
2. Membership, role, permission, assignment/scope, entitlement, audit, attachment metadata.
3. Party/customer and catalog foundations.
4. CRM opportunity/activity/quote aggregates.
5. Sales, payments, receivables, cash sessions, and fiscal documents.
6. Inventory locations, movements, balances/projections, and alerts.
7. Appointments, resources, employee foundation, and commissions.
8. HR leave/payroll/documents.
9. Finance and incidents.
10. Optional packages and reporting projections.

Each vertical slice requires an Alembic revision, persistence tests against PostgreSQL, domain unit
tests, and API contract tests before the next dependent slice.

## Future API contract requirements

- JSON uses `camelCase`, Python/PostgreSQL use `snake_case`, and paths use lowercase kebab-case.
- Authentication and workspace selection are explicit; clients never supply an unchecked
  `workspaceId` to gain scope.
- Authorization resolves membership, permission, assignment scope, and resource ownership.
- Retry-prone creation/confirmation/payment operations require idempotency keys.
- Mutable aggregate commands define optimistic-concurrency behavior and return `409` on stale or
  invariant conflicts.
- Pagination, filter, sort, date-range, branch, and currency semantics are bounded and documented.
- Expected failures use the repository's common error envelope and do not reveal cross-workspace
  resource existence.
- ORM entities are never public response contracts.

## Required test scenarios

### Isolation and access

- A membership in workspace A cannot read or reference any workspace B resource, even by a known ID.
- A branch-scoped assignment cannot access another branch in the same legal entity.
- A legal-entity assignment spans its branches but not sibling legal entities.
- Removing a membership revokes access without deleting employee/customer/history records.
- A role administrator cannot grant permissions outside their own administrative authority.

### Commercial and money

- Repeated quote acceptance or sale confirmation is idempotent.
- Quote and sale tax calculations use the same effective rule version and preserve snapshots.
- Split tender allocations equal the accepted payment amount.
- Overpayment becomes unapplied customer credit or is rejected; outstanding receivable never becomes
  negative.
- Cash close preserves movements and records variance rather than rewriting expected cash.
- Void/refund/reversal paths produce compensating records.

### Inventory and operations

- Sale, transfer, adjustment, and reversal produce the expected stock-ledger legs.
- Cross-workspace or cross-branch-invalid stock movements fail at the database and application layers.
- Negative stock requires item policy and actor permission.
- Appointment conflicts account for employee and resource availability in the branch time zone.
- Commission accrual uses the rule snapshot and is not changed by later rule edits.

### HR, finance, and reporting

- Employee self-service fails safely without a valid employee-membership link.
- Effective compensation/payroll/regional rule versions are applied by payroll period.
- Recurring expense generation is unique per recurrence/period.
- Liability and budget allocations reconcile to their source expense/payment.
- Dashboard and detail report totals share one metric definition, scope, period, currency, and
  freshness contract.

## Implementation gate

Physical implementation may start only after business review resolves the high-impact open items in
[[gap-register]]: complete state machines, tax/fiscal numbering, returns/refunds, inventory valuation
and purchasing, leave/payroll rules, accounting scope, and vertical-package evidence.

Related: [[logical-data-model]], [[data-dictionary]], [[decision-log]].

