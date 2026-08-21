---
title: Cross-Domain Flows
status: draft
tags: [flows, integration, events]
---

# Cross-domain flows

These diagrams describe domain ownership and required effects. They do not prescribe synchronous
HTTP calls, message brokers, or microservices. The replacement starts as a modular monolith; domain
events may initially be handled in-process within the same transaction or by a durable post-commit
worker when external effects require it.

## FLOW-001 — Workspace onboarding

Source of truth: foundation and IAM. See the complete flow in [[saas-foundation]].

```mermaid
sequenceDiagram
    actor Owner
    participant Foundation
    participant Regional
    participant IAM
    participant Modules

    Owner->>Foundation: create workspace and legal entity
    Owner->>Regional: activate jurisdiction rules
    Owner->>Foundation: create branch
    Owner->>IAM: invite members and assign scoped roles
    Owner->>Modules: activate core and optional entitlements
    Modules-->>Owner: workspace readiness checklist
```

Invariant: no operational command is accepted until the relevant legal entity, branch, entitlement,
regional configuration, membership, permission, and scope are active.

## FLOW-002 — Lead to receivable/payment

Source of truth: CRM for opportunity/quote, Sales for sale/invoice, Payments for money allocation.

```mermaid
sequenceDiagram
    actor Seller
    participant CRM
    participant Catalog
    participant Tax
    participant Sales
    participant Payments
    participant Inventory
    participant Finance

    Seller->>CRM: qualify lead and manage opportunity
    CRM->>Catalog: price proposed items/services
    CRM->>Tax: estimate quote taxes
    Seller->>CRM: send quote version
    CRM->>Sales: accept quote idempotently
    Sales->>Tax: snapshot confirmed tax result
    Sales->>Inventory: request fulfillment movements
    Sales->>Payments: collect tender or open receivable
    Payments->>Finance: publish tender/allocation effects
    Sales-->>CRM: publish confirmed customer purchase
```

Failure rules: quote acceptance retry returns the original sale; payment failure does not mark the
invoice paid; inventory failure follows an explicit reservation/negative-stock policy rather than
silently losing a movement.

## FLOW-003 — POS sale to operational ledgers

Source of truth: Sales/POS, Payments, Cash, Inventory, and Finance each own their respective records.

```mermaid
flowchart LR
    A[Confirm POS sale] --> B[Create immutable sale snapshot]
    B --> C[Record tender or receivable]
    C --> D{Cash tender?}
    D -- Yes --> E[Append cash-session movement]
    D -- No --> F[Record non-cash tender state]
    B --> G[Append stock movements]
    B --> H[Issue fiscal document]
    C --> I[Update payment allocations]
    E --> J[Finance and reconciliation projections]
    F --> J
    G --> K[Stock balance and alert projections]
    H --> L[Customer receipt/history]
    I --> L
```

Invariant: failures cannot leave a confirmed sale without a recorded payment/receivable decision and
inventory/fiscal intents. External settlement may remain pending, but its state is explicit.

## FLOW-004 — Appointment to commission

Source of truth: Agenda owns the schedule, Sales owns the charge, Commissions owns earnings.

```mermaid
sequenceDiagram
    actor Scheduler
    actor Employee
    participant Agenda
    participant Sales
    participant Inventory
    participant Commission
    participant Finance

    Scheduler->>Agenda: confirm service, staff and resources
    Employee->>Agenda: complete delivered services
    Agenda->>Sales: create or fulfill sale idempotently
    Sales->>Inventory: consume configured materials
    Sales->>Commission: provide eligible service snapshot
    Commission->>Commission: resolve effective rule and accrue
    Commission->>Finance: request approved payout allocation
```

Invariant: changing the current commission rule does not recalculate historical accruals.

## FLOW-005 — Catalog to stock alert

Source of truth: Catalog owns definitions/policies; Inventory owns quantities.

```mermaid
flowchart LR
    A[Create catalog item] --> B[Assign branch, price, tax and stock policy]
    B --> C[Configure variants and locations]
    C --> D[Post receipt/opening movement]
    D --> E[Post sale, consumption, transfer or adjustment]
    E --> F[Rebuild on-hand and available projections]
    F --> G{Available at or below threshold?}
    G -- Yes --> H[Open/deduplicate stock alert]
    G -- No --> I[Resolve existing alert]
```

Invariant: no command writes an arbitrary stock balance; all changes append a movement.

## FLOW-006 — Employee to payroll/document/self-service

Source of truth: HR owns employment; IAM owns access; regional pack owns statutory rules.

```mermaid
sequenceDiagram
    actor HRAdmin
    participant HR
    participant IAM
    participant Agenda
    participant Regional
    participant Payroll
    participant Finance

    HRAdmin->>HR: create employment and effective contract
    HRAdmin->>IAM: link optional membership and scoped role
    HR->>Agenda: publish assignments and approved absences
    Payroll->>HR: read effective compensation and leave inputs
    Payroll->>Regional: resolve effective statutory rule version
    Payroll->>Payroll: finalize immutable employee results
    Payroll->>Finance: create payroll liabilities/payment instructions
```

Invariant: terminating employment and revoking workspace membership are coordinated but separate
commands with independent audit histories.

## FLOW-007 — Recurring expense to reporting

Source of truth: Finance; optional Accounting consumes approved events.

```mermaid
flowchart LR
    A[Effective recurring-expense definition] --> B[Generate unique period occurrence]
    B --> C[Submit and approve expense]
    C --> D[Record payment/account movement]
    C --> E[Allocate budget consumption]
    C --> F{Liability allocation?}
    F -- Yes --> G[Apply principal/interest allocation]
    F -- No --> H[No liability change]
    D --> I[Finance projections]
    E --> I
    G --> I
    I --> J[Optional accounting posting]
    I --> K[Reports with scope, period and currency]
```

Invariant: the occurrence uniqueness key prevents duplicate monthly expenses after retries.

## FLOW-008 — Incident resolution

Source of truth: Incidents; referenced domains retain ownership of their resources.

```mermaid
flowchart LR
    A[Report incident] --> B[Classify type, priority and subject]
    B --> C[Assign intervening users]
    C --> D[Start work]
    D --> E[Record resolution]
    E --> F{Reviewer accepts?}
    F -- No --> D
    F -- Yes --> G[Close incident]
    G --> H{Recurs or resolution fails?}
    H -- Yes --> I[Reopen with reason]
    I --> D
    H -- No --> J[Retain closed history]
```

Invariant: closure does not mutate the referenced asset, employee, or transaction unless an
authorized command in that owning domain is executed.

## FLOW-009 — Carwash work order

Source of truth: Carwash owns the work order while core domains own shared records.

```mermaid
sequenceDiagram
    actor Reception
    participant Carwash
    participant CRM
    participant Catalog
    participant HR
    participant Sales
    participant Commission

    Reception->>CRM: select or create customer
    Reception->>Carwash: identify vehicle
    Carwash->>Catalog: select branch-enabled service and price
    Carwash->>HR: validate washer and supervisor assignments
    Reception->>Carwash: register work order
    Carwash->>Carwash: progress through operational states
    Carwash->>Sales: create or fulfill sale at completion
    Sales->>Commission: accrue washer/supervisor earnings
```

## Domain event catalog

| Event | Producer | Primary consumers |
|---|---|---|
| `WorkspaceActivated` | Foundation | IAM, module entitlements, onboarding projection |
| `MembershipRevoked` | IAM | Session/access cache, audit, employee self-service |
| `QuoteAccepted` | CRM | Sales |
| `SaleConfirmed` | Sales/POS | Inventory, finance, CRM history, commissions, reporting |
| `PaymentAccepted` | Payments | Receivables, cash session, finance, reporting |
| `PaymentReversed` | Payments | Receivables, cash session, finance, reporting |
| `StockMovementPosted` | Inventory | Stock balances, alerts, reporting |
| `AppointmentCompleted` | Agenda | Sales, commissions, employee performance |
| `LeaveApproved` | HR | Agenda availability, payroll |
| `PayrollFinalized` | HR/Payroll | Finance, documents, optional accounting |
| `ExpenseApproved` | Finance | Budget, liability suggestion, optional accounting |
| `IncidentClosed` | Incidents | Reporting and subject-domain notification only |
| `CarwashWorkOrderCompleted` | Carwash | Sales, commissions, reporting |

Events include aggregate ID, workspace ID, occurred-at UTC timestamp, actor/correlation context,
aggregate version, and event schema version. Sensitive payloads use references rather than copying
personal or clinical data.

