---
title: Data Dictionary
status: draft
tags: [data-model, dictionary]
---

# Data dictionary

This dictionary defines logical entities. Physical table/column names and SQL types are deferred.

## Foundation and access

| Entity | Owner/scope | Purpose and key invariants |
|---|---|---|
| PlatformUser | Platform | Authentication identity; no workspace access without membership. |
| Workspace | Platform/SaaS account | Subscription and isolation boundary; lifecycle is audited. |
| WorkspaceMembership | Workspace | Links one user to one workspace with invitation/access lifecycle. |
| LegalEntity | Workspace | Registered company; owns fiscal/payroll configuration and branches. |
| LegalEntityIdentity | Legal entity | Effective-dated registered name, jurisdiction, and typed identifiers. |
| Branch | Legal entity | Operating location; cannot be used as a financial liability or investment surrogate. |
| Role | Workspace | Editable permission collection; starter templates are not hard-coded behavior. |
| Permission | Platform catalog | Stable action code understood by authorization. |
| RolePermission | Workspace | Grants one permission to one workspace role. |
| RoleAssignment | Workspace | Connects membership, role, and exactly one access scope. |
| AccessScope | Workspace/legal entity/branch | Defines the resource boundary of an assignment. |
| ModuleDefinition | Platform catalog | Identifies a core or optional capability and dependency metadata. |
| ModuleEntitlement | Workspace | Effective activation/lifecycle for a module. |
| RegionalPack | Platform catalog | Jurisdiction-neutral package identity. |
| RegionalRuleVersion | Regional pack | Effective-dated tax, payroll, numbering, or validation configuration. |
| WorkspaceSetting | Workspace | Versioned workspace defaults with declared inheritance behavior. |
| Attachment | Workspace | Metadata/reference for stored content; access follows owning subject. |
| AuditEntry | Workspace/platform | Append-only actor, action, target, scope, time, request, and outcome evidence. |

## CRM and commercial

| Entity | Owner/scope | Purpose and key invariants |
|---|---|---|
| Party | Workspace | Deduplicated person or organization identity. |
| PartyIdentifier | Workspace/party | Typed identifier with jurisdiction and validity metadata. |
| CustomerAccount | Workspace/party | Commercial relationship, credit policy, and customer lifecycle. |
| LeadProfile | Workspace/party | Prospect metadata and qualification lifecycle. |
| PartyBranchAssociation | Workspace | Associates one customer with service/sales branches without duplicating the party. |
| Pipeline | Workspace | Configurable ordered sales process. |
| PipelineStage | Pipeline | Stable stage with order, open/won/lost classification, and transition policy. |
| Opportunity | Workspace | Potential sale with customer/lead, owner, stage, value, currency, priority, and optional branch. |
| OpportunityStageHistory | Opportunity | Append-only stage transition with actor, time, and reason. |
| CRMActivity | Workspace | Dated call/meeting/message/follow-up linked to party/opportunity. |
| Quote | Workspace | Quote series for one customer and optional opportunity. |
| QuoteVersion | Quote | Immutable sent/accepted commercial snapshot with validity and lifecycle. |
| QuoteLine | Quote version | Item/service description, quantity, unit price, discount, and estimated tax snapshot. |
| Sale | Workspace/legal entity/branch | Confirmed commercial transaction and totals snapshot. |
| SaleLine | Sale | Fulfilled item/service, price, discount, tax, quantity, and attribution snapshot. |
| Invoice | Legal entity | Commercial/fiscal charge document linked to a sale. |
| FiscalDocument | Legal entity | Numbered jurisdictional representation and lifecycle. |
| SellerAttribution | Sale line/sale | Defines employee/user credit for performance and commissions. |

## POS, payments, and receivables

| Entity | Owner/scope | Purpose and key invariants |
|---|---|---|
| Register | Branch | POS/cash operating point. |
| CashSession | Register/branch | Opening, closing count, expected cash, and variance lifecycle. |
| CashMovement | Cash session | Immutable cash inflow/outflow with typed source. |
| HeldCart | Branch/membership | Temporary unconfirmed cart; has no financial effect. |
| TenderType | Workspace/regional pack | Cash, card, transfer, link, or other tender definition. |
| Payment | Workspace | Customer/payment intent and lifecycle independent from sale content. |
| PaymentTender | Payment | Amount and state for one tender attempt. |
| PaymentAllocation | Payment | Allocates accepted money to invoice/receivable/credit targets. |
| Receivable | Customer account | Currency-specific balance container and credit lifecycle. |
| ReceivableCharge | Receivable | Immutable amount due, source, due date, and lifecycle. |
| CustomerCredit | Customer account | Accepted but unapplied money; prevents negative receivable balances. |
| Receipt | Sale/payment | Rendered representation metadata, not confirmation state. |

## Catalog, inventory, and appointments

| Entity | Owner/scope | Purpose and key invariants |
|---|---|---|
| Item | Workspace | Canonical product/service/membership definition. |
| ItemVariant | Item | Size or other stock/pricing variant. |
| ItemCategory | Workspace | Typed classification; category is not a substitute for financial posting. |
| UnitOfMeasure | Workspace/catalog | Quantity semantics and controlled conversion references. |
| ItemBranchAssignment | Branch/item | Effective availability and branch policy. |
| ItemPrice | Item/branch | Effective-dated amount, currency, price list, and override policy. |
| ItemCost | Item/branch | Effective acquisition/standard cost evidence; not an inventory valuation by itself. |
| InventoryLocation | Branch | Physical/logical stock location. |
| StockMovement | Workspace/location | Immutable signed quantity change with reason and source. |
| StockTransfer | Workspace | Groups balanced source/destination movements. |
| StockReservation | Item variant/location | Time-bounded claim against available quantity. |
| StockBalance | Projection | Derived on-hand/reserved/available values; never directly edited. |
| ReorderPolicy | Item/variant/location | Threshold and alert behavior. |
| StockAlert | Projection/workflow | Deduplicated low/out-of-stock condition. |
| Resource | Branch | Cabin, room, equipment, or capacity used by appointments. |
| AvailabilityRule | Employee/resource | Effective recurring schedule. |
| ScheduleException | Employee/resource | Leave, closure, maintenance, or one-off availability override. |
| Appointment | Branch/customer | Scheduled service lifecycle in branch time zone. |
| AppointmentService | Appointment | Requested/delivered service, duration, quantity, and pricing reference. |
| AppointmentAssignment | Appointment/employee | Staff responsibility and delivered-service attribution. |
| ResourceBooking | Appointment/resource | Time interval reservation preventing conflicting use. |
| NotificationAttempt | Appointment/CRM | Idempotent channel/template/event delivery record. |
| CommissionRule | Workspace | Effective percentage/fixed rule and explicit calculation base. |
| CommissionAccrual | Employee/source line | Snapshotted earned amount and lifecycle. |
| CommissionPaymentAllocation | Accrual/payment | Amount paid against approved accrual. |

## HR, finance, and incidents

| Entity | Owner/scope | Purpose and key invariants |
|---|---|---|
| Employee | Legal entity | HR identity distinct from user/customer. |
| Employment | Legal entity/employee | Employment lifecycle and dates. |
| EmploymentContract | Employment | Effective contract type, terms, and document reference. |
| EmployeeAssignment | Employee/branch | Effective position/department/branch assignment. |
| ReportingLine | Legal entity | Effective manager relationship. |
| CompensationVersion | Employment | Effective-dated salary/compensation terms. |
| EmployeeMembershipLink | Workspace | Optional validated employee-to-membership link. |
| LeavePolicy | Legal entity/regional pack | Entitlement, accrual, approval, and consumption rules. |
| LeaveLedgerEntry | Employee | Immutable entitlement accrual/consumption/adjustment. |
| LeaveRequest | Employee | Requested interval, type, approval, and lifecycle. |
| PayrollRun | Legal entity | Period and immutable finalization lifecycle. |
| PayrollResult | Payroll run/employee | Snapshotted earnings, deductions, employer cost, and net result. |
| GeneratedHRDocument | Employee/legal entity | Template/input/version/issuer snapshot and integrity reference. |
| FinancialCategory | Workspace | Operational income/expense classification. |
| IncomeRecord | Legal entity/branch | Manual or derived operational income reference; derived income must not duplicate sales. |
| Expense | Legal entity/branch | Amount, currency, category, date, approval/payment lifecycle, and evidence. |
| RecurringExpense | Legal entity/branch | Effective recurrence definition. |
| RecurringExpenseOccurrence | Recurring expense/period | Unique generated occurrence linked to an expense. |
| Budget | Legal entity/branch | Versioned amount by period/category/currency and ownership. |
| Liability | Legal entity | Principal, lender, terms, currency, and lifecycle. |
| LiabilityAllocation | Liability | Principal/interest/fee allocation from an approved payment. |
| FinancialAccount | Workspace/legal entity | Bank/cash/investment/other account and currency. |
| AccountMovement | Financial account | Immutable balance movement with source. |
| Incident | Workspace | Operational issue with priority, type, scope, and lifecycle. |
| IncidentSubject | Incident | Typed reference to asset, employee, transaction, or other subject. |
| IncidentAssignment | Incident/membership | Assigned responsibility. |
| IncidentStatusHistory | Incident | Append-only transition evidence. |

## Optional carwash package

| Entity | Owner/scope | Purpose and key invariants |
|---|---|---|
| Vehicle | Workspace | Vehicle identity and customer-association history. |
| CarwashWorkOrder | Branch | Service operation that references core customer, vehicle, item, sale, and payment records. |
| CarwashAssignment | Work order/employee | Washer or supervisor responsibility. |
| CarwashStatusHistory | Work order | Append-only operational transition. |
| CarwashQualityCheck | Work order | Verification/rework evidence before completion. |

## Reusable value concepts

| Concept | Required semantics |
|---|---|
| Money | Decimal amount plus ISO currency; no floating-point business arithmetic. |
| Effective period | Inclusive start and optional end with a rule preventing unintended overlaps. |
| Local interval | Local date/time, time zone, and derived UTC instants. |
| Quantity | Decimal quantity plus unit of measure and conversion context where allowed. |
| Typed identifier | Value, identifier type, issuer/jurisdiction, validity, and verification metadata. |
| Address/contact point | Typed, optionally verified, effective contact data; not duplicated into every transaction except snapshots. |
| Version | Optimistic-concurrency and event-ordering value on mutable aggregates. |

Related: [[logical-data-model]], [[database-handoff]].

