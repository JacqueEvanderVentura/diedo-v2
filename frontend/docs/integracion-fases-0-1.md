# Integración full-stack — Fases 0 y 1

Estado histórico: implementación parcial reabierta por el plan Backend ↔ Frontend V2 el 2026-08-29.

Este documento conserva la evidencia del corte original. No declara cerradas la Etapa R ni las
Fases 0–1; el estado vigente y sus pendientes están en
`../../docs/PLAN_IMPLEMENTACION_BACKEND_FRONTEND.md`.

Este documento registra el cierre frontend correspondiente a las Fases 0 y 1 del plan
Backend ↔ Frontend. No sustituye las fases visuales históricas `fase-1.md` a `fase-3.md`.

## Sesión y modos de datos

- La sesión no se persiste en `localStorage`. El access token vive en memoria y el refresh lo
  administra el backend mediante cookie HttpOnly.
- `GET /health/ready` decide si la API es compatible; un fallo deja la aplicación en modo degradado
  recuperable.
- El modo demo solo existe con `VITE_DEMO_SEED_ENABLED=true` y consume el snapshot generado desde
  `demo-data/v1/manifest.json`.
- Cada gateway de módulo expone `loading`, `ready`, `stale`, `error` o `demo`. Una lectura stale
  conserva la última respuesta API, pero las mutaciones quedan bloqueadas.
- Cambiar workspace limpia los cachés de gateways antes de cargar la nueva identidad.

## Persistencia y seguridad

- Los stores con datos de negocio sensibles usan almacenamiento efímero en memoria.
- Al iniciar se invalidan claves heredadas que podían contener sesión, PII, ventas, salarios,
  cuentas, cédulas o matrices completas.
- Las futuras preferencias/borradores permitidos deben usar un namespace versionado por
  `workspaceId + userId + módulo`.
- Sidebar, dashboard, perfil, notificaciones y atribuciones operativas usan la misma identidad de
  `auth/me`; no quedan actores `CURRENT_USER`/`u1` en operaciones de UI.

## Pantallas conectadas en Fase 1

- Configuración general: `GET/PATCH /api/v1/workspace/settings`.
- Sucursales: listado, creación, edición, activación y archivado mediante API.
- Métodos de pago: listado, creación, activación/desactivación y archivado mediante API.
- Usuarios: lista, detalle, creación, edición de assignments, suspensión/reactivación, invitación y
  restablecimiento de contraseña.
- Perfil y cambio de contraseña usan endpoints de auth reales.
- Navegación y guards consumen `effectivePermissionCodes` y `enabledModules`.
- `/agendar` y `/agendar/perfil` permanecen fuera de `AuthGate`.

## Migración progresiva de módulos

El menú conserva POS, Agenda, CRM, RRHH, Compras, Incidencias, Finanzas y Reportes mientras sus
contratos se conectan por cortes verticales. Desde el cierre de Fase 2, `crm` y `hr` se suman a
`foundation`, `iam` y `catalog` en el registro de módulos API. Clientes y empleados básicos ya usan
los maestros compartidos; los flujos transaccionales de las fases posteriores conservan sus
repositorios demo hasta que les corresponda migrar.

Esta compatibilidad no autoriza a los módulos locales a consumir endpoints protegidos ni convierte
una escritura Zustand en persistencia backend. Su propósito es mantener el MVP navegable mientras
cada módulo se migra gradualmente.

Los stores locales y fixtures siguen disponibles únicamente como repositorio del sandbox demo;
nunca son fallback de una mutación online fallida. El detalle del corte posterior está en
[`integracion-fase-2.md`](./integracion-fase-2.md).

## Desarrollo y verificación

El proyecto usa npm y `package-lock.json`; `yarn.lock` ya no forma parte del flujo. Vite, proxy y
CORS local usan el puerto 3000.

```bash
npm install
npm run generate:demo
npm test
npm run test:e2e
npm run build
```

Evidencia de cierre:

- 12 pruebas unitarias: gateway, caché stale, error/demo, bloqueo de mutaciones, storage, snapshot,
  bootstrap y disponibilidad progresiva de módulos;
- 6 pruebas Playwright: online, navegación frontend progresiva, refresh 401, API caída, demo
  explícito y autoagenda pública;
- build Vite de producción correcto;
- auditoría npm con 0 vulnerabilidades.

La suite backend complementaria cerró con 62/62 pruebas y 90,83 % de cobertura con ramas sobre
PostgreSQL 18 desechable; la migración desde cero y `alembic check` también fueron correctos.
