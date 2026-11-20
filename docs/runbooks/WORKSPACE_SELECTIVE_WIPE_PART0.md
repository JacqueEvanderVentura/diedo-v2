# Parte 0 — wipe selectivo (Charm / franchesko-columna)

Workspace objetivo:

| Campo | Valor |
|--------|--------|
| `workspace_id` | `01a117e6-944e-75f4-a6dc-68907a10fa8c` |
| `slug` (confirmación) | `franchesko-columna` |
| API prod | https://api-production-b1fb.up.railway.app |
| Proyecto Railway | `diedo-production` (`3ad8fb51-7f62-4229-93a4-daba5d21ab91`) |

## 1. Entorno confirmado

- `/health/ready` en API prod debe responder `status: ready` y `database: ok`.
- El wipe **no** usa “Reiniciar data operativa” del tenant (borra catálogo, empleados, cabinas, chat, etc.).
- Postgres prod: servicio `Postgres`, volumen `postgres-volume` (5 GB). **No hay backup programado** en el volumen (verificado vía Railway). Tomar dump lógico antes del wipe real.

## 2. Backup (obligatorio antes del wipe)

Desde una máquina con Railway CLI autenticado y acceso a la base:

```powershell
cd backend
railway link -p diedo-production -e production -s Postgres
railway run pg_dump --format=custom --file=charm-franchesko-pre-wipe.dump "$env:DATABASE_URL"
```

Alternativa: en el dashboard de Railway → Postgres → **Backups** / snapshot manual del volumen, más un `pg_dump` lógico para restauración selectiva.

Los blobs en bucket `uploads` (S3) no van en el dump. El dry run lista `storage_key` a purgar después del DELETE.

## 3. Dry-run (solo lectura)

### Opción A — script Python (recomendado)

Con `DATABASE_URL` de **producción** en el entorno (nunca commitear):

```powershell
cd backend
$env:APP_ENV = "production"
$env:DATABASE_URL = "<pegar desde Railway Variables del servicio api>"
python -m app.scripts.workspace_selective_wipe_dry_run `
  --workspace-id 01a117e6-944e-75f4-a6dc-68907a10fa8c `
  --expected-slug franchesko-columna `
  --storage-keys-out .local/charm-wipe-storage-keys.json `
  --json | Out-File .local/charm-wipe-dry-run.json -Encoding utf8
```

Sin escribir claves a disco:

```powershell
python -m app.scripts.workspace_selective_wipe_dry_run `
  --workspace-id 01a117e6-944e-75f4-a6dc-68907a10fa8c `
  --expected-slug franchesko-columna
```

### Opción B — SQL en psql

Archivo: [`backend/app/scripts/sql/workspace_selective_wipe_dry_run.sql`](../../backend/app/scripts/sql/workspace_selective_wipe_dry_run.sql)

```text
railway connect Postgres
\set ws '01a117e6-944e-75f4-a6dc-68907a10fa8c'
\i app/scripts/sql/workspace_selective_wipe_dry_run.sql
```

### Opción C — mismo comando dentro del contenedor `api`

```powershell
railway link -p diedo-production -e production -s api
railway run python -m app.scripts.workspace_selective_wipe_dry_run --workspace-id 01a117e6-944e-75f4-a6dc-68907a10fa8c --expected-slug franchesko-columna --json
```

(Solo funciona cuando el script esté desplegado en la imagen; hasta entonces usar Opción A local con `DATABASE_URL`.)

## 4. Qué validar en la salida

- `slug_confirmed` / fila `workspaces`: slug `franchesko-columna`, `version` coherente con el panel.
- `preserve_counts`: `branches`, `employees`, `items`, `appointment_resources` **> 0** (el tenant sigue operativo).
- `table_counts` + `conditional_counts`: baseline para comparar después del wipe.
- `storage_keys_total_unique` y archivo `.local/charm-wipe-storage-keys.json` (gitignored): usado en el paso final de purge S3.

## 5. Estado de esta sesión

- API prod verificada (`/health/ready` OK).
- Inventario Railway prod confirmado (api + Postgres).
- Script [`workspace_selective_wipe_dry_run.py`](../../backend/app/scripts/workspace_selective_wipe_dry_run.py) añadido al repo (aún no en imagen prod).
- **Conteos reales en prod:** pendientes de ejecutar Opción A o C con credenciales Railway (MCP no expone `DATABASE_URL`; CLI local sin `railway login`).

Pegar en el chat el JSON de dry-run o el archivo `.local/charm-wipe-dry-run.json` para cerrar parte 0 y autorizar el script de wipe (parte 1).