# Inventory API contract

The inventory module owns commercial pricing, warehouse stock, the immutable stock ledger, and
physical assets. It reuses catalog categories for products, supplies, and services. Assets use a
separate category table because their classification and lifecycle are different from commercial
items.

All JSON fields use `camelCase`. Collection responses use `items`, `page`, `pageSize`,
`totalItems`, and `totalPages`. Dynamic stock, movement, and summary responses are returned with
`Cache-Control: no-store`.

## Authorization and branch scope

- `inventory.read` grants summaries and visible lists.
- `inventory.manage` grants item, asset, and asset-category mutations.
- `inventory.move` grants outbound and adjustment movements.

Every operation is restricted to the authenticated workspace and the effective branch scope from
the caller's role assignments. A supplied `branchId` outside that scope returns 403. A resource in
another workspace or a concealed branch returns 404.

Each active branch has a default warehouse. `warehouseId` may be omitted on creates and movements;
the active default for `branchId` is then selected. Stock is stored per branch and warehouse, not
directly on the catalog item.

## Dashboard summaries

- `GET /api/v1/inventory/summary?branchId=` returns `totalProducts`, `totalSupplies`, `lowStock`,
  `outOfStock`, and `totalValue`.
- `GET /api/v1/inventory/assets/summary?branchId=` returns `totalValue`, `operational`, `inRepair`,
  and `retired`.

Inventory counts include non-archived products and supplies visible in the selected scope. Low
stock means aggregated quantity is greater than zero and less than or equal to the minimum;
out-of-stock means zero. Inventory value is quantity times unit cost, falling back to sale price
only for legacy rows without a cost. Asset value excludes assets whose status is `baja`.

## Warehouses and items

- `GET /api/v1/inventory/warehouses?branchId=` lists visible warehouses.
- `GET /api/v1/inventory/items` lists products, supplies, and services.
- `GET /api/v1/inventory/items/{itemId}?branchId=` returns one item and its stock locations.
- `POST /api/v1/inventory/products` creates a stock-tracked product.
- `POST /api/v1/inventory/supplies` creates a stock-tracked supply.
- `POST /api/v1/inventory/services` creates a service without stock.
- `PATCH /api/v1/inventory/items/{itemId}` updates commercial or stock-minimum data.

The item list accepts `branchId`, `search`, `itemType=product|supply|service`, `categoryId`,
`status`, `stockStatus=available|low|out`, `page`, `pageSize` (maximum 200), `sortBy`, and
`sortDirection`. Services report `stockStatus=not_tracked` and null stock quantities.

Common create fields are `name`, optional `description` and `sku`, `categoryId`,
`unitOfMeasureId`, `branchId`, optional `warehouseId`, and `status`. Product fields add
`salePrice`, `unitCost`, `taxRate`, `stock`, and `minimumStock`. Supplies require `unitCost` and
accept `stock` and `minimumStock`; they have no sale price or tax. Services require `salePrice`,
accept `taxRate`, and never create a stock balance.

An initial quantity greater than zero creates an `opening` ledger movement. Item PATCH requires
the current `version`. Changing `minimumStock` also requires `branchId`; `warehouseId` always
requires `branchId`. Quantity cannot be changed by PATCH: use an adjustment so every change remains
auditable.

## Assets

- `GET /api/v1/inventory/asset-categories` lists the independent asset taxonomy.
- `POST /api/v1/inventory/asset-categories` creates a workspace-wide category.
- `GET /api/v1/inventory/assets` lists visible physical assets.
- `POST /api/v1/inventory/assets` creates an asset.
- `GET /api/v1/inventory/assets/{assetId}` returns one asset.
- `PATCH /api/v1/inventory/assets/{assetId}` updates an asset with optimistic concurrency.

Local provisioning seeds `mobiliario`, `equipos`, `tecnologia`, `vehiculos`, `herramientas`, and
`otros`. Asset status is `activo`, `reparacion`, or `baja`. Create accepts `name`, optional `code`,
`categoryId`, `branchId`, `acquisitionValue`, `status`, optional `location`, optional
`purchaseDate`, and optional `notes`. Codes are uppercase and unique per workspace when present.
PATCH requires the current `version`.

The UI action “Dar de baja” uses the versioned asset PATCH with `status=baja`; physical assets are
not hard-deleted so their lifecycle and audit history remain available.

The asset list accepts `branchId`, `search`, `categoryId`, `status`, pagination, and allowlisted
sorting through `sortBy=name|code|category|status|value|createdAt`.

## Stock movements and usage

- `GET /api/v1/inventory/movements` lists ledger history.
- `GET /api/v1/inventory/movements/{movementId}` returns the header and immutable line snapshots.
- `POST /api/v1/inventory/movements/outbound` records a stock exit.
- `POST /api/v1/inventory/movements/adjustments` sets counted quantities.
- `GET /api/v1/inventory/supply-usage?branchId=` aggregates outbound supply usage by employee.

Outbound payloads require `branchId`, `employeeId`, and one to 100 unique lines shaped as
`{itemId, quantity}`. They may include `warehouseId`, `appointmentId`, and `comment`. The employee
must be active in the branch; an appointment, when provided, must belong to that employee and
branch. Stock cannot become negative.

Adjustment payloads require `branchId`, a non-empty `comment`, and lines shaped as
`{itemId, quantity}`, where quantity is the new physical count rather than a delta. A no-op
adjustment is rejected. Movement responses preserve `quantityBefore`, `quantityAfter`,
`quantityDelta`, item name/SKU/unit, and the unit-cost snapshot used at the time.

The movement list accepts `branchId`, `search`, `type=opening|outbound|adjustment|inbound`,
`itemId`, `employeeId`, `dateFrom`, `dateTo`, pagination, and sorting. `dateFrom` must not be after
`dateTo`.

## Idempotency, concurrency, and errors

Every item, asset, outbound, and adjustment POST requires `Idempotency-Key` (8..128 characters).
Repeating the same key and payload returns the original resource; reusing the key with different
content returns 409. Asset-category POST and PATCH operations are not retry-keyed.

Movement transactions lock affected stock rows in deterministic item-ID order. Concurrent exits
therefore cannot both consume the same last unit or produce negative stock. Item and asset PATCH
use required versions and return 409 for stale writes.

Expected errors use the shared `{message, parameter}` envelope: 400 for invalid operations, 401
for missing or invalid authentication, 403 for denied scope, 404 for absent or concealed
references, and 409 for duplicates, stale versions, idempotency conflicts, or insufficient stock.

## Canonical demo data

In development or test, `python -m app.scripts.seed_demo` loads the versioned
`demo-data/v1/inventory.json` fixture when `DEMO_SEED_ENABLED=true`. The repeat-safe seed provisions
the default warehouse in each canonical branch, 21 commercial profiles, 10 stock-tracked items and
four assets per branch, plus opening ledger movements for positive balances. Quantities deliberately
include available, low-stock, and out-of-stock cases. Demo managers receive all three inventory
permissions; supervisors can read and move stock, while cashier and seller profiles can read it.
