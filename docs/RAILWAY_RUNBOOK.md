# Runbook de Railway

## Topología de producción

- Proyecto: `diedo-production`, entorno `production`, región US East.
- Servicios: `web`, `api`, `Postgres` y bucket privado `uploads`.
- Fuente de `web` y `api`: `JacqueEvanderVentura/diedo-v2`, rama `full-stack`.
- No reutilizar ni modificar el proyecto `upbeat-healing`.

Los identificadores y dominios efectivos se registran en la sección "Inventario desplegado" después
del primer despliegue.

## Variables

`api` recibe `APP_ENV=production`, `DATABASE_URL` desde `Postgres.DATABASE_URL`, el origen exacto de
`web`, secretos JWT/backoffice generados para este proyecto y las referencias privadas del bucket.
El backend usa `ATTACHMENT_STORAGE_BACKEND=s3`; las credenciales se inyectan como
`AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY`, nunca se almacenan en Git.

El seed requiere simultáneamente `DEMO_SEED_ENABLED=true`,
`ALLOW_PRODUCTION_DEMO_SEED=true` y `DEMO_ADMIN_PASSWORD`. La operación es reconciliadora e
idempotente. Cambiar `DEMO_SEED_ENABLED` a `false` detiene futuras reconciliaciones y no elimina datos.

`web` recibe `VITE_API_BASE_URL` apuntando al dominio Railway de `api`,
`VITE_DEMO_SEED_ENABLED=false` y todas las banderas descritas en `PRODUCTION_BACKLOG.md` en `false`.
Estas variables son de compilación; modificarlas exige reconstruir `web`.

## Despliegue y operación

1. Railway espera que Backend CI y Frontend CI terminen correctamente.
2. El pre-deploy de `api` ejecuta `python -m alembic upgrade head` y después
   `python -m app.scripts.seed_demo`.
3. Verificar `/health/ready` en `api`, `/health` y una ruta profunda en `web`.
4. Revisar logs sin copiar secretos y comprobar login, refresh, `/api/v1/auth/me` y un flujo de archivo.
5. Programar snapshots del volumen PostgreSQL diarios, semanales y mensuales. Probar restauración
   periódicamente en un entorno aislado.

Para crear un cliente limpio, usar `POST /api/v1/backoffice/workspaces` con `X-Backoffice-Key` y los
datos reales del propietario. Este flujo no ejecuta el seed demo y crea roles, permisos, módulos,
unidades, métodos de pago y configuración propios del nuevo workspace.

## Rollback

- Aplicación: redesplegar el commit anterior de `full-stack`.
- Esquema: aplicar correcciones hacia adelante; no ejecutar downgrades destructivos durante un rollback.
- Datos: restaurar PostgreSQL desde snapshot solo ante un incidente confirmado.
- Archivos: Railway Buckets no tiene versionado ni backup nativo; una eliminación de objeto no se puede
  recuperar hasta implementar la exportación externa indicada en el backlog.

## Inventario desplegado

Se completará con los IDs de proyecto, entorno y servicios y con los dominios `web`/`api` al finalizar
el despliegue inicial.
