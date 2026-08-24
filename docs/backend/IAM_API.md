# Identity and access API

Status: implemented locally on 2026-08-23.

This slice implements the backend contracts required by the reference Users and Permissions
screens. It extends the foundation schema without introducing CRM, sales, inventory, or accounting
business tables.

## Security model

- Human sessions use a short-lived HS256 JWT access token and a rotating opaque refresh token.
- PostgreSQL stores only a SHA-256 digest of each refresh token. Logout revokes the server-side
  session immediately.
- The access token identifies `sub` (platform user), `wid` (workspace), `mid` (membership), and
  `sid` (session). A client cannot select another user or workspace through business-route
  parameters.
- Login accepts only email and password. The backend selects the sole active membership or the
  internally configured primary membership; clients cannot submit a workspace identifier.
- PostgreSQL permits at most one primary membership per platform identity. If multiple active
  memberships exist without one unambiguous primary, login fails instead of selecting a tenant
  arbitrarily.
- Every protected request revalidates the platform user, workspace membership, workspace lifecycle,
  server-side session, role permission, and assignment scope. Permission changes therefore take
  effect without waiting for an access token to expire.
- Passwords use Argon2 through `pwdlib`. Passwords and raw refresh tokens are never stored or logged.
- Permissions are stable codes. UI labels are presentation metadata and never authorize an action.
- API keys are intentionally not accepted by these human administration routes. Future
  machine-to-machine integrations require a separate service-account/API-key capability with
  independent scopes, rotation, audit, and rate limits.

Production must provide a random `JWT_SECRET_KEY` of at least 32 characters, terminate TLS, and add
credential-stuffing/rate-limit controls at the selected gateway or ingress. The application rejects
the local development JWT key in staging and production.

## Scope evaluation

`Workspace -> LegalEntity -> Branch` remains the durable hierarchy. A role assignment can have a
workspace, legal-entity, or branch scope. The current create-user contract assigns one selected role
to one or more branch scopes, matching the reference modal.

A manager with `membership.read` on branch A can see users whose assignments overlap A, including a
workspace administrator, but cannot see a user assigned only to branch B. A user creator also cannot
assign branches or role permissions beyond their own effective access on each selected branch.

## Routes

All JSON fields use `camelCase`. Expected errors use the common `{message, parameter}` envelope.

| Method | Route | Authentication | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Public | Verify email/password and issue an access/refresh pair. |
| POST | `/api/v1/auth/refresh` | Public refresh token | Rotate the refresh token and issue a new access token. |
| POST | `/api/v1/auth/logout` | Bearer | Revoke the current server-side session. |
| GET | `/api/v1/auth/me` | Bearer | Return the identity and workspace bound to the token. |
| GET | `/api/v1/users` | `membership.read` | Search, filter, sort, and paginate visible users. |
| GET | `/api/v1/users/summary` | `membership.read` | Return total, active, administrator, and inactive counts. |
| GET | `/api/v1/users/form-options` | `membership.manage` | Return assignable roles and in-scope active branches. |
| POST | `/api/v1/users` | `membership.manage` | Create identity, membership, password, and scoped role assignments. |
| GET | `/api/v1/roles` | `role.read` | List active roles and granted-permission counts. |
| GET | `/api/v1/permissions/matrix` | `role.read` | Return dynamic module/action rows and grants by role. |
| PUT | `/api/v1/roles/{roleId}/permissions` | workspace-wide `role.manage` | Idempotently replace grants using optimistic versioning. |

### Login

`POST /api/v1/auth/login` accepts only `email` and `password`. Workspace membership is internal
authorization state, not a credential-form choice. A newly created user receives its first
membership as primary. The selected workspace and membership are embedded in the signed access
token and revalidated on every protected request.

### User list query

`GET /api/v1/users` accepts:

- `search` (maximum 100 characters), matched case-insensitively against name and normalized email;
- `status=active|inactive`;
- `roleId` and `branchId`;
- `page` and bounded `pageSize` (`1..100`);
- `sortBy=displayName|email|lastAccessAt|status`;
- `sortDirection=asc|desc`.

The response contains `items`, `page`, `pageSize`, `totalItems`, and `totalPages`. Each row exposes the
membership ID, platform-user ID, name, email, initials, role, visible branches, last access, and the
derived active/inactive status. Query construction uses allowlisted sorting, parameterized filters,
bounded pagination, a count query, and batched assignment/branch reads rather than per-row queries.

### Create user

The request accepts only `displayName`, `email`, `password`, `roleId`, and `branchIds`. Status,
workspace, identity IDs, permission codes, and actor IDs cannot be mass-assigned. Passwords require
12 to 128 characters. Email uniqueness is case-insensitive across platform identities.

Creating a user is a single application-owned transaction and writes a security audit entry without
including the password. An existing platform email returns `409`; linking an existing identity to a
new workspace is deliberately deferred to a verified invitation flow so this endpoint cannot take
over an account by email.

### Permission replacement

`PUT /api/v1/roles/{roleId}/permissions` accepts the complete `permissionIds` set plus the role
`version`. A stale version returns `409`. Missing IDs return `404`. The actor cannot grant a
permission they do not possess, and a branch-scoped role administrator cannot mutate a
workspace-wide role definition. The system Administrador role must retain the four IAM permissions
needed to view/manage users and roles, preventing an accidental workspace lockout.

## Starter catalog

Local bootstrap creates five editable starter roles: Administrador, Gerente, Supervisor, Cajero,
and Vendedor. Administrador receives the currently installed foundation and IAM permissions; every
other starter role begins deny-by-default. The permission matrix is data-driven, so later modules add
their stable permission codes without changing the endpoint contract.
