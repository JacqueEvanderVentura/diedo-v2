# Catalog API contract

This slice implements flat categories and branch-assigned products on top of the shared catalog
aggregate. Prices, costs, tax configuration, images, variants, stock balances, and movements are
deliberately deferred.

## Authentication and authorization

All catalog routes require the first-party Bearer JWT used by the IAM API. `catalog.read` grants
category and unit lookup plus product visibility. `catalog.manage` grants mutation within the
effective workspace/legal-entity/branch scopes resolved from the caller's role assignments.

Categories and units are workspace-wide reference data. A category mutation therefore requires a
workspace-wide `catalog.manage` grant. A branch-scoped caller can create or update a product only
when every current and requested branch is inside the caller's grant. Product reads return only
branch assignments visible to the caller. A known ID outside the workspace or visible branch scope
returns 404; filtering by a branch outside the grant returns 403.

## Categories

- `GET /api/v1/catalog/categories` lists categories.
- `POST /api/v1/catalog/categories` creates a category.
- `GET /api/v1/catalog/categories/{categoryId}` returns one category.
- `PATCH /api/v1/catalog/categories/{categoryId}` updates fields or lifecycle status.

Names are unique per workspace after whitespace and case normalization. Create accepts `name`,
optional `description`, and `status=active|inactive`. Patch requires `version` and at least one of
`name`, `description`, or `status=active|inactive|archived`. Archiving is rejected with 409 while a
non-archived product references the category.

## Products

- `GET /api/v1/catalog/products` lists visible products.
- `POST /api/v1/catalog/products` creates a product and its active branch assignments.
- `GET /api/v1/catalog/products/{productId}` returns one visible product.
- `PATCH /api/v1/catalog/products/{productId}` updates catalog fields, lifecycle, or assignments.

Create accepts `name`, optional `description` and `sku`, `categoryId`, `unitOfMeasureId`, one to 100
unique `branchIds`, and `status=active|inactive`. SKU is trimmed, uppercased, and unique per workspace
when present; multiple products may omit it. Patch requires `version` and at least one mutable field.
Branch replacement reactivates existing assignment rows and marks removed rows inactive instead of
deleting them.

`GET /api/v1/catalog/units-of-measure` returns the active, read-only workspace lookup. Local
provisioning installs unit, kilogram, gram, pound, liter, milliliter, meter, and centimeter entries.

## Pagination and filters

Category and product collections return `items`, `page`, `pageSize`, `totalItems`, and `totalPages`.
`pageSize` is bounded to 1..100. Both accept `search`, `status`, `sortBy`, and
`sortDirection=asc|desc`; products also accept `categoryId` and `branchId`. Sort fields are
allowlisted. Omitting status returns active and inactive rows while excluding archived rows.

## Conflicts, audit, and retries

Expected failures use the common `{message, parameter}` envelope. Validation is 400; missing or
invalid JWT is 401; denied scope is 403; absent or concealed resources are 404; duplicate names or
SKUs, stale versions, and category-in-use violations are 409. Successful writes append an audit
entry carrying the request ID and changed field metadata.

POST is not idempotent and does not accept an idempotency key in this slice. Clients must not retry
blindly: a repeated category name or non-null SKU is rejected, while two SKU-less product creates
are distinct operations. PATCH uses optimistic concurrency through the required `version` field.
