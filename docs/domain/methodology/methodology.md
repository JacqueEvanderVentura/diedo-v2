---
title: Methodology
status: active
tags: [methodology, evidence, privacy]
---

# Methodology

## Objective

Extract reusable business rules from the legacy application without treating its defects as product
requirements, then describe a replacement SaaS that supports multiple workspaces, legal entities,
and branches.

## Evidence hierarchy

1. **Observed UI behavior**: visible pages and blank forms inspected without submitting them.
2. **Observed configuration**: labels, available status filters, permissions, and calculations shown
   by the UI.
3. **Inferred client behavior**: route declarations and feature names found in the compiled frontend.
4. **Proposed domain behavior**: normalized rules based on the observed intent and ERP/CRM
   invariants.

The compiled frontend can establish that a capability or route exists, but cannot prove that the
workflow is complete, authorized, or backed by durable data.

## Rule template

Each domain rule must contain:

| Field | Meaning |
|---|---|
| Rule ID | Stable domain-prefixed identifier such as `POS-RULE-001` |
| Evidence | `Observed`, `Inferred`, `Proposed`, or `Gap` |
| Source | UI route, blank form, permission matrix, or bundle route |
| Actors | Human or system roles involved |
| Preconditions | Conditions that must hold before the rule applies |
| Behavior | Business decision or calculation |
| Failure | Rejection or conflict behavior |
| Effects | State changes and downstream domain events |

## Flow template

Every core flow documents actors and permissions, trigger, preconditions, happy path, alternate
paths, terminal states, calculations, invariants, cross-domain effects, and unresolved gaps.

## Read-only operating rules

- Allowed: navigate known routes, read list/detail screens, open and close blank forms, inspect
  labels and filters, and read static client assets.
- Forbidden: submit a form, change a state, open or close a cash session, pay or allocate money,
  approve or reject a request, export or import data, upload files, send messages, or change access.
- Never use production records as examples. Replace people, companies, identifiers, amounts, phone
  numbers, emails, addresses, and documents with fictitious values.
- Do not store screenshots from production in this vault.

## Product normalization policy

- Preserve a legacy behavior only when it expresses a coherent business requirement.
- Record contradictions in [[gap-register]] before proposing a corrected invariant.
- Keep user identity, employee profile, and customer profile separate even when the legacy UI links
  them.
- Keep workspace, legal entity, and branch distinct even when the legacy UI uses a single branch
  list for unrelated organizational concepts.
- Do not finalize an enum from a partial UI. Unknown values remain a gap.

## Review gates

1. Foundation and access-control vocabulary is validated.
2. Core commercial and operational flows are validated.
3. Optional packages and unverified modules are classified.
4. The logical ERD and data dictionary are approved before physical schema work begins.

