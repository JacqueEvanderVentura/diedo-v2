---
title: Logical Data Model
status: draft
tags: [data-model, erd]
---

# Logical data model

This model describes aggregate ownership, relationships, and durable invariants. It intentionally
does not choose SQL types, table names, primary-key technology, indexes, or migration details.

## Isolation contract

- `Workspace` is the top-level data boundary.
- Every workspace-owned aggregate carries `workspace_id` directly, even when the workspace could be
  reached through another relation.
- A reference between workspace-owned records is valid only when both records share the same
  workspace.
- Legal-entity and branch references must also agree with their hierarchy.
- Platform-owned identities and module definitions are the only ordinary records without a
  workspace owner; access to business data still requires membership and scope evaluation.

## Foundation ERD

```mermaid
erDiagram
    PLATFORM_USER ||--o{ WORKSPACE_MEMBERSHIP : has
    WORKSPACE ||--o{ WORKSPACE_MEMBERSHIP : grants
    WORKSPACE ||--o{ LEGAL_ENTITY : contains
    LEGAL_ENTITY ||--o{ BRANCH : operates
    WORKSPACE ||--o{ ROLE : defines
    ROLE ||--o{ ROLE_PERMISSION : includes
    PERMISSION ||--o{ ROLE_PERMISSION : grants
    WORKSPACE_MEMBERSHIP ||--o{ ROLE_ASSIGNMENT : receives
    ROLE ||--o{ ROLE_ASSIGNMENT : assigned_as
    ACCESS_SCOPE ||--o{ ROLE_ASSIGNMENT : limits
    WORKSPACE ||--o{ MODULE_ENTITLEMENT : activates
    MODULE_DEFINITION ||--o{ MODULE_ENTITLEMENT : enables
    REGIONAL_PACK ||--o{ REGIONAL_RULE_VERSION : versions
    LEGAL_ENTITY ||--o{ LEGAL_ENTITY_REGIONAL_RULE : selects
    REGIONAL_RULE_VERSION ||--o{ LEGAL_ENTITY_REGIONAL_RULE : applies
    WORKSPACE ||--o{ AUDIT_ENTRY : records
```

`AccessScope` points to exactly one workspace, legal entity, or branch and always belongs to the same
workspace as the membership and role assignment.

## Commercial ERD

```mermaid
erDiagram
    WORKSPACE ||--o{ PARTY : owns
    PARTY ||--o{ PARTY_IDENTIFIER : identified_by
    PARTY ||--o| CUSTOMER_ACCOUNT : acts_as
    PARTY ||--o| LEAD_PROFILE : may_have
    CUSTOMER_ACCOUNT ||--o{ PARTY_BRANCH_ASSOCIATION : served_at
    BRANCH ||--o{ PARTY_BRANCH_ASSOCIATION : serves
    WORKSPACE ||--o{ PIPELINE : configures
    PIPELINE ||--o{ PIPELINE_STAGE : contains
    CUSTOMER_ACCOUNT ||--o{ OPPORTUNITY : has
    PIPELINE_STAGE ||--o{ OPPORTUNITY : current_stage
    OPPORTUNITY ||--o{ OPPORTUNITY_STAGE_HISTORY : transitions
    OPPORTUNITY ||--o{ CRM_ACTIVITY : schedules
    CUSTOMER_ACCOUNT ||--o{ QUOTE : receives
    OPPORTUNITY ||--o{ QUOTE : proposes
    QUOTE ||--|{ QUOTE_VERSION : versions
    QUOTE_VERSION ||--|{ QUOTE_LINE : contains
    QUOTE_VERSION ||--o| SALE : accepted_as
    CUSTOMER_ACCOUNT ||--o{ SALE : purchases
    SALE ||--|{ SALE_LINE : contains
    SALE ||--o| INVOICE : billed_by
    INVOICE ||--o{ RECEIVABLE_CHARGE : charges
    RECEIVABLE ||--o{ RECEIVABLE_CHARGE : contains
    PAYMENT ||--|{ PAYMENT_TENDER : uses
    PAYMENT ||--o{ PAYMENT_ALLOCATION : allocates
    RECEIVABLE ||--o{ PAYMENT_ALLOCATION : receives
```

`QuoteVersion -> Sale` is optional and idempotent. Manual/POS sales do not require a quote.

## Operations ERD

```mermaid
erDiagram
    WORKSPACE ||--o{ ITEM : owns
    ITEM ||--o{ ITEM_VARIANT : varies_as
    ITEM ||--o{ ITEM_BRANCH_ASSIGNMENT : offered_at
    BRANCH ||--o{ ITEM_BRANCH_ASSIGNMENT : offers
    ITEM ||--o{ ITEM_PRICE : priced_by
    ITEM ||--o{ ITEM_COST : costed_by
    BRANCH ||--o{ INVENTORY_LOCATION : contains
    ITEM_VARIANT ||--o{ STOCK_MOVEMENT : moved
    INVENTORY_LOCATION ||--o{ STOCK_MOVEMENT : posts_at
    STOCK_TRANSFER ||--|{ STOCK_MOVEMENT : groups
    ITEM_VARIANT ||--o{ STOCK_RESERVATION : reserves
    INVENTORY_LOCATION ||--o{ STOCK_BALANCE : projects
    ITEM_VARIANT ||--o{ STOCK_BALANCE : projects
    BRANCH ||--o{ RESOURCE : provides
    CUSTOMER_ACCOUNT ||--o{ APPOINTMENT : books
    BRANCH ||--o{ APPOINTMENT : hosts
    APPOINTMENT ||--|{ APPOINTMENT_SERVICE : requests
    APPOINTMENT ||--o{ APPOINTMENT_ASSIGNMENT : assigns
    EMPLOYEE ||--o{ APPOINTMENT_ASSIGNMENT : performs
    RESOURCE ||--o{ RESOURCE_BOOKING : reserves
    APPOINTMENT ||--o{ RESOURCE_BOOKING : uses
    SALE_LINE ||--o{ COMMISSION_ACCRUAL : generates
    EMPLOYEE ||--o{ COMMISSION_ACCRUAL : earns
    COMMISSION_RULE ||--o{ COMMISSION_ACCRUAL : snapshots
```

`StockBalance` is a projection of posted movements and is not independently editable.

## HR, finance, and incidents ERD

```mermaid
erDiagram
    LEGAL_ENTITY ||--o{ EMPLOYEE : employs
    EMPLOYEE ||--o{ EMPLOYMENT_CONTRACT : contracted_by
    EMPLOYEE ||--o{ EMPLOYEE_ASSIGNMENT : assigned
    BRANCH ||--o{ EMPLOYEE_ASSIGNMENT : receives
    EMPLOYEE ||--o| EMPLOYEE_MEMBERSHIP_LINK : links
    WORKSPACE_MEMBERSHIP ||--o| EMPLOYEE_MEMBERSHIP_LINK : links
    EMPLOYEE ||--o{ LEAVE_REQUEST : requests
    EMPLOYEE ||--o{ LEAVE_LEDGER_ENTRY : accrues
    PAYROLL_RUN ||--|{ PAYROLL_RESULT : produces
    EMPLOYEE ||--o{ PAYROLL_RESULT : receives
    LEGAL_ENTITY ||--o{ PAYROLL_RUN : processes
    WORKSPACE ||--o{ FINANCIAL_ACCOUNT : owns
    FINANCIAL_ACCOUNT ||--o{ ACCOUNT_MOVEMENT : posts
    BRANCH ||--o{ EXPENSE : incurs
    RECURRING_EXPENSE ||--o{ RECURRING_EXPENSE_OCCURRENCE : generates
    RECURRING_EXPENSE_OCCURRENCE ||--o| EXPENSE : materializes
    BUDGET ||--o{ EXPENSE : constrains
    LIABILITY ||--o{ LIABILITY_ALLOCATION : receives
    EXPENSE ||--o{ LIABILITY_ALLOCATION : funds
    WORKSPACE ||--o{ INCIDENT : owns
    INCIDENT ||--o{ INCIDENT_SUBJECT : references
    INCIDENT ||--o{ INCIDENT_ASSIGNMENT : assigns
    INCIDENT ||--|{ INCIDENT_STATUS_HISTORY : transitions
    ATTACHMENT ||--o{ INCIDENT_ATTACHMENT : supplies
    INCIDENT ||--o{ INCIDENT_ATTACHMENT : includes
```

## Optional-package extension ERD

```mermaid
erDiagram
    WORKSPACE ||--o{ MODULE_ENTITLEMENT : activates
    MODULE_DEFINITION ||--o{ MODULE_ENTITLEMENT : identifies
    CUSTOMER_ACCOUNT ||--o{ VEHICLE : associates
    BRANCH ||--o{ CARWASH_WORK_ORDER : operates
    VEHICLE ||--o{ CARWASH_WORK_ORDER : serviced_in
    ITEM ||--o{ CARWASH_WORK_ORDER : service_item
    EMPLOYEE ||--o{ CARWASH_ASSIGNMENT : performs
    CARWASH_WORK_ORDER ||--|{ CARWASH_ASSIGNMENT : assigns
    CARWASH_WORK_ORDER ||--o| SALE : fulfilled_as
    CARWASH_WORK_ORDER ||--|{ CARWASH_STATUS_HISTORY : transitions
```

Unverified packages must add their own ERD only after passing the discovery gate in
[[unverified-verticals]].

## Aggregate and transaction boundaries

| Aggregate | Owns atomic decisions | Does not own |
|---|---|---|
| Workspace | lifecycle, configuration roots, entitlement references | user authentication credentials, business transactions |
| Membership/role assignment | workspace access and scope | employee lifecycle |
| Opportunity | stage and activity relationship | quote versions, sale/payment truth |
| Quote | version sequence and quote lifecycle | confirmed sale inventory/payment effects |
| Sale | confirmed line/price/tax snapshot | external tender settlement, stock balance |
| Payment | tender attempts and allocations | invoice/sale content |
| Cash session | opening/closing and cash movements | non-cash settlement |
| Item | catalog identity and policies | inventory quantity |
| Stock movement/transfer | immutable quantity change | mutable catalog definition |
| Appointment | schedule, assignments, outcome | sale/payment and commission payout |
| Employee/employment | HR relationship and effective terms | authentication and financial account movements |
| Expense/liability/account | each aggregate's operational ledger | full accounting journal until the optional accounting package exists |
| Incident | incident lifecycle and evidence links | mutation of referenced domain resources |
| Carwash work order | vertical operational lifecycle | duplicated customer, employee, sale, or payment truth |

## Common logical attributes

Every workspace-owned aggregate root includes logical identity, `workspace_id`, lifecycle/version,
created/updated timestamps, and audit actor/correlation context. Legal-entity and branch scope is
included where ownership or reporting requires it. Money always includes currency; time intervals
include a time-zone interpretation; configurable rules carry effective dates and version references.

Related: [[data-dictionary]], [[database-handoff]], [[cross-domain-flows]].

