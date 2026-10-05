# Runbook de QA (diedo-v2)

Ambiente aislado de producción. **No modificar** el proyecto Railway `diedo-production` ni los Workers `diedo-frontend-production` / `diedo-frontend-preview` salvo incidente explícito.

## Topología

| Componente | Recurso |
|------------|---------|
| Proyecto Railway | `diedo-qa` (`566e4193-bd1a-44f3-944c-3e448ab37a10`) |
| Entorno | `qa` (`b367de8d-f203-42b5-90e5-39e00ec7465e`) |
| API | servicio `api` (`100941dd-00e5-4b0b-94a4-df9e5a7862ef`) → `https://api-qa-6ed7.up.railway.app` |
| Postgres | servicio `Postgres` (`d5bcdb02-14f9-47f3-96cd-c01e75f5b41c`), volumen `postgres-volume` |
| Archivos | bucket `uploads` (`5c2b47b2-a26e-4c43-a0c8-a9b59dcd414f`), región `iad` |
| Frontend | Worker `diedo-frontend-qa` → `https://diedo-frontend-qa.helios360erp.workers.dev` |
| Rama Git | `qa` (despliegues); `full-stack` sigue siendo solo producción |

No hay servicio `web` en Railway para QA: el frontend es solo Cloudflare Worker.

## CI/CD

- Push a `qa`: GitHub Actions job `deploy` publica el Worker `qa` (ver [.github/workflows/ci.yml](../.github/workflows/ci.yml)).
- Push a `full-stack`: solo producción (sin cambio).
- Railway `api` en QA: repo `JacqueEvanderVentura/diedo-v2`, rama `qa`, `backend/Dockerfile`, pre-deploy `python -m app.scripts.predeploy`, health `/health/ready`.

## Variables críticas (nombres; valores en Railway)

- `DATABASE_URL` → `${{Postgres.DATABASE_URL}}`
- S3 → `${{uploads.*}}`
- `APP_ENV=production`, `DEMO_SEED_ENABLED=false`, `ALLOW_PRODUCTION_DEMO_SEED=false`, `EMAIL_ENABLED=false`
- `CORS_ORIGINS` y `PUBLIC_APP_URL` → origen del Worker QA
- `JWT_SECRET_KEY` y `BACKOFFICE_API_KEY` **distintos** de producción (rotar en dashboard si hace falta)
- Secretos Meta/Resend: copiar manualmente desde producción en el dashboard si una integración lo requiere

## Datos iniciales

La base y el bucket se cargaron desde producción (solo lectura en prod). En el corte inicial se restauró un `pg_dump` custom y se copiaron **8** objetos al bucket QA. QA contiene datos reales: tratar como confidencial; no enviar correos (`EMAIL_ENABLED=false`).

**Pendiente opcional en Railway:** existe un patch staged con el servicio `s3-copy-prod-to-qa` (artefacto del agente). No aplicar `accept-deploy` de ese patch; eliminarlo desde el dashboard si aparece en el canvas de `diedo-qa`.

## Verificación

```powershell
curl -sS "https://api-qa-6ed7.up.railway.app/health/ready"
cd frontend
node scripts/check-hosting.mjs "https://diedo-frontend-qa.helios360erp.workers.dev"
```

Comprobar login, refresh, logout y una subida de archivo contra el bucket QA.

Producción (sanity, no tocar):

```powershell
curl -sS "https://api-production-b1fb.up.railway.app/health/ready"
node scripts/check-hosting.mjs "https://diedo-frontend-production.helios360erp.workers.dev"
```

## Rollback QA

- App: redesplegar commit anterior de `qa` (Railway + push que dispare Worker).
- Esquema: migraciones forward only; no downgrade en rollback.
- Datos: restaurar desde dump de QA, nunca escribir en producción.

## Coste

Postgres + volumen 5 GB, un servicio `api`, un bucket (plan Hobby: sin backups Railway nativos en QA).
