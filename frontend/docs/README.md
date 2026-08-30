# /docs

Documentación viva de **Diedo / Vilma AI**.

## Fases del frontend

Las fases 1–3 de esta tabla son hitos visuales históricos del MVP. El avance full-stack vigente se
registra por separado para evitar confundir esa numeración con el plan Backend ↔ Frontend.

| Archivo | Contenido |
|---------|-----------|
| [fase-1.md](./fase-1.md) | Navbar, Dashboard, Terminal POS (carrito sticky, stores iniciales) |
| [fase-2.md](./fase-2.md) | Caja + Cuentas por Cobrar (POS ops) |
| [fase-3.md](./fase-3.md) | Inventarios + catálogo compartido (`catalogStore`) |
| [integracion-fases-0-1.md](./integracion-fases-0-1.md) | Evidencia histórica/parcial de confiabilidad, sesión, IAM y configuración; reabierta en el plan V2 |
| [integracion-fase-2.md](./integracion-fase-2.md) | Evidencia histórica/parcial de clientes, empleados básicos y adjuntos; reabierta en el plan V2 |
| [integracion-agenda.md](./integracion-agenda.md) | Contrato y ciclo de sincronización de Calendario y Gestión de citas |

Planes cortos en la raíz del repo: `fase1_plan.txt`, `fase2_plan.txt`, `fase3_plan.txt`.

## Full-stack + backend

- [../../docs/BACKEND_HANDOFF_JEAN_PAUL.md](../../docs/BACKEND_HANDOFF_JEAN_PAUL.md) — integración API, módulos conectados, CRUDs pendientes (Jean Paul).
- [../../docs/backend/](../../docs/backend/) — contratos IAM, catálogo, foundation y maestros compartidos.
- [../../docs/PLAN_IMPLEMENTACION_BACKEND_FRONTEND.md](../../docs/PLAN_IMPLEMENTACION_BACKEND_FRONTEND.md) — estado y siguientes fases full-stack.

Cada fase agrega su propio `fase-N.md` con alcance, rutas, stores y decisiones UX.

## Pruebas de integración reales

`npm run test:e2e` verifica estados de UI con respuestas controladas. Para probar cookie, proxy,
FastAPI, migraciones y PostgreSQL juntos, primero se levanta el servicio desechable desde
`backend/`:

```bash
docker compose up -d postgres_test
```

El entorno virtual debe existir en `backend/.venv`. Después, desde `frontend/`, se ejecuta:

```bash
npm run test:e2e:full-stack
```

El comando es destructivo únicamente sobre la base desechable `erp_test`: ejecuta `downgrade base`,
`upgrade head`, reseed y levanta servidores aislados en los puertos 8200 y 3200. El guard solo
acepta `localhost`/`127.0.0.1`, puerto 5434 y el nombre exacto `erp_test`; no admite una base de
desarrollo, otro puerto ni un host remoto. `FULL_STACK_DATABASE_URL` y
`FULL_STACK_ADMIN_PASSWORD` permiten reemplazar solo esos valores de prueba sin escribir
credenciales en el repositorio.

No se debe ejecutar a la vez con pytest backend ni con otro full-stack que use `erp_test`, porque
ambos recrearían el mismo schema. El seed del backend se habilita solo para preparar fixtures; el
frontend se levanta con `VITE_DEMO_SEED_ENABLED=false`, de modo que estos cinco casos prueban modo
API real y no constituyen todavía la prueba de paridad demo.
