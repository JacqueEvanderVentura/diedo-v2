# Identity and access API

Status: IAM core implemented and verified on 2026-08-29; Phase 1 remains reopened.

This document describes the implemented IAM slice, not closure of the whole phase. Production
invitation delivery, resend/re-invitation, the public acceptance UI, and the full second-session
invitation story remain pending.

This slice implements the backend contracts required by the reference Users and Permissions
screens. It extends the foundation schema without introducing CRM, sales, inventory, or accounting
business tables.

## Security model

- Human sessions use a short-lived HS256 JWT access token in memory and a rotating opaque refresh
  token delivered only in an HttpOnly cookie. The cookie is Secure outside development/test.
- The backend cookie path is `/api/v1/auth`. In local Vite development it is rewritten to
  `/api-backend/api/v1/auth`, matching the public proxy prefix; logout clears the cookie using the
  same path. Third-party search proxies remove `Cookie` before forwarding a request.
- PostgreSQL stores only a SHA-256 digest of each refresh token. Rotation detects replay; logout,
  password changes and membership suspension revoke server-side sessions immediately.
- The access token identifies `sub` (platform user), `wid` (workspace), `mid` (membership), and
  `sid` (session). A client cannot select another user or workspace through business-route
  parameters.
- Login accepts only email and password. The backend selects the sole active membership or the
  internally configured primary membership; clients cannot submit a workspace identifier.
- PostgreSQL permits at most one primary membership per platform identity. If multiple active
  memberships exist without one unambiguous primary, login fails instead of selecting a tenant
  arbitrarily.
- Every protected request revalidates the platform user, workspace membership, workspace lifecycle,
  server-side session, role permission, assignment scope and module entitlement. Permission or
  entitlement changes therefore take effect without waiting for an access token to expire.
- Passwords use Argon2 through `pwdlib`. Passwords and raw refresh tokens are never stored or logged.
- Permissions are stable codes. UI labels are presentation metadata and never authorize an action.
- API keys are intentionally not accepted by these human administration routes. Future
  machine-to-machine integrations require a separate service-account/API-key capability with
  independent scopes, rotation, audit, and rate limits.

Production must provide a random `JWT_SECRET_KEY` of at least 32 characters, terminate TLS, and add
credential-stuffing/rate-limit controls at the selected gateway or ingress. The application rejects
the local development JWT key in staging and production.

## Scope evaluation

`Workspace -> LegalEntity -> Branch` remains the durable hierarchy. A membership can have multiple
role assignments with workspace, legal-entity or branch scope. The effective session preserves the
three levels; `primaryRole` is only a deterministic presentation field.

`effectivePermissionCodes` is the union of permissions usable at any effective scope.
`workspacePermissionCodes` contains only permissions granted by an active workspace assignment and
an enabled module. Frontends must use the latter for global mutations such as category management
and role-definition changes; the union cannot prove global authority.

A manager with `membership.read` on branch A can see users whose assignments overlap A, including a
workspace administrator, but cannot see a user assigned only to branch B. A user creator also cannot
assign branches or role permissions beyond their own effective access on each selected branch.

## Routes

All JSON fields use `camelCase`. Expected errors use the common `{message, parameter}` envelope.

| Method | Route | Authentication | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Public | Verify email/password, return access token and set refresh cookie. |
| POST | `/api/v1/auth/refresh` | HttpOnly cookie | Rotate the refresh cookie and return a new access token. |
| POST | `/api/v1/auth/logout` | Bearer | Revoke the current server-side session. |
| GET | `/api/v1/auth/me` | Bearer | Return identity, workspace, assignments, scope, branches, permissions and modules. |
| GET | `/api/v1/auth/workspaces` | Bearer | List active workspaces for the platform identity. |
| POST | `/api/v1/auth/switch-workspace` | Bearer | Rotate the session into another active membership. |
| POST | `/api/v1/auth/change-password` | Bearer | Change own password and revoke other sessions. |
| PATCH | `/api/v1/auth/profile` | Bearer | Update the global display name. |
| GET | `/api/v1/auth/sessions` | Bearer | List active sessions for the identity. |
| DELETE | `/api/v1/auth/sessions/{sessionId}` | Bearer | Revoke an owned session. |
| GET | `/api/v1/users` | `membership.read` | Search, filter, sort, and paginate visible users. |
| GET | `/api/v1/users/summary` | `membership.read` | Return total, active, administrator, and inactive counts. |
| GET | `/api/v1/users/form-options` | `membership.manage` | Return assignable roles, legal entities, and active branches within scope. |
| POST | `/api/v1/users` | `membership.manage` | Create identity, membership, password, and scoped role assignments. |
| GET/PATCH | `/api/v1/users/{membershipId}` | `membership.read/manage` | Read or update status and assignments with versioning. |
| POST | `/api/v1/users/invitations` | `membership.manage` | Create a one-use, expiring invitation. The raw token is omitted unless explicit local demo mode is enabled. |
| POST | `/api/v1/users/invitations/accept` | Public token | Activate the invited membership. New identities must send `password`; existing identities must omit it and retain their global credential. |
| DELETE | `/api/v1/users/invitations/{invitationId}` | `membership.manage` | Revoke a pending invitation. |
| POST | `/api/v1/users/{membershipId}/password-reset` | `membership.manage` | Reset a single-workspace identity and revoke all of that identity's sessions. Multi-workspace identities require a global verified flow. |
| GET | `/api/v1/roles` | `role.read` | List active roles and granted-permission counts. |
| GET | `/api/v1/roles/summary` | `role.read` | Return granted counts and percentages for role summary cards. |
| GET | `/api/v1/permissions/matrix` | `role.read` | Return dynamic module/action rows and grants by role. |
| PUT | `/api/v1/roles/permissions:batch` | workspace-wide `role.manage` | Atomically replace the grants of multiple versioned roles. |
| PUT | `/api/v1/roles/{roleId}/permissions` | workspace-wide `role.manage` | Idempotently replace grants using optimistic versioning. |
| GET | `/api/v1/lookups/roles` | `membership.manage` | Return assignable roles as `{id, name}` options. |
| GET | `/api/v1/lookups/branches` | `branch.read` | Return in-scope active branches as `{id, name}` options. |

### Login

`POST /api/v1/auth/login` accepts only `email` and `password`. Workspace membership is internal
authorization state, not a credential-form choice. A newly created user receives its first
membership as primary. The selected workspace and membership are embedded in the signed access
token and revalidated on every protected request. Neither login nor refresh serializes a raw refresh
token in JSON.

`GET /api/v1/auth/me` is the canonical frontend identity. It includes `workspace`,
`roleAssignments`, `primaryRole`, `visibleBranches`, `effectiveScope`,
`effectivePermissionCodes`, `workspacePermissionCodes` and `enabledModules`. Switching workspace
revokes the previous auth session so its access token cannot continue reading the old tenant.

Invitation tokens are delivery secrets. Normal API responses never expose them; a mail or equivalent
out-of-band channel must deliver the token to the invited address. Only `APP_ENV=development|test`
combined with `DEMO_SEED_ENABLED=true` exposes `acceptToken` for explicit local demo flows. The
accept request always sends `token`; `password` is required only when the invitation created a new
platform identity. An existing identity proves possession through the unexposed delivery token,
must omit `password`, and keeps its existing global credential unchanged.

The out-of-band delivery adapter is not implemented yet, so invitations are not operable in a
normal production configuration even though the token is correctly hidden. Resend/re-invitation is
also pending: an expired or revoked placeholder cannot yet be recovered through a dedicated
endpoint. The frontend still needs a public acceptance route that consumes the accept contract.

Administrative password reset is intentionally conservative: if the platform identity has any
membership row in more than one workspace, the workspace endpoint returns `409` and a future global
verified recovery flow must be used. A permitted reset revokes every session for the platform
identity, not only sessions for the membership named in the URL.

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

The request accepts only `displayName`, `email`, `password`, and `roleAssignments[]`. Every
assignment contains `roleId`, `scopeType`, and the matching `legalEntityId` or `branchId` when the
scope is not workspace-wide. Status, workspace, identity IDs, permission codes, and actor IDs cannot
be mass-assigned. Passwords require 12 to 128 characters. Email uniqueness is case-insensitive
across platform identities.

The system `workspace_admin` role is a global administrator contract and therefore accepts only
`scopeType=workspace`; create, update, and invitation requests reject branch or legal-entity
pseudo-admin assignments with `409 roleAssignments`. Scoped administrators must use another role
whose permissions remain bounded by its assignment scope. For the same reason,
`GET /api/v1/users/form-options` omits `workspace_admin` when the caller is not workspace-wide.

Rows created through the superseded `roleId + branchIds` contract are not promoted automatically.
Selecting every branch is still not equivalent to workspace scope because new branches may be
created later. A current workspace administrator must explicitly repair an affected membership
through `PATCH /api/v1/users/{membershipId}` with a versioned `workspace_admin` assignment at
`scopeType=workspace`; that update revokes the target membership's active sessions. This deliberate
operator action avoids turning legacy branch authority into global authority during deployment.

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

`PUT /api/v1/roles/permissions:batch` accepts the same complete replacement for several roles and
commits all of them in one transaction. A stale role, an unknown permission, or an unauthorized
grant rejects the whole batch without a partial save.

### Role summary and user-form lookups

`GET /api/v1/roles/summary` returns `totalPermissions` once and a `roles` collection containing each
role's `id`, `code`, `name`, `permissionCount`, and rounded integer `permissionPercentage`. Counts
include only non-platform permissions from modules that are not deprecated, matching the permission
matrix.

The two `/api/v1/lookups` routes deliberately return only `id` and `name`. Role options require
`membership.manage`; branch options require `branch.read` so read-only filters do not imply user
administration. Both remain limited to the caller's effective scope.

## Starter catalog

Local bootstrap creates five editable starter roles: Administrador, Gerente, Supervisor, Cajero,
and Vendedor. Administrador receives the currently installed foundation, IAM and catalog
permissions; every
other starter role begins deny-by-default. The permission matrix is data-driven, so later modules add
their stable permission codes without changing the endpoint contract.
