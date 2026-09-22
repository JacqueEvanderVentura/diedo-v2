# QA — Perdidos en CRM Simplificado (fase 2)

## Entorno

- Rama: `full-stack`.
- Backend local: `APP_ENV=test`, PostgreSQL `127.0.0.1:5434/erp_test`, correo y seed automático desactivados.
- Frontend local: Vite en `localhost:3000`, API en `localhost:8000`.
- La base `erp_test` se recreó para la ejecución final de integración. No se conectó a producción.

## Reproducción antes del cambio

Las pruebas se escribieron y ejecutaron antes de modificar la implementación. Fallaron como se esperaba:

| Caso | Resultado inicial |
| --- | --- |
| Pestaña Perdidos y filtro Todo el historial | No existían en las opciones del CRM Simplificado. |
| Motivo y reapertura en la ficha | La ficha solo indicaba que la oportunidad estaba cerrada. |
| Búsqueda de oportunidad sin lead por cliente/teléfono | `GET /api/v1/crm/opportunities?stage=perdido&search=...` devolvió `200` con `totalItems: 0` para una oportunidad existente. |
| Auditoría de la reapertura | El `PATCH` devolvió `200`, pero no registró el motivo anterior ni la etapa de origen. |

El backend ya persistía `stage=perdido`, `lostReason` y `closedAt`; el fallo principal era su exclusión de la cola simplificada y el `INNER JOIN` en la búsqueda.

## Verificación final

- Backend CRM, Instagram y Perdidos sobre esquema limpio: **15 pruebas pasadas**. Incluyen pérdida y recarga, reapertura, lead convertido, auditoría, conflicto de versión `409`, permiso `403`, paginación, búsqueda por teléfono del cliente y filtro de sucursal.
- Frontend: **437 pruebas pasadas**; `npm run build` exitoso.
- Ruff formato/lint, mypy de los módulos modificados y `git diff --check`: correctos.
- Navegador local: se creó un lead descartable, se marcó perdido con motivo, apareció inmediatamente en Perdidos con fecha, persistió tras recargar, se reabrió en Seguimiento y cambió el contador. Una oportunidad sin lead apareció al buscar el teléfono de su cliente. Para una pérdida antigua, el estado vacío ofreció **Ver todo el historial** y el botón mostró el registro. La pestaña Perdidos quedó sin edición, eliminación, selección masiva ni arrastre; mantuvo Reabrir para `crm.manage`.
- Error de API: pruebas frontend verifican que el formulario de reapertura permanece abierto si el `PATCH` falla y que la cola/contadores muestran el error de carga con reintento.

## Entrega

El usuario certificó la fase en el entorno local y autorizó el commit y el push. Antes del commit se ejecutaron ambos prepush con `APP_ENV=test` y `DATABASE_URL` en `127.0.0.1:5434/erp_test`: backend con 296 pruebas y 88,22 % de cobertura; frontend con build, 437 pruebas y dry run de Wrangler, todos correctos. El build Docker del backend no pudo ejecutarse localmente porque el servicio Docker Desktop estaba detenido y el sistema no permitió iniciarlo.
