# Carwash — fase 4: consulta y liquidación de comisiones

## Entrega

La pestaña Comisiones consulta los devengos reales por sucursal, empleado, estado, rol y fechas
locales. Conserva los cuatro resúmenes y las columnas de la referencia Diedo. Cada línea y rol
mantiene una entrada, incluso si el lavador y el encargado son la misma persona. Los resúmenes
se calculan en backend sobre todos los resultados filtrados, independientemente de la página;
cuentan cada lavado y su facturación una sola vez y excluyen comisiones anuladas de los importes
vigentes. Las fechas filtran el devengo, no la fecha de cobro de CxC.

Se pueden seleccionar comisiones pendientes de un empleado en la página actual y liquidarlas
juntas. El modal muestra detalle, importe, caja y método de efectivo antes de confirmar. El
historial permite consultar el detalle y revertir una liquidación completa con motivo. No hay
reversos parciales; después del reverso se puede hacer una nueva selección. Los empleados
inactivos con comisiones históricas siguen apareciendo en el filtro y pueden recibirlas.

En móvil se usa `ResponsiveList`, con tarjetas y acciones visibles en el pie del modal. Los
filtros y páginas permanecen en la URL. Los datos se actualizan después de operar, cada 15 segundos
mientras la pestaña es visible y al recuperar visibilidad. Un fallo de API conserva la última
copia como solo lectura; perder autorización borra la copia y cierra los formularios. La demo
continúa separada y no permite escrituras.

## Contrato API

Todas las rutas usan `/api/v1/carwash`, JSON camelCase y montos decimales como strings.

| Método / recurso | Contrato |
| --- | --- |
| `GET /commission-context?branchId=` | Capacidades, caja abierta, moneda, zona horaria, métodos de efectivo inmediatos y empleados con devengos. |
| `GET /commissions` | `branchId` obligatorio; `employeeId`, `status=pending\|settled\|voided`, `role=washer\|supervisor`, `dateFrom`, `dateTo`, `page`, `pageSize` opcionales. Devuelve detalle paginado y `summary: {washes,billed,commissions,pending}`. |
| `POST /settlements` | `branchId`, `employeeId`, `registerId`, `paymentMethodId`, `commissions: [{id,version}]`; entre 1 y 100 entradas únicas e `Idempotency-Key`. |
| `GET /settlements` | `branchId`, empleado opcional y paginación; historial de pagos y reversos. Los filtros de fecha/estado/rol de devengos no restringen este historial. |
| `GET /settlements/{id}` | Liquidación, detalle por servicio/rol, egreso y eventual movimiento inverso. |
| `POST /settlements/{id}/reverse` | `version`, `reason` de 3–1000 caracteres e `Idempotency-Key`. |

Consultar exige `carwash.read` y `carwash.commissions.read` en la sucursal. Pagar añade
`carwash.commissions.settle` y `pos.cash.manage`; revertir añade `carwash.commissions.reverse`
y `pos.cash.manage`. Se conservan los errores `400/401/403/404/409`. Las claves tienen 8–128
caracteres. Las acciones validan las versiones y no se exponen mediante PATCH.

## Caja, Finanzas y transacciones

`PosService.create_manual_movement_in_transaction` extrae la operación existente de egreso sin
commit ni rollback. El método público POS conserva su contrato, idempotencia y confirmación.
Carwash valida la selección y suma los importes ya devengados en Decimal; no acepta un total
propuesto por el navegador. Exige una caja abierta de la misma sucursal y moneda y un método
activo de efectivo inmediato. Una liquidación de cero se registra sin movimiento monetario;
conserva los mismos permisos y requisito de caja abierta.

La liquidación, sus detalles, las versiones/estados de comisiones, el egreso, el acumulado de caja
y la auditoría se confirman en una sola transacción. Finanzas proyecta ese egreso existente como
gasto de origen Caja: no se crea un segundo `FinanceExpense`. Se mantienen las reglas de egresos
POS, que no incorporan una validación adicional de saldo mínimo disponible.

El reverso usa la caja original si sigue abierta o la caja abierta actual de la misma sucursal.
Crea un `CashMovement` de tipo `reversal` que referencia el egreso original, aplica las reglas de
acumulados POS y devuelve las comisiones a `pending`. Si cambió el turno, la caja cerrada queda
intacta y el efectivo vuelve al nuevo turno. Finanzas excluye el egreso revertido por la relación
existente. Se conservan el pago y todos sus detalles históricos. CxC no cambia al liquidar ni al
revertir comisiones: se devengan al completar, aunque el cliente todavía no haya pagado.

El orden de bloqueo es lavados ordenados por ID → comisiones ordenadas por ID → liquidación
existente, cuando corresponde → caja. Es compatible con la anulación de ventas de Carwash desde
POS: una liquidación vigente sigue impidiendo anular hasta revertirla. POS actualmente no ofrece
una acción genérica para revertir egresos manuales; este egreso se revierte desde la liquidación.
No se agregó una vía alternativa que pudiera separar el estado del pago del estado de caja.

Ante pérdida de respuesta, el modal inmoviliza la solicitud y recupera el resultado con la misma
clave y versiones. Una clave usada con otro contenido produce conflicto. Los bloqueos, las
claves únicas y el índice parcial de asignaciones vigentes evitan pagos duplicados, incluso
cuando dos operadores seleccionan las mismas comisiones.

## Persistencia

Migración `20260928_0053_carwash_settlements.py`, después de `20260928_0052`:

- `carwash_settlements`: sucursal, empleado/nombre capturado, caja, moneda, importe, estado,
  vínculos únicos al egreso y reverso, claves/huellas de idempotencia, versión y motivo/fecha
  del reverso.
- `carwash_settlement_details`: comisión, importe y fecha de reverso; índice único parcial por
  workspace/comisión mientras `reversed_at IS NULL`. Un devengo no puede pertenecer a dos pagos
  vigentes.
- Claves foráneas compuestas para mantener workspace/sucursal entre caja, movimientos,
  liquidaciones y comisiones. Los checks relacionan importe cero, movimientos y estado de reverso.
- Restricción única adicional de scope en `cash_movements`, creada antes de las nuevas tablas.
- El downgrade rechaza liquidaciones existentes, incluidas las revertidas, para proteger su
  historial. La prueba de round-trip elimina únicamente fixtures de la base desechable antes de
  comprobar el esquema vacío.

## Verificación y entrada para fase 5

`backend/tests/test_carwash_commissions.py` cubre dos roles de la misma persona, importes cero,
resúmenes sin duplicación, filtros y fechas locales, permisos, sucursales, versiones, métodos
inactivos/no efectivos, caja cerrada, CxC pendiente, conciliación con Finanzas, fallos después del
flush, reintentos concurrentes con la misma y distintas claves, carrera contra anulación y
reverso en un turno nuevo. Las regresiones de POS y las migraciones se ejecutan con el control
completo `npm run prepush` y su cobertura mínima del 80 %, sin exclusiones nuevas.

`frontend/tests/carwashCommissions.test.jsx` comprueba caja/permisos, total decimal, reintento
estable, motivo/versión de reverso y copia de API en solo lectura. El recorrido full-stack de
Carwash ahora incluye liquidación con respuesta perdida, reverso móvil e historial, después de
configuración, recepción, facturación y comprobantes. Las suites que recrean `erp_test` se
ejecutan secuencialmente. Las capturas quedan en `output/playwright/carwash-phase4-*.png`.

La fase 5 debe implementar los indicadores principales y gráficos usando las ventas y devengos
vigentes, manteniendo el conteo único por lavado y las fechas de sucursal. Los cuatro resúmenes
de Comisiones ya son reales; los indicadores superiores y la pestaña Reportes siguen pendientes.
La desactivación del módulo conserva todos los datos.

## Resultados y entorno local

- Backend: `npm run prepush` aprobado, 432 pruebas y cobertura 89,70 %, más 8 pruebas enfocadas
  aprobadas tras añadir comprobaciones de fecha máxima, fallos de integridad y agrupación de
  varios lavados con importes iguales. Ruff, formato y mypy aprobados sobre los cambios finales.
- Frontend: 482 pruebas Vitest en 125 archivos, build y 8 pruebas visuales Playwright aprobadas.
  Un recorrido full-stack aprobado incluye todas las fases entregadas, hasta liquidación y
  reverso; se verificó además que el motivo, total y confirmación quedan accesibles en móvil.
- Base local persistente migrada a `20260928_0053`; copia previa en
  `backend/.local/carwash-local-before-phase4.dump`. No se recreó ni se añadieron fixtures a esa
  base. API reiniciada en `http://127.0.0.1:8000`, con `/health/ready` compatible; frontend en
  `http://localhost:3000/carwash?tab=comisiones`. Inicio de sesión, permisos y consulta verificados
  en navegador sin errores JavaScript.
- Logs: `backend/.local/carwash-phase4-{prepush,final-targeted}.log` y
  `output/playwright/carwash-phase4-{vitest,build,ui,fullstack}.log`.
