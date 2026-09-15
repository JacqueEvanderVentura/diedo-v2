# Runbook de Railway

## VersiÃ³n rÃ¡pida (para ejecutar sin perderse)

1. MantÃ©n el branch de cambios en `full-stack`.
2. Espera verde en CI de backend y frontend antes de desplegar.
3. Verifica que `api` quede accesible por `api-production-b1fb.up.railway.app`.
4. Confirma en producciÃ³n:
   - `/health/ready` en API,
   - `/health` en web (siempre y cuando sea con Cloudflare),
   - login + refresh + logout.
5. Deja `web` de Railway como respaldo activo durante 48 horas.
6. Si falla algo, vuelve a publicar el Ãºltimo SHA funcional de `web` en Railway para recuperaciÃ³n.

---

## TopologÃ­a de producciÃ³n

- Proyecto: `diedo-production`, entorno `production`, regiÃ³n US East.
- Servicios: `web`, `api`, `Postgres` y bucket privado `uploads`.
- Fuente de `web` y `api`: `JacqueEvanderVentura/diedo-v2`, rama `full-stack`.
- No reutilizar ni modificar el proyecto `upbeat-healing`.
- El frontend ya migrarÃ¡ a Cloudflare con dominio `<worker>.<cuenta>.workers.dev`.
- El API mantiene dominio y base de datos en Railway en `api-production-b1fb.up.railway.app`.

Los identificadores y dominios efectivos se registran en la secciÃ³n "Inventario desplegado" despuÃ©s
del primer despliegue.

## Variables

`api` recibe `APP_ENV=production`, `DATABASE_URL` desde `Postgres.DATABASE_URL`, el origen exacto de
`web`, secretos JWT/backoffice generados para este proyecto y las referencias privadas del bucket.
El backend usa `ATTACHMENT_STORAGE_BACKEND=s3`; las credenciales se inyectan como
`AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY`, nunca se almacenan en Git.

El seed requiere simultÃ¡neamente `DEMO_SEED_ENABLED=true`,
`ALLOW_PRODUCTION_DEMO_SEED=true` y `DEMO_ADMIN_PASSWORD`. La operaciÃ³n es reconciliadora e
idempotente. Cambiar `DEMO_SEED_ENABLED` a `false` detiene futuras reconciliaciones y no elimina datos.

`api` y `web` comparten las mismas variables de entorno de base; `web` se compila con:
- `VITE_API_BASE_URL=https://api-production-b1fb.up.railway.app`
- `VITE_DEMO_SEED_ENABLED=false`
- todas las flags de feature en `false`.
Estas variables son de compilaciÃ³n; modificarlas exige reconstruir y publicar la imagen/artefacto.

## Despliegue y operaciÃ³n

1. Railway espera que Backend CI y Frontend CI terminen correctamente.
2. El pre-deploy de `api` ejecuta `python -m app.scripts.predeploy`, que aplica Alembic y despuÃ©s
   reconcilia el seed demo en un Ãºnico proceso secuencial.
3. Verificar `/health/ready` en `api`, `/health` y una ruta profunda en `web`.
4. Revisar logs sin copiar secretos y comprobar login, refresh, `/api/v1/auth/me` y un flujo de archivo.
5. Mantener `web` de Railway activo durante 48 h como fallback de transiciÃ³n.
6. Al habilitar un plan Railway con backups, programar snapshots del volumen PostgreSQL diarios,
   semanales y mensuales y probar restauraciÃ³n periÃ³dicamente en un entorno aislado. El plan Hobby
   activo reporta `maxBackupsCount=0`, por lo que Railway rechazÃ³ la creaciÃ³n de estos horarios el
   2026-09-03. Hasta actualizar el plan, exportar PostgreSQL a almacenamiento externo siguiendo una
   polÃ­tica equivalente y verificar periÃ³dicamente que los archivos sean restaurables.

Para crear un cliente limpio, usar `POST /api/v1/backoffice/workspaces` con `X-Backoffice-Key` y los
datos reales del propietario. Este flujo no ejecuta el seed demo y crea roles, permisos, mÃ³dulos,
unidades, mÃ©todos de pago y configuraciÃ³n propios del nuevo workspace.

## Rollback

- AplicaciÃ³n: redesplegar el commit anterior de `full-stack`.
- Esquema: aplicar correcciones hacia adelante; no ejecutar downgrades destructivos durante un rollback.
- Datos: restaurar PostgreSQL desde snapshot solo ante un incidente confirmado.
- Archivos: Railway Buckets no tiene versionado ni backup nativo; una eliminaciÃ³n de objeto no se puede
  recuperar hasta implementar la exportaciÃ³n externa indicada en el backlog.

## Inventario desplegado

- Proyecto `diedo-production`: `3ad8fb51-7f62-4229-93a4-daba5d21ab91`.
- Entorno `production`: `2a2b155b-36fc-450e-b981-42d2247fdca9`.
- `web` (railway legado, mantener hasta cierre):
  `1d1e6938-b0b0-48e6-8da9-04d6831873be`,
  `https://web-production-be856.up.railway.app`.
- `api`: `c8aa818d-ce14-450c-bc17-6135809923a4`,
  `https://api-production-b1fb.up.railway.app`.

- Frontend Cloudflare:
  - DNS raÃ­z: `helios360erp.com`
  - Frontend: `<worker>.<cuenta>.workers.dev`
  - API Railway: `api-production-b1fb.up.railway.app`
- `Postgres`: `d73beb6e-85ce-440e-ae3a-defaa409056a`; volumen persistente
  `9c904dd9-f1be-4094-b351-85e569f19146` montado en `/var/lib/postgresql/data`.
- Bucket privado `uploads`: `2becfe0b-9672-47ce-ad7b-81b53928af96`.
