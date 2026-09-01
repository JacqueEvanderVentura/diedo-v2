# Terminal POS API

Terminal POS integra **Punto de Venta**, **Caja** y **Cuentas por cobrar (CxC)** sobre una sola
fuente transaccional en PostgreSQL. El contrato HTTP vive bajo `/api/v1/pos`; usa Bearer token,
campos JSON en `camelCase`, montos decimales serializados como strings y alcance por `workspace` y
sucursal.

Las lecturas de estado dinámico llevan `Cache-Control: no-store`. Una referencia fuera del
workspace o de las sucursales visibles se oculta con 404.

## Arquitectura y entidades

El router valida el contrato HTTP, `PosService` posee las transacciones y reglas de negocio,
`PosRepository` realiza persistencia y PostgreSQL protege los invariantes durables. Terminal POS
reutiliza clientes, sucursales, catálogo comercial, almacenes, inventario, métodos de pago, Agenda,
usuarios y auditoría de los módulos existentes.

La migración `20260831_0013_terminal_pos` incorpora doce tablas:

- `sales_document_counters`: numeración atómica por workspace y tipo de documento.
- `sales_quotes` y `sales_quote_lines`: cotizaciones y ventas en espera con snapshots de precio,
  impuesto, descuento, cliente e ítem.
- `sales` y `sale_lines`: comprobante de venta, forma de pago y líneas comerciales inmutables.
- `cash_registers`: turno de caja por sucursal, sus acumulados y arqueo versionado.
- `cash_movements` y `cash_movement_lines`: libro append-only de entradas, salidas y reversos.
- `customer_receivables` y `customer_receivable_lines`: deuda originada exactamente por una venta o
  una cita.
- `customer_payments`: cobros aplicados con ciclo `posted`/`reversed`.
- `payment_proofs`: evidencia perteneciente exactamente a una CxC o a un cobro.

`payment_methods` añade cuatro decisiones semánticas que se copian como snapshot en documentos y
movimientos: `channel` (`cash`, `card`, `bank_transfer`, `payment_link`, `credit`, `other`),
`settlementPolicy` (`immediate`, `pending_confirmation`, `receivable`), `affectsCashDrawer` y
`requiresEvidence`. Sólo un método con canal `cash` puede afectar el cajón. Cambiar la configuración
posteriormente no reescribe el historial.

Estados públicos:

- caja: `open`, `closed`;
- cotización: clase `quote|held` y estado `open|converted|cancelled|expired`;
- venta: `completed|voided`;
- CxC: `pending|partial|paid|cancelled`;
- cobro: `posted|reversed`.

## Permisos

| Código | Capacidad |
|---|---|
| `pos.read` | Hidratar el estado agregado de Terminal POS. |
| `pos.sell` | Ejecutar checkout. |
| `pos.discount.override` | Aplicar descuento o sustituir el precio de catálogo. Se comprueba además de `pos.sell` o `sales.quote.manage`. |
| `pos.register.manage` | Abrir y cerrar turnos de caja. |
| `pos.cash.read` | Leer caja, arqueos y movimientos. |
| `pos.cash.manage` | Registrar ingresos y egresos manuales. |
| `pos.receivables.read` | Leer resumen, cuentas, cobros y comprobantes. |
| `pos.receivables.collect` | Cobrar, adjuntar evidencia y revertir cobros. |
| `pos.receivables.manage` | Editar vencimiento/notas o cancelar una CxC. |
| `pos.void` | Anular ventas. |
| `sales.read` | Leer cotizaciones, ventas y resumen comercial. |
| `sales.quote.manage` | Crear, editar, cancelar y convertir cotizaciones o ventas en espera. |

Todos los permisos respetan el alcance de sucursales derivado de las asignaciones de rol.

## Endpoints

### Estado inicial del terminal

- `GET /api/v1/pos/state?branchId={uuid}` — `pos.read`. Entrega catálogo vendible y métodos de
  pago. El agregado incluye caja sólo con `pos.cash.read`, cotizaciones/ventas sólo con
  `sales.read` y CxC/resumen sólo con `pos.receivables.read`; los dominios no autorizados se
  devuelven vacíos.

El estado inicial es un bootstrap acotado. Caja y CxC continúan con los endpoints paginados, y los
detalles de cotización o cuenta se solicitan sólo al abrir una fila; así el terminal no crece en
tiempo de respuesta proporcional a todo el historial del negocio.

### Caja

- `GET /api/v1/pos/registers/current?branchId={uuid}` — `pos.cash.read`.
- `GET /api/v1/pos/registers?branchId=&page=&pageSize=` — `pos.cash.read`.
- `POST /api/v1/pos/registers` — `pos.register.manage` e `Idempotency-Key`.
- `GET /api/v1/pos/registers/{registerId}` — `pos.cash.read`; incluye resumen y movimientos.
- `GET /api/v1/pos/registers/{registerId}/movements?page=&pageSize=&type=` — `pos.cash.read`;
  pagina el libro completo del turno.
- `POST /api/v1/pos/registers/{registerId}/movements` — `pos.cash.manage` e
  `Idempotency-Key`.
- `POST /api/v1/pos/registers/{registerId}/close` — `pos.register.manage`, versión e
  `Idempotency-Key`.

Apertura recibe `branchId`, `openingCash`, moneda opcional y notas. El movimiento manual recibe
`type=income|expense`, concepto, monto, `paymentMethodId`, referencia/notas opcionales y hasta 100
líneas; si existen líneas, su suma debe coincidir exactamente con el monto. El cierre recibe
`countedCash`, `version` y notas opcionales.

Cada caja expone un resumen autoritativo con ventas totales, cantidad completada y anulada, desglose
por método de pago y reconciliación del efectivo. El detalle conserva una ventana reciente en
`movements` e informa `movementsTotal`; el endpoint paginado permite recorrer el historial completo.
El listado de cajas devuelve `movementsCount` y el mismo resumen sin cargar todas las líneas.

### Cotizaciones y ventas en espera

- `GET /api/v1/pos/quotes` — `sales.read`; filtra por `branchId`, `customerId`, `status`, `kind` y
  paginación.
- `GET /api/v1/pos/quotes/summary?branchId=` — `sales.read`; cuenta y totaliza por separado
  cotizaciones abiertas, ventas retenidas y conversiones.
- `POST /api/v1/pos/quotes` — `sales.quote.manage` e `Idempotency-Key`.
- `GET /api/v1/pos/quotes/{quoteId}` — `sales.read`.
- `PATCH /api/v1/pos/quotes/{quoteId}` — `sales.quote.manage` y versión.
- `POST /api/v1/pos/quotes/{quoteId}/cancel` — `sales.quote.manage`, versión y motivo.

Crear o editar usa `kind`, `branchId`, cliente opcional, descuento opcional, una a 100 líneas,
notas, vencimiento, `paymentMethodId` y `reference` opcionales. Las líneas no pueden repetir
`itemId`; al asignarlo, `dueAt` debe estar en el futuro. El método debe estar activo al asignarlo y
se conserva como snapshot completo. En `PATCH`, omitir método o referencia preserva su valor;
enviar `null` lo limpia. Las respuestas exponen el snapshot como `paymentMethod` y la referencia
como `reference`. Una cotización convertida, cancelada o expirada no puede volver a editarse.

La expiración se materializa en PostgreSQL. Antes de responder el estado inicial, un listado o un
detalle, el backend ejecuta dentro de la misma transacción una transición atómica y limitada al
workspace y sucursales autorizadas: toda fila `open` con `expiresAt <= clock_timestamp()` pasa a
`expired`, recibe `closedAt` y aumenta su `version`. Por eso un filtro `status=open` nunca devuelve
una cotización cuyo plazo ya terminó. `PATCH`, cancelación y checkout bloquean primero la fila y
repiten la misma transición condicional; si venció, confirman únicamente la expiración y responden
conflicto, sin aplicar la edición ni crear la venta.

### Checkout y ventas

- `POST /api/v1/pos/checkout` — `pos.sell` e `Idempotency-Key`.
- `GET /api/v1/pos/sales/summary?branchId=&dateFrom=&dateTo=` — `sales.read`.
- `GET /api/v1/pos/sales` — `sales.read`; filtra por sucursal, `registerId`, cliente, estado,
  fechas y paginación. Cada fila incluye método de pago, referencia, vendedor y versión para que
  Caja no tenga que cargar el detalle individual.
- `GET /api/v1/pos/sales/{saleId}` — `sales.read`.
- `POST /api/v1/pos/sales/{saleId}/void` — `pos.void`, versión, motivo e `Idempotency-Key`.

Checkout recibe `branchId`, `registerId`, `paymentMethodId`, cliente/referencia/cotización
opcionales, descuento, líneas y notas. Cuando incluye `quoteId` debe incluir también `quoteVersion`
y requiere tanto `pos.sell` como `sales.quote.manage` en la sucursal; la versión se comprueba
después de bloquear la cotización para impedir convertir una edición obsoleta. Una forma de pago no
inmediata exige un cliente registrado y crea una CxC; una forma inmediata que requiere evidencia se
rechaza para que la confirmación ocurra mediante el flujo de CxC. La respuesta incluye la venta y
`receivableId` cuando corresponde.

### Cuentas por cobrar, cobros y evidencias

- `GET /api/v1/pos/receivables/summary?branchId=` — `pos.receivables.read`.
- `GET /api/v1/pos/receivables` — `pos.receivables.read`; filtra por `branchId`, `customerId`,
  `status`, `overdue` y paginación.
- `GET /api/v1/pos/receivables/{receivableId}` — `pos.receivables.read`.
- `PATCH /api/v1/pos/receivables/{receivableId}` — `pos.receivables.manage`; actualiza
  `dueDate` o `notes` con `version`.
- `POST /api/v1/pos/receivables/{receivableId}/payments` —
  `pos.receivables.collect`, multipart e `Idempotency-Key`.
- `POST /api/v1/pos/receivables/{receivableId}/proofs` — `pos.receivables.collect`, multipart;
  adjunta una evidencia general a la cuenta.
- `POST /api/v1/pos/receivables/{receivableId}/cancel` — `pos.receivables.manage`, versión y
  motivo.
- `POST /api/v1/pos/payments/{paymentId}/reverse` — `pos.receivables.collect`, versión, motivo e
  `Idempotency-Key`.
- `GET /api/v1/pos/proofs/{proofId}/content` — `pos.receivables.read`; descarga privada con
  `Cache-Control: private, no-store` y `ETag` basado en SHA-256.

El cobro multipart acepta `amount`, `methodId`, `version`, `reference`, `note`, `registerId` y
`file`. El monto no puede superar el saldo. Un método `receivable` no sirve para pagar otra deuda;
si afecta efectivo exige una caja abierta de la misma sucursal, y si `requiresEvidence=true` exige
archivo. Una CxC originada por venta sólo se cancela anulando la venta; no puede desacoplarse
directamente mientras la venta siga completada. Una CxC de Agenda con cobros aplicados sólo puede
cancelarse después de revertirlos.

Las respuestas de CxC incluyen `paymentMethod` cuando la deuda nació de una venta con método
diferido. Código, nombre, canal, política de liquidación y banderas se leen del snapshot durable de
la CxC; sólo el icono se completa desde el registro histórico del método o con el fallback de UI.
Las CxC originadas en Agenda no asignan método y responden `paymentMethod: null`. `overdue` es una
bandera derivada: vale `true` sólo para estados `pending|partial` cuando `dueDate` es anterior a la
fecha actual en la zona horaria de la sucursal; el estado financiero no cambia. El resumen incluye
`partialCount` además de montos y cantidades pendientes/vencidas.

## Transacciones e invariantes

Checkout es una sola transacción: bloquea la caja abierta y los balances de inventario; valida
sucursal, cliente, método y cotización; recalcula precios, descuento e impuesto; descuenta stock;
crea venta y líneas; crea el movimiento de caja o la CxC según la liquidación; convierte la
cotización; registra auditoría y finalmente confirma. Cualquier error revierte el conjunto completo.

El backend siempre recalcula los importes desde el catálogo. Cambiar `unitPrice` o aplicar cualquier
descuento requiere `pos.discount.override`; los descuentos fijos o porcentuales se distribuyen por
línea y el impuesto se redondea por línea. Productos consumen stock del almacén predeterminado;
servicios no generan movimiento. Los balances se bloquean en orden determinista y una venta no puede
dejar stock negativo.

Anular una venta no borra registros: crea el movimiento de inventario inverso, agrega un reverso de
caja cuando aplica, cancela su CxC sin cobros y marca la venta `voided`. Una venta con cobros de CxC
aplicados exige revertirlos primero. Las operaciones financieras conservan snapshots y auditoría.

PostgreSQL garantiza como máximo una caja abierta por sucursal. El libro de caja es append-only; los
reversos apuntan al movimiento original. El efectivo esperado se reconcilia como:

```text
openingCash + cashSales + cashReceivablePayments + manualIncome - cashExpenses
```

Cerrar guarda efectivo esperado, efectivo contado y diferencia. Los cierres, anulaciones,
actualizaciones y reversos usan versión optimista para detectar una vista desactualizada.

Los estados de CxC se derivan de `amount` y `paidAmount`: cero pagado es `pending`, un abono es
`partial` y saldo cero es `paid`. Pagar o revertir bloquea la cuenta, actualiza su saldo, sincroniza
Agenda cuando el origen es una cita y, si hay efectivo, modifica la misma caja dentro de la
transacción.

## Datos demo para pruebas

El fixture versionado `demo-data/v1/pos.json` instala un escenario sintético, coherente y repetible
en las cuatro sucursales. Incluye cuatro cajas, seis cotizaciones, dieciséis ventas, seis CxC, cinco
cobros, quince movimientos de caja y nueve movimientos de inventario. Hay ventas en efectivo,
tarjeta, transferencia y crédito, descuentos, anulaciones con reversos, cuentas pendientes,
parciales, pagadas y canceladas, y un arqueo con sobrante y otro con faltante.

El sembrado utiliza IDs estables y puede ejecutarse varias veces sin duplicar registros. En
desarrollo o prueba, con `DEMO_SEED_ENABLED=true` y la contraseña demo configurada:

```powershell
python -m app.scripts.seed_demo
```

Los nombres, teléfonos y referencias son datos ficticios diseñados para pruebas; no contienen PII
de clientes reales.

## Integración con Agenda

Una cita con `pendingPayment=true` y `pendingAmount>0` crea o actualiza una CxC de origen
`appointment` dentro de la misma transacción de Agenda. Exige un cliente registrado vinculado. Al
retirar el saldo pendiente se cancela la cuenta sólo si no tiene pagos; los cobros y reversos
actualizan el saldo pendiente de la cita. Existe como máximo una CxC por cita.

## Idempotencia y concurrencia

`Idempotency-Key` debe tener entre 8 y 128 caracteres. Es obligatorio para abrir/cerrar caja,
movimientos manuales, crear cotizaciones, checkout, anular ventas, registrar cobros y revertir
cobros. Repetir la misma clave con el mismo payload devuelve el resultado original; reutilizarla
con otro payload devuelve 409. Las claves derivadas enlazan de forma estable los movimientos de
inventario, caja y CxC creados por una operación principal.

PATCH y cancelaciones no retry-keyed usan `version`; los estados terminales que corresponde tratar
como repetibles se devuelven sin duplicar efectos. La carga independiente de evidencia se deduplica
por cuenta y checksum SHA-256.

## Evidencias

Se aceptan PDF, JPEG, PNG y WebP hasta `ATTACHMENT_MAX_BYTES` (10 MiB como máximo configurable).
Se valida tipo declarado y contenido, se normaliza el nombre y se almacena tamaño y SHA-256. El blob
se elimina si falla la transacción de metadatos. Cada descarga vuelve a aplicar workspace y alcance
de sucursal; nunca se expone la ruta de almacenamiento.

## Errores y verificación

Los errores esperados usan `{ "message": "...", "parameter": "..." }`: 400 para operación
inválida, 401 para autenticación, 403 para autorización, 404 para recursos ausentes u ocultos y 409
para versión, idempotencia, estado, concurrencia o stock insuficiente.

Desde `backend/`:

```powershell
uv run ruff check app tests
uv run ruff format --check app tests
uv run mypy app
uv run pytest -q -m "not integration"
uv run alembic upgrade head
uv run alembic check
```

Con PostgreSQL de prueba configurado explícitamente como `erp_test`, ejecutar también la suite de
integración POS. Desde `frontend/`, validar adaptadores, estado, compilación y flujo real:

```powershell
npm test
npm run build
npm run test:e2e:full-stack
```

No ejecutar pytest de integración y el harness full-stack en paralelo: ambos recrean y comparten el
schema de `erp_test`.
