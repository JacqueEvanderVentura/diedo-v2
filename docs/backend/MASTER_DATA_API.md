# Phase 2 shared master data API

This document is the source of truth for customers, basic employees, schedules, and their
attachments. It extends [GLOBAL.md](GLOBAL.md); authentication, error envelopes, serialization,
tenant scope, and pagination follow that contract.

## 1. Ownership and module access

- Customer routes belong to module `crm` and require `customer.read` or `customer.manage`.
- Employee routes belong to module `hr` and require `employee.read`, `employee.manage`, or
  `employee.schedule.manage`.
- A permission is ineffective unless its module entitlement is enabled and all module
  dependencies are available.
- Workspace-scoped grants can access every branch. Branch- and legal-entity-scoped grants only
  see records assigned to at least one permitted branch.
- `workspaceId`, the actor, and the uploader always come from the authenticated principal.
  Request bodies cannot override them.

## 2. Customers

### Routes

| Method | Route | Permission | Behavior |
|---|---|---|---|
| `GET` | `/api/v1/customers` | `customer.read` | Filtered, scoped, paginated list |
| `POST` | `/api/v1/customers` | `customer.manage` | Create and assign to visible branches |
| `GET` | `/api/v1/customers/{customerId}` | `customer.read` | Scoped detail |
| `PATCH` | `/api/v1/customers/{customerId}` | `customer.manage` | Versioned update or archive |
| `GET` | `/api/v1/customers/{customerId}/timeline` | `customer.read` | Stable projection contract for later domain events |

List filters are `search`, `name`, `phone`, `email`, `type`, `status`, `branchId`, `page`,
`pageSize`, `sortBy`, and `sortDirection`. The default excludes archived customers. `search`
matches normalized name, phone, and email.

Customer types are `person` and `business`; statuses are `active`, `inactive`, and `archived`.
Every customer must be assigned to at least one branch. A branch-scoped actor cannot read or
assign a customer outside the effective grant. Archiving uses `PATCH { "status": "archived",
"version": n }`; physical deletion is not exposed.

The timeline initially projects master-data lifecycle entries. Sales, appointments, CRM, and
payments can append authorized projections in later phases without changing the customer API.

## 3. Employees and schedules

### Routes

| Method | Route | Permission | Behavior |
|---|---|---|---|
| `GET` | `/api/v1/employees` | `employee.read` | Filtered, scoped, paginated list |
| `POST` | `/api/v1/employees` | `employee.manage` | Create a basic employee |
| `GET` | `/api/v1/employees/{employeeId}` | `employee.read` | Scoped detail |
| `PATCH` | `/api/v1/employees/{employeeId}` | `employee.manage` | Versioned update or archive |
| `GET` | `/api/v1/employees/{employeeId}/schedule` | `employee.read` | Read the versioned weekly schedule |
| `PUT` | `/api/v1/employees/{employeeId}/schedule` | `employee.schedule.manage` | Replace the complete weekly schedule |

The basic employee contract contains employee number, first/last name, email, phone, position,
department, contract type, hire date, assigned branches, supervisors, status, optional
`platformUserId`, timestamps, and versions. Salary, vacation balances, banking, payroll, debts,
and evaluations stay outside this basic contract. Implemented HR profiles, vacation requests,
employee debts, and documents are defined in [HR_API.md](HR_API.md); payroll and evaluations remain
separate future domains.

An employee can link to at most one platform user, and a platform user can link to at most one
employee in the workspace. The database requires that the platform user has a membership in that
same workspace. Supervisors must be different employees in the same workspace and visible scope.

Schedules use keys `mon` through `sun`; every value is a list of `{ start, end }` 24-hour blocks.
Blocks must be ordered, non-overlapping, and have `end > start`. `PUT` is a full replacement and
requires the current schedule `version`; stale writes return 409 with `parameter: "version"`.

## 4. Attachments

Each owner exposes the same nested routes; there is no generic unscoped upload endpoint.

| Method | Customer route | Employee route |
|---|---|---|
| `GET` | `/api/v1/customers/{id}/attachments` | `/api/v1/employees/{id}/attachments` |
| `POST` | `/api/v1/customers/{id}/attachments` | `/api/v1/employees/{id}/attachments` |
| `GET` | `/api/v1/customers/{id}/attachments/{attachmentId}/content` | `/api/v1/employees/{id}/attachments/{attachmentId}/content` |

Uploads use `multipart/form-data` with `file`, `classification`, and optional `retentionUntil`.
Allowed content types are PDF, JPEG, PNG, and WebP. The configured maximum is 10 MiB by default.
The service computes SHA-256 while streaming to the storage adapter, stores an opaque storage key,
and persists immutable metadata. The original filename is display metadata only; it is sanitized
and never used as a path or proof of type.

The local adapter writes outside tracked source files. A cloud adapter may replace it later without
changing domain routes or database metadata. Download always rechecks the owner's workspace,
branch scope, domain read permission, and attachment ownership.

## 5. Frontend data modes

- Online reads use these APIs and keep an in-memory last-known-good cache per operation.
- A later API failure returns that real cache as `stale`, visibly read-only; authenticated
  mutations never fall back to a local write.
- Explicit demo mode reads the canonical `demo-data/v1` snapshot and may mutate only the in-memory
  demo sandbox.
- The original customer and employee reference data remains in the canonical demo fixtures. It is
  not mixed with API rows and no customer or employee PII is persisted in `localStorage`.
- POS, Agenda, CRM, RRHH, mentions, and assignments consume the same customer/employee IDs from the
  shared stores. Local data for later phases remains available as isolated UI/demo overlays.

## 6. Conflicts and errors

- Validation uses 400; authentication 401; authorization or out-of-scope access 403; absent or
  hidden resources 404; duplicate links, invariant violations, and stale versions 409.
- Lists return `items`, `page`, `pageSize`, `totalItems`, and `totalPages`.
- Expected failures use `{ "message": "...", "parameter": "optionalField" }`.
