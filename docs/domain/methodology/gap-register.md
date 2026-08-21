---
title: Gap Register
status: active
tags: [gaps, anomalies]
---

# Gap register

| ID | Evidence | As-is observation | Risk or contradiction | To-be direction | Status |
|---|---|---|---|---|---|
| GAP-001 | Observed: `/configuracion/sucursales` | The branch list appears to include operating locations, investments, financing arrangements, and other concepts. | A flat branch model cannot reliably own inventory, employees, fiscal identity, or financial reporting. | Separate workspace, legal entity, branch, financial account, investment, and liability concepts. | Open |
| GAP-002 | Observed: `/pos/cuentas-por-cobrar` | A displayed receivable can show paid value greater than total and a negative pending amount. | Overpayment, allocation, or inconsistent denormalized totals are not represented safely. | Derive outstanding balance from immutable charge and payment allocations; represent unapplied credit separately. | Proposed |
| GAP-003 | Observed: dashboard/inventory | Many items have missing SKU values and zero or low stock alerts. | Missing identifiers and permissive negative stock can make replenishment and audit unreliable. | Require a workspace-unique catalog code where operationally necessary and use a stock ledger with explicit negative-stock policy. | Open |
| GAP-004 | Observed: `/crm/clientes` and `/crm/pipeline` | Summary totals and detail lists can disagree or remain loading. | Dashboard projections may use different stores or filters from detail data. | Define one query contract per metric with workspace, scope, time zone, and status semantics. | Open |
| GAP-005 | Observed: `/rrhh` vs `/rrhh/directorio` | HR overview and directory returned different employee availability under the same session. | Inconsistent collection ownership or branch filtering can hide employees. | Establish legal-entity ownership and explicit branch assignment/history for employees. | Open |
| GAP-006 | Observed: `/rrhh/solicitudes` | Leave management requires a user-to-employee link. | A user can authenticate but cannot perform employee self-service without explicit linkage. | Keep the link optional but validate it for employee-only use cases and expose an administrative remediation flow. | Proposed |
| GAP-007 | Observed: `/configuracion/permisos` | Fixed roles and mutable permission cells coexist. | Role names may be mistaken for hard-coded authorization. | Use custom roles, permission codes, scoped assignments, and immutable platform-only permissions. | Proposed |
| GAP-008 | Observed: `/configuracion/region` | One currency change is described as instant and workspace-wide. | Existing documents and balances cannot safely be re-denominated by changing a display preference. | Store transaction currency and exchange context; treat default currency changes as prospective configuration. | Proposed |
| GAP-009 | Observed: `/configuracion/nomina` | Payroll contribution percentages are manually configurable. | Silent retroactive changes can alter prior payroll calculations. | Version payroll rules by jurisdiction and effective date; snapshot applied rules on payroll runs. | Proposed |
| GAP-010 | Observed: `/reportes/membresias` | Membership activity is inferred from a payment in the last 30 days. | A fixed rolling window cannot represent varied terms, pauses, renewals, or cancellations. | Model subscription/membership terms and entitlement periods explicitly. | Open |
| GAP-011 | Observed: redirected and empty routes | Several modules exist in navigation or bundle but are inaccessible or empty. | Presence in client code does not prove implemented business logic. | Keep them as unverified optional packages until privileged evidence or legacy source is available. | Open |
| GAP-012 | Observed: quote form | ITBIS is a single 18% switch while POS indicates tax may be configured per item. | Quote and sale tax calculations can diverge. | Use the same versioned tax engine for quotes, invoices, and POS line items. | Proposed |
| GAP-013 | Observed: expense and payment-method configuration | Income categories, payment methods, liabilities, and expenses are directly associated. | Direct category coupling may duplicate financial postings or reduce auditability. | Separate operational transaction, tender, classification, allocation, and accounting posting concepts. | Open |
| GAP-014 | Observed: user form | A user is created with a password inside workspace administration. | Workspace administrators should not own raw credentials or account lifecycle across workspaces. | Platform identity handles authentication; invitations create memberships and scoped role assignments. | Proposed |

## Evidence needed later

- Administrator or source-code evidence for redirected modules.
- Exact opportunity, appointment, incident, carwash, payment, and document state transitions.
- Fiscal document numbering and cancellation rules.
- Inventory transfer, adjustment, reservation, and valuation semantics.
- Payroll periods, earnings, deductions, employer contributions, and posting behavior.
- Refund, void, chargeback, overpayment, and credit-note behavior.

