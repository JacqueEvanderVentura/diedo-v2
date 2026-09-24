# Chat go-live (Fase 6)

Status: Development live path. Tokens never leave the backend. `wa.me` in Agenda/CRM stays as-is.
Production frontend CI now builds with `VITE_FEATURE_CHAT=true` (nav `/chat` visible after Worker deploy).

## Public URLs (Railway API)

Use the **direct API host**, not the Cloudflare Worker/`/api-backend` proxy. Meta must reach FastAPI.

| Use | URL |
|---|---|
| OAuth callback (already verified) | `https://api-production-b1fb.up.railway.app/api/v1/chat/oauth/meta/callback` |
| Webhook (GET verify + POST events) | `https://api-production-b1fb.up.railway.app/api/v1/webhooks/meta` |
| After OAuth, users land on | Origin of the tab that clicked **Conectar** (must be in `CORS_ORIGINS`), else `PUBLIC_APP_URL` + `/configuracion?open=chat-canales` |

## Railway variables (service `api`)

| Variable | Notes |
|---|---|
| `META_APP_ID` | App **helios360omnichannel** (Facebook Login / WhatsApp) |
| `META_APP_SECRET` | App secret; used to verify `X-Hub-Signature-256` |
| `META_INSTAGRAM_APP_ID` | Instagram App ID from Instagram Login setup (not the Facebook App ID) |
| `META_INSTAGRAM_APP_SECRET` | Instagram App Secret from the same panel |
| `META_WHATSAPP_CONFIG_ID` | Optional. Facebook Login for Business / WhatsApp Embedded Signup configuration ID |
| `META_WEBHOOK_VERIFY_TOKEN` | Random string you invent; same value in Meta webhook settings |
| `META_OAUTH_REDIRECT_URI` | Exact OAuth callback URL above |
| `META_GRAPH_API_VERSION` | `v21.0` unless Meta requires a newer version |
| `PUBLIC_APP_URL` | **Set this to `https://app.helios360erp.com` now.** Fallback if the start request has no allowed origin. Also used for email links. Never leave this on `workers.dev`. |
| `CORS_ORIGINS` | Must include `https://app.helios360erp.com` (and `workers.dev` if you still use that host). |

Do not put Meta secrets in `frontend/.env` or Worker vars.

## Meta Developers — webhook

1. App → **WhatsApp** → **Configuration** (or **Webhooks**) and **Instagram** → **Webhooks**.
2. Callback URL: `https://api-production-b1fb.up.railway.app/api/v1/webhooks/meta`
3. Verify token: same as `META_WEBHOOK_VERIFY_TOKEN`.
4. Subscribe the **`messages`** field (WhatsApp Cloud). For Instagram Messaging subscribe **messages** (inbox DMs). Delivery `statuses` may arrive on the same WhatsApp field; the API acknowledges them and ignores non-text.
5. Click **Verify and save**. GET must return `hub.challenge` with HTTP 200 text/plain.
6. After a workspace **Connects** WhatsApp, Helios calls Graph `POST /{waba-id}/subscribed_apps` so that WABA delivers `object=whatsapp_business_account` to Railway. Instagram already did `/{ig-user-id}/subscribed_apps`. If you connected WhatsApp before this existed, **Connect again** (pick the number). HELIOS matches `phone_number_id` to `chat_channel_accounts.provider_account_id`.

If verify fails: Railway has the token, the URL is HTTPS, and you are not pointing Meta at `app.helios360erp.com/api-backend/...`.

## Meta Developers — Facebook Login and Instagram Login

- WhatsApp: **Facebook Login** (or **Facebook Login for Business**) → Valid OAuth Redirect URIs = `META_OAUTH_REDIRECT_URI`. WhatsApp Cloud **never** uses whatsapp.com OAuth; the dialog is Facebook on purpose.
- Optional: create a WhatsApp **Embedded Signup** configuration and set Railway `META_WHATSAPP_CONFIG_ID` so Helios opens Login for Business instead of a generic Facebook Login.
- Instagram: **Instagram → API setup with Instagram login → Business login settings → OAuth redirect URIs** = the same callback. Do not request `instagram_business_*` scopes on `facebook.com/dialog/oauth` (Meta returns Invalid Scopes).
- If the dashboard shows a separate Instagram App ID, set **`META_INSTAGRAM_APP_ID` / `META_INSTAGRAM_APP_SECRET` on Railway (required).** Instagram Login rejects the Facebook App ID (`Invalid platform app`) and rejects Page scopes (`pages_show_list`).

## Subscribe testers (Development mode)

Until App Review is **Live**, only testers/admins of the Meta app can DM the connected IG/WABA.

1. App roles: add testers (Facebook users).
2. Instagram: professional/creator account that will Connect must be added under Instagram API setup testers (or the admin’s IG). A Facebook Page is **not** required for Instagram Login.
3. WhatsApp: add the tester’s phone under WhatsApp → **API Setup** → to numbers (Development).

## Live Development test (do this once per channel)

Prerequisites: account **Connected** in Configuración, at least one branch assigned, user has `chat.read` / `chat.send`, and `VITE_FEATURE_CHAT=true` on the **build you are testing** (local or a non-prod frontend). Production nav stays hidden while the flag is false.

1. From a tester IG account, send a text DM to the connected professional IG.
2. Open `/chat`, select the branch, confirm the thread appears within ~12 s (polling) or after refresh.
3. Reply from HELIOS within 24 h. The customer should receive the text on Instagram.
4. Repeat with WhatsApp Cloud (tester number → business number).
5. Replay: Meta may retry the same webhook; HELIOS must not duplicate `provider_message_id` (already covered by tests).

Failures to inspect in Railway logs (no tokens in these lines):

- `meta webhook verify rejected`
- `meta webhook rejected: invalid signature`
- `meta webhook: no chat_channel_account` (Connect/id mismatch)
- `meta webhook processed object=… ingested_messages=0` (status-only or unknown object)
- `chat send failed channel=… graph_status=…`

## App Review checklist (when leaving Development)

Request only what the product uses. HELIOS v1 is **text DMs** in a workspace inbox.

| Permission / feature | Why |
|---|---|
| `pages_show_list` | List Pages during IG OAuth |
| `pages_messaging` | Send/receive via the Page |
| `instagram_business_basic` | Instagram Login: identify the professional account |
| `instagram_business_manage_messages` | Instagram Login: send/receive DMs |
| `whatsapp_business_management` | Discover WABA / phone numbers |
| `whatsapp_business_messaging` | Send/receive WhatsApp Cloud text |
| `business_management` | List businesses that own WABAs |

Screencast for reviewers:

1. Admin opens Configuración → Canales → Conectar Instagram/WhatsApp.
2. Completes Facebook Login (no token shown in the browser).
3. Assigns branches.
4. Tester sends a DM; it appears in `/chat`; agent replies.

Privacy policy URL, app icon, and Business Verification on the **Helios** portfolio are Meta’s gates, not HELIOS code.

Keep the app in **Development** until those are approved. Do not flip `VITE_FEATURE_CHAT` in production before testers confirm live DMs.

## Go-live cutover

1. Webhook verify green on Railway URL.
2. Live Development DM test (IG + WA) on a tester workspace.
3. App Review **Live** (or accept Development-only testers forever).
4. Frontend production already builds with `VITE_FEATURE_CHAT=true` on `full-stack` deploy.
5. Confirm CORS is unused or `PUBLIC_APP_URL` matches the app host; OAuth still returns to `/configuracion?open=chat-canales`.

## Out of v1 (do not implement here)

- Replacing Agenda/CRM `wa.me` links with the inbox
- WhatsApp HSM / template messages outside the 24 h window
- Media, audio, stickers, reactions
- Bots, broadcasts, assignment to a human agent
- Instagram historic DM backfill
- Twilio/BSP
- Splitting one shared Meta account into per-branch inboxes
