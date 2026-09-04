# Dashboard API

El módulo Dashboard es de sólo lectura y agrega información operativa ya persistida. Todos los
endpoints requieren Bearer token, el permiso `dashboard.read` y el entitlement `dashboard`.

## Filtros comunes

- `period`: `today`, `week`, `month` o `quarter`; por defecto `week`.
- `branchId`: UUID opcional. Si se omite, consulta todas las sucursales visibles para el usuario.
- La semana comienza el lunes. Mes y trimestre son calendarios, no ventanas móviles.
- Los límites temporales se calculan con la zona horaria de la sucursal seleccionada o, para toda
  sucursal, con la zona horaria del workspace.
- Una sucursal inexistente o fuera del alcance efectivo responde `404` sin revelar su existencia.

## Endpoints

| Método y ruta | Resultado |
|---|---|
| `GET /api/v1/dashboard/summary` | Ingresos, leads activos, citas de hoy y tareas abiertas del período. |
| `GET /api/v1/dashboard/sales-trend` | Serie horaria, diaria, semanal o mensual según el período. |
| `GET /api/v1/dashboard/stock-alerts` | Balances actuales con cantidad menor o igual al mínimo. |
| `GET /api/v1/dashboard/appointments` | Citas no canceladas del día, ordenadas por hora. |
| `GET /api/v1/dashboard/activity` | Actividad reciente combinada de POS, inventario, agenda y tareas. |

`stock-alerts`, `appointments` y `activity` aceptan un `limit` acotado. Las respuestas usan
`Cache-Control: no-store` porque representan estado operativo y respetan alcance de autorización.

## Fuentes y semántica

- Ingresos y tendencia suman únicamente ventas POS con estado `completed` por `completed_at`.
- Leads activos son leads CRM en estado `nuevo`, `contactado` o `calificado`, creados dentro del
  período.
- Tareas abiertas son seguimientos CRM pendientes cuya fecha límite cae dentro del período.
- Las alertas de stock se calculan sobre `inventory_stock_balances`, sin snapshots duplicados.
- La actividad reciente combina registros existentes y se ordena de forma descendente por fecha.
- La actividad reciente incluye los seguimientos CRM pendientes y enlaza a `/crm/seguimiento`.

El dashboard reutiliza las entidades persistentes de CRM y no mantiene snapshots duplicados para
estos indicadores.
