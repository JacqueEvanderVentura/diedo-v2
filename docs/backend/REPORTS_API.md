# Reportes API

Todos los recursos requieren `report.read`, respetan el alcance de sucursales del usuario y
responden con `Cache-Control: no-store`. Los períodos financieros son calendarios en la zona
horaria del workspace o de la sucursal: `today`, `week`, `month` y `quarter`.

## Recursos

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/v1/reports/general/summary` | KPIs, serie de ingresos/gastos y distribución de ingresos |
| GET | `/api/v1/reports/general/transactions` | Ventas, ingresos manuales y gastos paginados |
| GET | `/api/v1/reports/general/expense-categories` | Gastos agrupados por categoría |
| GET | `/api/v1/reports/memberships` | Vigencia, MRR, crecimiento y listado de membresías |
| GET | `/api/v1/reports/agenda/summary` | Asistencia, estados, fuentes y desempeño por empleado |
| GET | `/api/v1/reports/agenda/appointments` | Listado auditable de citas |
| GET | `/api/v1/reports/inventory/summary` | Existencias, valorización, mínimos y márgenes |
| GET | `/api/v1/reports/inventory/items` | Detalle paginado por producto |
| GET | `/api/v1/reports/dividends` | Utilidad positiva distribuida por participación societaria |
| GET | `/api/v1/reports/personal` | Ventas, citas atendidas vs. promedio, incidencias e insumos por empleado |

Las colecciones aceptan `branchId`, `search`, `page`, `pageSize`, `sortKey` y `sortDir` según
corresponda. Inventario usa `categoryId`; agenda acepta además el período `all`.

## Decisiones de dominio

- Una membresía es una venta completada de un artículo con `itemType=membership`. Cada unidad
  otorga 30 días; una renovación extiende la vigencia desde la expiración previa si todavía está
  activa. El checkout exige un cliente registrado para este tipo de artículo.
- Los dividendos no inventan utilidades: parten de ventas e ingresos manuales, restan gastos y
  pagos de gastos fijos, y distribuyen solamente utilidad positiva. Nombre, documento y porcentaje
  se leen de `branch.configuration.partners`.
- Los importes monetarios se serializan como strings decimales para evitar pérdida de precisión;
  el adaptador web los convierte a números únicamente para presentación y gráficas.
- Los reportes se calculan bajo demanda sobre los módulos fuente. No existe una tabla duplicada de
  resultados que pueda quedar desincronizada.
- Personal considera una cita atendida solamente cuando está `completed` o `attended`; una cita
  confirmada todavía no cuenta como realizada. `attendanceVsTeamPct` compara el total individual
  contra el promedio de quienes tuvieron al menos una cita atendida o una inasistencia en el
  período.
- Las incidencias laborales salen de incidencias `personal` vinculadas explícitamente a un
  empleado. Las vacaciones provienen de solicitudes de RRHH aprobadas y se cuentan por los días
  que realmente se solapan con el período. No se duplican como incidencias persistidas.
- El uso de insumos toma exclusivamente salidas de inventario con `employeeId`; si la salida
  incluye `appointmentId`, esta queda auditada contra la cita que originó el consumo.
