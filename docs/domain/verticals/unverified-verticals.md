---
title: Unverified Vertical Packages
status: unverified
tags: [vertical, gaps]
---

# Unverified vertical packages

The compiled client declares these capabilities, but the provided manager account was redirected or
the relevant routes required identifiers or tokens. Their presence is **Inferred**; business behavior
is **Unverified** and must not be implemented from route names alone.

## Package candidates

| Package | Bundle/UI evidence | Allowed shared dependencies | Package-owned concepts to validate |
|---|---|---|---|
| Aesthetics clinic | `/estetica-clinica`, patient/form/evaluation routes, public evaluation token | Party/customer, appointments, employees, catalog services, sales, attachments | Patient clinical profile, consent, assessment form/version, answer set, treatment record, stricter sensitive-data access |
| Restaurant | `/restaurant` | Catalog, inventory, POS, cash, employees, branches | Table/seat, order course, kitchen ticket, modifier, recipe, fulfillment state |
| Vehicle sales | `/vehiculos`, inventory and quote routes | Party/customer, CRM opportunity, quote, sale, payment, documents | Vehicle unit/VIN, acquisition, inspection, listing, reservation, sale transfer |
| Projects | `/proyectos`, task and detail routes | Memberships, employees, attachments, incidents | Project, milestone, task, dependency, assignment, time/status history |
| OKR/DoWay | `/okr`, `/doway` | Memberships, employees, projects, reports | Objective, key result, check-in, progress measurement, cadence |
| Purchasing | `/compras` | Parties/vendors, catalog, inventory, finance, attachments | Supplier, purchase request/order, receipt, vendor invoice, payable |
| Advanced accounting | `/contabilidad/*` routes for chart, journals, periods, tax, reconciliation, closing, receivables/payables, audit and reports | Finance events, legal entities, regional packs | Account, journal, journal entry, fiscal period, reconciliation, close, posting rule |
| SaaS billing/payments | `/payments/*`, `/subscriptions`, `/pay/:subscriptionId` | Workspace, entitlement, platform identity | Plan, subscription, billing invoice, platform payment, webhook event, entitlement transition |
| Personalization | `/personalizacion` | Workspace settings and entitlements | Theme/brand configuration only; must not fork business logic |

## Inclusion rules

| Rule | Evidence | Behavior |
|---|---|---|
| VERTICAL-RULE-001 | Proposed | A package is activated through a workspace module entitlement. |
| VERTICAL-RULE-002 | Proposed | A package may add owned aggregates but references core identities, branches, catalog, payments, attachments, employees, and audit entries. |
| VERTICAL-RULE-003 | Proposed | Package deactivation preserves readable history and blocks new operations according to entitlement policy. |
| VERTICAL-RULE-004 | Proposed | Package permissions use the shared scoped authorization model. |
| VERTICAL-RULE-005 | Proposed | A package cannot duplicate sale, payment, receivable, inventory, employee, or customer sources of truth. |
| VERTICAL-RULE-006 | Proposed | Sensitive vertical data, especially clinical information, may impose stricter retention, encryption, and access policies than ordinary CRM data. |

## Discovery gate

Before any package moves from `Unverified` to `Draft`:

1. Obtain authorized read-only UI or legacy-source evidence.
2. Identify actors, aggregate boundaries, states, commands, calculations, and failure paths.
3. Confirm which core events it consumes and publishes.
4. Add package-specific privacy and regulatory requirements.
5. Validate a package ERD that does not duplicate core sources of truth.

Related: [[coverage-matrix]], [[gap-register]], [[saas-foundation]], [[logical-data-model]].

