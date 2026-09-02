# Finance API

El módulo Finance cubre Overview, Gastos, Pasivos, Presupuestos, Cuentas e Ingresos. Todos los
endpoints requieren Bearer token, el entitlement `finance` y alcance de sucursal. Las consultas
usan `finance.read`; las mutaciones usan `finance.manage`.

## Modelo y fuentes

- `finance_expenses` guarda gastos variables creados desde Finanzas.
- `finance_fixed_expenses` define obligaciones recurrentes y
  `finance_fixed_expense_payments` registra el pago único de cada período mensual.
- `finance_liabilities` conserva préstamos, tarjetas y otras obligaciones, con saldo pendiente,
  cuota, vencimiento y categorías relacionadas.
- `finance_budgets` define límites mensuales. El consumido y sus transacciones se calculan desde
  gastos pagados, por lo que no existe un saldo duplicado que pueda desincronizarse.
- `finance_accounts` registra caja, banco u otras cuentas. El número se persiste únicamente
  enmascarado; las credenciales bancarias no forman parte del modelo.
- `finance_manual_incomes` guarda ingresos capturados por formulario.
- Ventas completadas de POS se proyectan como ingresos no editables y egresos de Caja no
  reversados se proyectan como gastos no editables. Finanzas no copia esas transacciones.

Todas las entidades operativas pertenecen a un workspace y una sucursal. Las referencias compuestas
y restricciones de base de datos impiden relaciones cruzadas entre workspaces.

## Endpoints

Todos parten de `/api/v1/finance`.

| Método y ruta | Resultado |
|---|---|
| `GET /overview` | KPIs del período y tendencia mensual. |
| `GET/POST /expenses` | Lista la proyección unificada o crea un gasto variable. |
| `GET/PATCH/DELETE /expenses/{id}` | Consulta, actualiza o anula un gasto financiero. |
| `GET/POST /fixed-expenses` | Lista o crea gastos fijos. |
| `GET/PATCH/DELETE /fixed-expenses/{id}` | Consulta, actualiza o archiva un gasto fijo. |
| `POST /fixed-expenses/{id}/payments` | Registra el pago de un período mensual. |
| `GET/POST /liabilities` | Lista o crea pasivos. |
| `GET /liabilities/stats` | Total, saldo pendiente, cuota mensual y distribución por tipo. |
| `GET/PATCH/DELETE /liabilities/{id}` | Consulta, actualiza o archiva un pasivo. |
| `GET/POST /budgets` | Lista o crea presupuestos con consumo calculado. |
| `GET /budgets/stats` | Límites, consumo, disponibilidad y alertas. |
| `GET/PATCH/DELETE /budgets/{id}` | Consulta, actualiza o archiva un presupuesto. |
| `GET/POST /accounts` | Lista o crea cuentas financieras. |
| `GET /accounts/stats` | Balance consolidado y distribución por tipo/moneda. |
| `GET/PATCH/DELETE /accounts/{id}` | Consulta, actualiza o archiva una cuenta. |
| `GET /incomes` | Proyección unificada de ventas POS e ingresos manuales. |
| `POST /manual-incomes` | Crea un ingreso manual. |
| `GET/PATCH/DELETE /manual-incomes/{id}` | Consulta, actualiza o anula un ingreso manual. |

Las listas paginadas aceptan `branchId`, `page`, `pageSize`, búsqueda y filtros específicos. Gastos e
ingresos admiten rango de fechas, estado, origen y orden; presupuestos y gastos fijos admiten período
`YYYY-MM`. Las estadísticas respetan el alcance efectivo y el filtro de sucursal.

## Reglas operativas

- Las creaciones y los pagos mensuales requieren `Idempotency-Key`. Repetir el mismo cuerpo devuelve
  el resultado original; reutilizar la clave con otro cuerpo responde `409`.
- Las actualizaciones y bajas reciben `version`; una versión obsoleta responde `409`.
- Los elementos proyectados desde POS o Caja son de solo lectura en Finance.
- Un presupuesto solo puede vincular gastos de su misma sucursal y workspace.
- Un pago fijo no puede repetirse para el mismo gasto y período, aunque cambie la clave idempotente.
- Las tarjetas exigen día de corte y pago; montos, cuotas, fechas y saldos se validan tanto en el API
  como mediante constraints de PostgreSQL.
- Las bajas son lógicas para preservar historial financiero y trazabilidad.
- Las respuestas incluyen `Cache-Control: no-store` y cada mutación genera auditoría `finance.*`.

## Overview

`GET /overview` recibe `period=YYYY-MM`, `branchId` opcional y `trendMonths`. Devuelve ingresos,
gastos variables y fijos pagados, balance, margen neto, deuda pendiente, presupuesto consumido,
balance de cuentas y una serie mensual. El cálculo usa ventas completadas, movimientos válidos de
Caja y registros propios de Finance, evitando sumar dos veces los datos que el frontend antes
componía localmente.

## Frontend y datos demo

El store de Finanzas hidrata en línea Overview, las seis colecciones y sus estadísticas desde el API.
En modo demo conserva el contrato local a partir del snapshot generado. Los formularios esperan la
respuesta del servidor, presentan errores operativos y mantienen la versión más reciente antes de
editar o eliminar.

La semilla `v1` agrega cuatro presupuestos, seis gastos variables, cuatro gastos fijos con tres pagos,
tres pasivos, tres cuentas enmascaradas y tres ingresos manuales. Los escenarios son datos
operativos realistas y sintéticos distribuidos entre tres sucursales; sus IDs son estables, el
manifiesto valida checksums y la carga es idempotente.

La migración `20260901_0016` instala las siete tablas, índices, restricciones, permisos, roles y
entitlement del módulo.
