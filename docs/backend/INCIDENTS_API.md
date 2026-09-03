# Incidents API

This contract implements the current Incidencias frontend model: code, title, description, type,
priority, status, branch, optional asset, participants, image evidence, and activity. It extends
[GLOBAL.md](GLOBAL.md); authentication, camelCase serialization, error envelopes, workspace
isolation, branch scope, and optimistic concurrency follow that global contract.

## 1. Permissions

| Permission | Capability |
|---|---|
| `incidents.read` | List and read incidents, statistics, activity, participants, and images in scope |
| `incidents.create` | Report an incident in an authorized branch |
| `incidents.manage` | Change status, comment, and attach evidence in an authorized branch |

The `incidents` entitlement must be enabled. A resource outside the actor's branch scope is exposed
as `404`, not as a cross-tenant or cross-branch existence signal.

## 2. Values and invariants

- `type`: `activo`, `infraestructura`, `personal`.
- `priority`: `baja`, `media`, `alta`, `critica`.
- `status`: `abierta`, `en_proceso`, `resuelta`, `cerrada`.
- Una incidencia `personal` requiere `employeeId` y `employeeIncidentKind`; las categorías son
  `ausencia`, `tardanza`, `amonestacion`, `licencia_medica` y `otro`. El empleado debe estar activo
  y asignado a la sucursal de la incidencia.
- Los demás tipos no pueden relacionar un empleado. Las vacaciones se mantienen en solicitudes de
  RRHH para conservar una sola fuente de verdad.
- New reports start as `abierta` and receive a workspace-local `INC-NNNN` code.
- `activoId` is optional, but when present the type must be `activo`; the asset must be active and
  belong to the incident branch.
- Participant IDs are active workspace membership IDs. Reporter identity and author names come from
  the authenticated session, never from the request body.
- Create is retry-safe through `Idempotency-Key`. Status, comment, and attachment mutations require
  the latest `version` and return `409` when stale.

## 3. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/incidents` | Paginated list with search, type, priority, status, branch and date filters |
| `GET` | `/api/v1/incidents/stats` | `total`, `abiertas`, `enProceso`, and active `criticas` |
| `POST` | `/api/v1/incidents` | Create a report; requires `Idempotency-Key` |
| `GET` | `/api/v1/incidents/{incidentId}` | Read the full report |
| `PATCH` | `/api/v1/incidents/{incidentId}/status` | Change status and append an activity entry |
| `POST` | `/api/v1/incidents/{incidentId}/comments` | Append a comment |
| `POST` | `/api/v1/incidents/{incidentId}/attachments` | Upload one or more images as multipart form data |
| `GET` | `/api/v1/incidents/{incidentId}/attachments/{attachmentId}/content` | Authenticated inline image content for preview |

The list accepts `search`, `type`, `priority`, `status`, `branchId`, `dateFrom`, `dateTo`, `page`,
`pageSize`, `sortBy`, and `sortDirection`. List and statistics responses use `Cache-Control:
no-store`.

## 4. Frontend-compatible response

Each incident includes the existing view fields (`code`, `title`, `description`, `type`, `priority`,
`status`, `branchId`, `activoId`, `intervenientes`, `images`, `activity`, `createdAt`, `updatedAt`).
It also exposes `employee`, `employeeIncidentKind`, `reporter`, `attachments`, and `version`.
`images` contains the same preview URLs
present in `attachments[].previewUrl`, so the UI adapter can continue producing the current array of
image sources.

Because previews require Bearer authentication, a browser client should fetch each `previewUrl`
through the authenticated API client, create an object URL from the returned blob, use that object
URL as the `<img src>`, and revoke it when the component unmounts.

## 5. Temporary image persistence

Image bytes are intentionally stored in PostgreSQL `bytea` while the object-hosting decision is
open. The API accepts only JPEG, PNG, WEBP, and GIF, verifies file signatures, sanitizes filenames,
calculates SHA-256, and applies configurable per-file/per-request limits:

- `INCIDENT_IMAGE_MAX_BYTES` (default 5 MiB per image);
- `INCIDENT_IMAGE_MAX_FILES` (default 5 images per request).

The content endpoint returns the original bytes with `Content-Disposition: inline`, `ETag`, and a
private short-lived cache policy. A future object-storage migration can retain attachment IDs,
metadata, checksums, and preview URLs while moving only the binary storage adapter.

## 6. Demo data

The canonical `demo-data/v1/incidents.json` fixture contains eight deterministic reports covering
asset, infrastructure, and personnel incidents; open, in-progress, resolved, and closed states;
branch/user/asset relationships; participants; and activity history. `INC-1188` includes a
synthetic PNG evidence file whose bytes are persisted in `incident_attachments`.

Run the idempotent seed only in development or test:

```bash
python -m app.scripts.seed_demo
```

The seeder also advances `incident_counters` to at least `1193`, so a clean seeded workspace creates
the next incident as `INC-1194`. Re-running the seed updates its claimed records without duplicating
incidents, participants, activity, or attachments.
