# Backoffice workspace provisioning API

`POST /api/v1/backoffice/workspaces` creates one isolated workspace for an entrepreneur and grants
that owner the workspace-wide `workspace_admin` role. The operation also creates the standard role
templates, enables every currently available module, and installs the base payment methods, units,
CRM settings, and purchasing settings in one database transaction.

This is a platform operation. It does not use a tenant JWT because no tenant exists yet. Enable it
with a random `BACKOFFICE_API_KEY` of at least 32 characters and send that value only over HTTPS in
the `X-Backoffice-Key` header. Keep it separate from `JWT_SECRET_KEY`, do not expose it to a browser,
and rotate it if it is disclosed. If the setting is absent, the endpoint returns HTTP 503.
At the infrastructure edge, restrict this route to the operator network or VPN when possible.

Example request:

```http
POST /api/v1/backoffice/workspaces HTTP/1.1
Content-Type: application/json
X-Backoffice-Key: <secret>

{
  "slug": "persona-b",
  "name": "Empresas de Persona B",
  "defaultCurrency": "BOB",
  "timezone": "America/La_Paz",
  "locale": "es-BO",
  "taxDefaultRate": 0,
  "owner": {
    "email": "propietario@example.com",
    "displayName": "Persona B",
    "password": "una-clave-inicial-segura"
  }
}
```

The password is required only when the email is a new platform identity. If the person already has
an account in another workspace, omit `owner.password`; the existing global credential is kept and
the person can switch workspaces after login. An existing identity without an active password is
rejected so an unusable owner is never attached. Passwords and the backoffice key are never
returned.

`slug` is the stable, lowercase workspace identifier. A duplicate slug returns HTTP 409. The
workspace is deliberately created without a fake company or branch. The owner can then create each
real business through `POST /api/v1/legal-entities` and each location through
`POST /api/v1/branches`. A branch request may also create its legal entity inline.

## Recommended business mapping

- One workspace per entrepreneur or business group.
- One legal entity per distinct registered company or tax identity.
- One branch per operating location.

For example, if CHARM is one registered company with four locations, create one CHARM legal entity
and four branches. If two businesses have different tax identities, keep them as two legal entities
even when the UI presents both as locations in the same workspace.

The current fiscal-profile contract accepts Dominican Republic `DO` / `RNC` identities. Supporting
registered companies from other jurisdictions requires extending that separate fiscal contract;
the workspace boundary itself is country-neutral.
