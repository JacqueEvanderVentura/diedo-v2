# Chat (Instagram + WhatsApp)

Status: **Fase 6** — webhook HTTPS público, runbook de go-live y checklist App Review.
`VITE_FEATURE_CHAT` permanece `false` en producción hasta el corte. `wa.me` no se reemplaza.

Runbook: [CHAT_GO_LIVE.md](CHAT_GO_LIVE.md).



## Variables de entorno (backend)



Opcionales hasta conectar Meta (el API arranca sin ellas):



| Variable | Descripción |

|---|---|

| `META_APP_ID` | App ID de Meta Developers |

| `META_APP_SECRET` | App secret (solo servidor) |

| `META_WEBHOOK_VERIFY_TOKEN` | Token de verificación del webhook Graph |

| `META_GRAPH_API_VERSION` | Versión Graph (default `v21.0`) |

| `META_OAUTH_REDIRECT_URI` | Callback OAuth (default `http://127.0.0.1:8000/api/v1/chat/oauth/meta/callback`) |

| `PUBLIC_APP_URL` | Origen del frontend para redirigir tras OAuth (ej. `http://localhost:3000`) |



Frontend:



| Variable | Descripción |

|---|---|

| `VITE_FEATURE_CHAT` | `true` / `false`. En producción debe ser `false` hasta go-live. |



## Modelo de datos



- `chat_channel_accounts`: cuenta IG o WA por workspace (`provider_account_id` único por canal).

- `chat_channel_account_branches`: N sucursales pueden compartir la misma cuenta.

- `chat_conversations` / `chat_messages`: cuelgan de la **cuenta**, no de la sucursal.

- `chat_oauth_states`: sesiones OAuth temporales (tokens nunca al navegador).



## Permisos



- `chat.read` — ver hilos de cuentas asignadas a sucursales autorizadas.

- `chat.send` — responder en esas conversaciones.

- `workspace.update` — conectar/desconectar cuentas Meta y editar asignación de sucursales (Configuración).



## Webhook Meta (Fase 2)



| Método | Ruta | Auth |

|---|---|---|

| `GET` | `/api/v1/webhooks/meta` | `hub.verify_token` = `META_WEBHOOK_VERIFY_TOKEN` → devuelve `hub.challenge` |

| `POST` | `/api/v1/webhooks/meta` | Cabecera `X-Hub-Signature-256` con `META_APP_SECRET` |



## REST inbox (Fase 3)



| Método | Ruta | Permiso |

|---|---|---|

| `GET` | `/api/v1/chat/conversations` | `chat.read` |

| `GET` | `/api/v1/chat/conversations/{conversationId}/messages` | `chat.read` |

| `POST` | `/api/v1/chat/conversations/{conversationId}/messages` | `chat.send` |



## UI inbox (Fase 4)

Ruta `/chat` con `VITE_FEATURE_CHAT`. Implementación en `frontend/src/modules/chat/` y `chatApi.js`.

- Sucursal activa del ERP, filtro IG/WA, búsqueda, lista + hilo + composer.
- Indicador ventana 24 h; composer deshabilitado si `messagingWindowOpen` es falso.
- Polling ~12 s; `chat.send` para responder.



## Cuentas y OAuth (Fase 5)



Requiere `workspace.update`. Los tokens **no** se devuelven en JSON.



| Método | Ruta | Descripción |

|---|---|---|

| `GET` | `/api/v1/chat/channel-accounts` | Lista cuentas + sucursales asignadas |

| `PUT` | `/api/v1/chat/channel-accounts/{id}/branches` | Body `{ "branchIds": [...] }` |

| `POST` | `/api/v1/chat/channel-accounts/{id}/disconnect` | Revoca token en servidor |

| `POST` | `/api/v1/chat/channel-accounts/oauth/start` | Body `{ "channel": "instagram" \| "whatsapp" }` → `authorizationUrl` |

| `GET` | `/api/v1/chat/channel-accounts/oauth/pending?oauthStateId=` | Candidatos si Meta devolvió varias cuentas |

| `POST` | `/api/v1/chat/channel-accounts/oauth/complete` | Body `{ "oauthStateId", "providerAccountId" }` |

| `GET` | `/api/v1/chat/oauth/meta/callback` | Callback público Meta → redirige a `/configuracion?open=chat-canales` |



Flujo UI: **Conectar** → login Meta → callback → (opcional) elegir cuenta → asignar sucursales. Reutiliza la misma fila si el `provider_account_id` ya existe en el workspace.



### Meta Developers (Development)



1. Crear app tipo Business; añadir productos **Instagram** y **WhatsApp**.

2. En **Facebook Login** → Valid OAuth Redirect URIs: valor de `META_OAUTH_REDIRECT_URI`.

3. Copiar App ID y App Secret a `META_APP_ID` / `META_APP_SECRET`.

4. Usuarios tester en la app para IG/WA en modo Development.

5. Webhook y App Review: ver [CHAT_GO_LIVE.md](CHAT_GO_LIVE.md).


