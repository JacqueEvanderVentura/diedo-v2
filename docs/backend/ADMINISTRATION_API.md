# Foundation administration API

Status: administration core implemented and verified on 2026-08-29; Phase 1 remains reopened.

The branch/legal-entity/fiscal slice is operational, but phase closure still requires complete
API/demo parity, legal-entity archival, the invitation story, and the remaining Plan V2 gates.

All routes use Bearer authentication, camelCase JSON, effective module/permission checks and the
common `{message, parameter}` error envelope. Mutable records expose `version`; stale writes return
HTTP 409.

| Method | Route | Permission | Purpose |
|---|---|---|---|
| GET/PATCH | `/api/v1/workspace/settings` | `workspace.read/update` | Read/update name, currency, locale, timezone and default tax rate. |
| GET/PATCH | `/api/v1/legal-entities/{id}` | `legal_entity.read/manage` | Read/update the workspace-owned legal entity. |
| GET/POST | `/api/v1/branches` | `branch.read/manage` | List visible branches or create one workspace-wide. |
| PATCH/DELETE | `/api/v1/branches/{id}` | `branch.manage` | Update or archive a branch. |
| GET/POST | `/api/v1/payment-methods` | `workspace.read/update` | List or create workspace payment methods. |
| PATCH/DELETE | `/api/v1/payment-methods/{id}` | `workspace.update` | Update or archive a payment method. |

## Rules

- Workspace settings and legal-entity updates require workspace-wide scope.
- Branch reads honor the effective branch/legal-entity/workspace hierarchy.
- Branch codes and payment-method codes are unique per workspace.
- At least one active branch must remain.
- System payment methods can be disabled but not archived.
- Partner shares in branch configuration cannot exceed 100%.
- DELETE operations are logical archive transitions and require the current `version` query value.

The frontend gateways block mutations unless their most recent read is `ready` from API. A cached
`stale` or explicit `demo` response is read-only.
