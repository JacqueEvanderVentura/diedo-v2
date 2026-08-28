# Fase 2 — Caja + Cuentas por Cobrar (POS ops)

## Alcance construido
- **`/pos/caja`** — Abrir/cerrar caja con efectivo inicial; stats del turno (efectivo inicial,
  ventas en efectivo, gastos, efectivo en caja); lista de gastos del turno; resumen del último cierre.
- **`/pos/cuentas-por-cobrar`** — Tabla de CxC (cliente, método, referencia, fecha, monto, estado),
  filtros (Pendientes/Cobradas/Todas), "Marcar cobrado" (mock), modal de detalle con opción de
  cobrar en efectivo (suma a la caja) o confirmar pago.
- **Badge de pendientes** en el sidebar (sub-item "Cuentas por Cobrar") y en el PosTopBar ("Por Cobrar").
- **Atajos** en PosTopBar: "Cerrar/Abrir Caja" y "Por Cobrar".

## Decisiones
- Se **reutiliza `posStore`** (sin reescribir Dashboard/POS layout). Se añadió: `register` (caja),
  `cashSales`, `expenses`, `sales`, `receivables`, `lastCloseSummary` + acciones
  (`openRegister`, `closeRegister`, `addExpense`, `recordSale`, `markReceivablePaid`) y selectores
  (`getCashExpenses`, `getCashInDrawer`, `getPendingReceivables`, `getPendingTotal`). Todo persistido.
- **Métodos de pago** ampliados a 5: efectivo, tarjeta, transferencia, **link**, **cta. por cobrar**.
  `RECEIVABLE_METHODS = ['transferencia','link','cxc']` → al cobrar generan una **CxC pendiente**.
- **Loop de dinero cerrado**: `recordSale` en el checkout suma efectivo a la caja (efectivo) o crea
  una CxC (transferencia/link/cxc). `addExpense` (modal Gasto) descuenta efectivo de la caja.
  `Efectivo en caja = inicial + ventas efectivo − gastos`.
- Cobrar requiere **caja abierta** (si está cerrada, muestra toast y bloquea).
- Seed inicial: 3 CxC (2 pendientes, 1 cobrada) + caja abierta con RD$ 2,000 para demo.

## Placeholders
- `services/apiClient.js` + `endpoints.js` intactos (mock). Print/Download/logout siguen como toasts.

## Pendiente (fases siguientes)
- Fase 3: Inventarios + catálogo. Moras/intereses en CxC, recordatorios, y arqueo detallado en caja.
