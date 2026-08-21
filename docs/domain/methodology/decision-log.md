---
title: Decision Log
status: active
tags: [decisions]
---

# Decision log

| ID | Decision | Consequence |
|---|---|---|
| DOM-DEC-001 | Use `Workspace` instead of the legacy `tenant` vocabulary. | The logical isolation key is `workspace_id`; implementation may choose an equivalent name only through an explicit later decision. |
| DOM-DEC-002 | Model `Workspace -> LegalEntity -> Branch`. | A customer can operate several registered companies and several branches per company. |
| DOM-DEC-003 | Use a shared PostgreSQL schema for the future physical model. | Workspace isolation must be present in business keys, foreign keys, queries, authorization, and tests. |
| DOM-DEC-004 | Support custom roles and scoped assignments. | Legacy role names become starter templates, not fixed authorization logic. |
| DOM-DEC-005 | Keep user, employee, and customer identities separate. | Optional links do not merge authentication, HR, and commercial lifecycles. |
| DOM-DEC-006 | Deliver core capabilities plus optional vertical packages. | Vertical modules reuse shared customers, catalog, payments, employees, inventory, and documents. |
| DOM-DEC-007 | Make the Dominican Republic the first configurable regional pack. | ITBIS, RNC, fiscal documents, TSS, and INFOTEP do not leak into jurisdiction-neutral core entities. |
| DOM-DEC-008 | Document both `as-is` and `to-be`. | Legacy defects remain traceable but are not copied as requirements. |
| DOM-DEC-009 | Produce a logical ERD before physical schema work. | IDs, SQL types, indexes, migrations, and API wire shapes remain outside this delivery. |
| DOM-DEC-010 | Use English for all vault content and technical vocabulary. | Code and documentation share one canonical terminology. |

## Revisit triggers

- A requirement for regulatory or contractual database-level isolation may replace the shared-schema
  decision.
- A workspace that must contain only one legal entity may simplify, but must not flatten, the
  hierarchy.
- A jurisdiction other than the Dominican Republic must add a regional pack rather than fork core
  business domains.

