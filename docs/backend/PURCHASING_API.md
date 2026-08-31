# Purchasing API

The purchasing module persists suppliers, authorized branch assignments, purchase requests with
line items, approval/delivery state, and workspace-level approval settings. JSON contracts use
camelCase and expected failures use `{message, parameter}`.

## Authorization and scope

- `purchasing.read`: lists visible suppliers, requests, statistics, and settings.
- `purchasing.suppliers.manage`: creates, updates, deactivates, and archives suppliers.
- `purchasing.requests.create`: creates requests and edits pending requests.
- `purchasing.requests.review`: approves/rejects pending requests and marks approved requests as
  delivered.
- `purchasing.settings.manage`: changes global purchasing settings and therefore requires a
  workspace-wide grant.

Supplier visibility is the intersection of its authorized branches and the caller's effective
branch scope. Requests are scoped by their branch. IDs from another workspace or concealed scope
return 404. Supplying an out-of-scope branch returns 403.

## Endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/purchasing/suppliers` | Paginated supplier list with branch, search, active, and sorting filters. |
| POST | `/api/v1/purchasing/suppliers` | Create a supplier; requires `Idempotency-Key`. |
| GET | `/api/v1/purchasing/suppliers/{supplierId}` | Read one visible supplier. |
| PATCH | `/api/v1/purchasing/suppliers/{supplierId}` | Versioned supplier update. |
| DELETE | `/api/v1/purchasing/suppliers/{supplierId}` | Archive a supplier while retaining request history. |
| GET | `/api/v1/purchasing/requests/stats` | Total and status counters, optionally by branch. |
| GET | `/api/v1/purchasing/requests` | Paginated requests with branch, supplier, status, priority, search, and sorting filters. |
| POST | `/api/v1/purchasing/requests` | Create a pending request; requires `Idempotency-Key`. |
| GET | `/api/v1/purchasing/requests/{requestId}` | Read request header, lines, total, quote name, and lifecycle timestamps. |
| PATCH | `/api/v1/purchasing/requests/{requestId}` | Edit a pending request with optimistic versioning. |
| POST | `/api/v1/purchasing/requests/{requestId}/review` | Set `aprobada` or `rechazada`. |
| POST | `/api/v1/purchasing/requests/{requestId}/deliver` | Move `aprobada` to `entregada`. |
| GET | `/api/v1/purchasing/settings` | Read designated approver and notification preference. |
| GET | `/api/v1/purchasing/settings/approvers` | List active members allowed to review purchase requests. |
| PUT | `/api/v1/purchasing/settings` | Replace settings with optimistic versioning. |

Lists accept `page` and `pageSize` (maximum 200) and return `items`, `page`, `pageSize`,
`totalItems`, and `totalPages`. Dynamic list/stat/settings reads send `Cache-Control: no-store`.

## Business rules

- A supplier needs at least one active authorized branch. Name is unique per workspace; a non-null
  RNC/tax identifier is also unique among non-archived suppliers.
- A request must contain 1–100 positive-quantity lines and use an active supplier authorized for
  its branch. Monetary amounts are non-negative decimals; `total` is computed from persisted lines.
- Status transitions are `pendiente → aprobada/rechazada` and `aprobada → entregada`.
- Only the configured approver membership may review when one is designated. Delivery still
  requires the review permission.
- `version` prevents stale supplier, request, review, delivery, and settings writes. Reusing an
  `Idempotency-Key` with different create content returns 409.

## Demo data

In development/test, `python -m app.scripts.seed_demo` loads
`demo-data/v1/purchasing.json`. The repeat-safe fixture installs two suppliers, their branch
assignments, two purchase requests (pending and approved), three line items, quote metadata, and a
designated approver. The same fixture is included in the generated frontend demo snapshot.
