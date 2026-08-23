# PRD — Diedo / Vilma AI (ERP & POS)

## Problem statement (original)
Rebuild of "Diedo / Vilma AI", a multi-module business ERP/POS as a PWA.
Fixed stack: React + Vite (JS/JSX, NO TypeScript, NO Next, NO real backend), Zustand (+persist),
Tailwind + SCSS, framer-motion / Lenis, Inter (UI) + Outfit (headings) self-hosted woff2,
mock data via `services/apiClient.js` + `endpoints.js`, folders `/agents` and `/docs` always present.
Currency DOP$, language Spanish. Phased roadmap (Fase 0–9+). **This delivery = FASE 1**:
Navbar + Dashboard + POS Terminal, with the POS cart as a sticky RIGHT sidebar (img1 → img2).

## User choices (confirmed)
- Vite (reconfigured `yarn start` → vite, no supervisor edit). Scalable modular folder structure.
- Fase 1 only. 100% mock (no backend). Follow reference screenshots style. Currency = DOP$.

## Architecture
- Frontend-only Vite app in `/app/frontend`. `yarn start` runs `vite` on :3000 (supervisor-managed).
- Modular: `src/modules/<module>/{pages,components}`, shared `src/components/{ui,layout}`,
  `src/stores` (Zustand+persist), `src/services` (apiClient/endpoints placeholders), `src/data` (mock),
  `src/lib` (utils, DOP$ format, Lenis), `src/styles` (SCSS + tokens). `/agents` + `/docs` present.

## Personas
- Gerente / cajero de un negocio de servicios (spa/láser) operando el POS y revisando el dashboard.

## Core requirements (static)
- Dashboard: greeting, persistent period filter, KPIs, sales trend chart, stock alerts, appointments (empty state), activity feed.
- POS: search, category bubbles (scroll-x), branch selector, product cards, sticky right cart sidebar (mobile drawer),
  customer selector, discounts/totals, payment methods (efectivo/tarjeta/transferencia+upload), checkout, print/download/gasto mocks.
- No alert(): toasts, skeletons, empty states, inline validations. data-testid on all interactive elements.

## Implemented (2026-06 / Fase 1) — DONE
- Vite scaffold, Tailwind+SCSS, self-hosted Inter/Outfit woff2, framer-motion, sonner, recharts (Lenis removed — it broke internal scroll).
- Router `/`→`/dashboard`, `/dashboard`, `/pos`, `/pos/caja`, `/pos/cuentas-por-cobrar`, placeholders for future modules.
- Layout: expandable grouped Sidebar (brand "Diedo App / Admin Console", logout, pending-CxC badge) + mobile drawer, Navbar.
- Dashboard (KPIs, chart, stock alerts, activity, appointments empty state, persisted period filter).
- POS (grid, category filter, search, add-to-cart, qty steppers, discount, ITBIS 18%, customer & branch selectors,
  5 payment methods incl. Link/Cta.Cobrar + reference/voucher input + transfer upload validation, checkout, mobile FAB+drawer).
- Stores: uiStore, dashboardStore, posStore (persisted).
- Verified by testing agent: iteration_1 (14/14), iteration_2 (4 bug fixes: scroll/Lenis, grouped sidebar, compact cart footer, payment reference).

## Implemented (2026-06 / Fase 2) — DONE
- **/pos/caja**: open/close register, opening cash, shift stats (efectivo inicial, ventas efectivo, gastos, efectivo en caja),
  shift expenses list, last-close summary. Cash math: efectivo en caja = inicial + ventas efectivo − gastos.
- **/pos/cuentas-por-cobrar**: summary (total pendiente + count), filters (Pendientes/Cobradas/Todas), table,
  "Marcar cobrado" (row → confirmado, no cash impact), detail modal (Confirmar pago / Cobrar en efectivo → suma a caja).
- posStore extended (register, expenses, sales, receivables, seed) + actions (openRegister/closeRegister/addExpense/recordSale/markReceivablePaid).
  `RECEIVABLE_METHODS = transferencia|link|cxc` generate a pending CxC at checkout; efectivo credits the drawer; checkout blocked if caja closed.
- Pending-CxC badges in sidebar + POS top bar; caja/CxC shortcuts in POS top bar.
- Verified by testing agent: iteration_3 (12/12 scenarios). Fixed surfaced logic: row "Marcar cobrado" no longer inflates cash for non-cash methods; markReceivablePaid guards double-pay; CxC table date/layout polish.

## POS polish round (2026-06) — DONE (verified iteration_4/5, 100%)
- Toasts no longer stack (top-center, single visible).
- Discount can be entered as AMOUNT (DOP$) or PERCENT with automatic conversion + helper.
- Transfer proof upload no longer overflows the cart (CartPanel root w-full/min-w-0 + aside overflow-hidden + truncated filename + Quitar).
- Transfer requires EITHER photo proof OR reference number (one of two, not both).
- Customer selector: first option 'Crear nuevo cliente' opens a modal, creates + auto-selects (posStore.customers + addCustomer).
- Modal closes on Escape.

## Implemented (2026-06 / Fase 3) — DONE (verified iteration_6, 100%)
- `catalogStore` = single source of truth (products/services, persist 'diedo-catalog'); CRUD + decrementForSale + getLowStock.
- `/inventarios`: dense table, search + category bubbles, summary chips, low/critical badges, CRUD via ProductFormModal.
- POS ProductGrid reads catalog; sale decrements product stock; Dashboard StockAlerts derived from catalog.
- Fix: cart qty capped at available stock (no over-sell, toast warning); updateProduct price guard; DRY dashboard via deriveLowStock.

## Implemented (2026-06 / Módulo Activos) — DONE (self-verified via screenshot)
- Decisión de arquitectura: módulo dedicado (NO tag de categoría) para no ensuciar el catálogo del POS.
- `activosStore` (persist 'diedo-activos'): CRUD (addActivo/updateActivo/deleteActivo) + getStats; categorías (mobiliario/equipos/tecnología/vehículos/herramientas/otros) y estados (activo/reparación/baja).
- `/activos`: stat cards (valor total excl. baja, operativos, en reparación, baja), buscador, filtros por categoría y estado, tabla con badges, CRUD vía ActivoFormModal (nombre, código/serie, valor, ubicación, fecha compra, categoría, estado, notas).
- Sidebar entry (icon Landmark) + ruta en router. Versión simple (valor + estado + categoría), sin depreciación por elección del usuario.

## Implemented (2026-06 / Fase 5 Agenda) — DONE (verified iteration_7, 13/13)
- `agendaStore` (persist 'diedo-agenda', version 2 + `merge` que re-ancla citas semilla al día actual sin tocar las del usuario): CRUD (add/update/delete/setStatus), getByDate/getToday, helper todayKey/toKey; estados pendiente/confirmada/completada/cancelada.
- `/agenda`: vistas Día y Semana, navegación prev/next/Hoy, tarjetas de cita (hora, cliente, servicio+DOP$, duración, badge estado) con editar/eliminar visibles (touch-friendly). Semana = 7 columnas, hoy resaltado, contador por día; click en columna precarga esa fecha.
- `AppointmentFormModal`: liga cliente (posStore.customers) + servicio (catalogStore type=service, autollena precio), fecha/hora, duración, estado, notas.
- Dashboard: `AppointmentsToday` lee del agendaStore (lista + "Ver agenda"); KPI en vivo "Citas Hoy" (id 'citas') reemplaza el placeholder 'personal'.
- Fixes post-test: bug de fallback falsy en updateAppointment (precio/duración 0 se descartaban), acciones ocultas hover-only, capitalización del label de rango.

## Implemented (2026-06 / Fase 4 CRM) — DONE (verified iteration_8, 15/15)
- Reutiliza `posStore` como fuente: `customers` (+ nuevo `updateCustomer`, campos email/points/notes) y `sales` (nuevo `SEED_SALES` historial; persist version 2 + `merge` que inyecta ventas semilla si vacío). No afecta la caja del turno.
- `/crm/clientes`: directorio (excluye walk-in), chips (clientes, con compras, puntos), búsqueda nombre/teléfono/email, "Total gastado" derivado de ventas, CRUD vía CustomerFormModal.
- `CustomerDetailModal`: contacto, puntos, total gastado, historial de compras (posStore.sales) y próximas citas (agendaStore por customerId) — cross-module Agenda↔CRM verificado.
- `/crm/ventas`: tabla de historial (fecha, cliente, artículos, método, referencia, total) con filtros por método + búsqueda y resumen (conteo + monto total).
- Navegación CRM = Clientes + Ventas; /crm redirige a /crm/clientes. Fix cosmético: puntos con separador de miles.

## Implemented (2026-06 / Fase 6 Finanzas lite) — DONE (verified iteration_9, 100%)
- `finanzasStore` (persist 'diedo-finanzas'): expenses variables (SEED 5, categorizadas + fecha) y fixedExpenses mensuales (SEED 4); CRUD para ambos. EXPENSE_CATEGORIES compartidas.
- `/finanzas/gastos`: resumen (Ingresos período · Gastos variables · Gastos fijos mensual · Balance = ing − var − fijos), toggle período Mes actual/Todo, tabla variable (CRUD) que además muestra gastos de caja (posStore.expenses) como solo-lectura con badge "Caja", y sección de gastos fijos en tarjetas (CRUD lite).
- `/finanzas/ingresos`: derivados de posStore.sales — banner informativo, resumen (total, N.º ventas, ticket promedio), desglose por método (%), tabla; toggle período.
- Sin plan contable ni asientos (resumen simple). Helpers finanzas/lib (parseWhen/fmtWhen/isThisMonth). Nav Finanzas activa (Gastos + Ingresos).

## Implemented (2026-06 / Fase 7 Reportes core) — DONE
- Módulo `reportes` con filtros de período reutilizados del dashboard (Hoy/Semana/Mes/Trimestre) vía `PeriodFilter`; lib con inPeriod/buildSeries (buckets diarios≤31d o semanales)/mockFromId. Solo lectura desde stores.
- `/reportes/generales`: KPIs (ingresos, N.º ventas, ticket promedio) + BarChart ventas por día + PieChart ventas por método (posStore.sales).
- `/reportes/inventario`: KPIs (productos con stock, valor inventario, bajo stock) + bar Stock actual (top 8) + bar Rotación estimada (mock) + pie Valor por categoría (catalogStore).
- `/reportes/agenda`: KPIs (citas, cumplidas, no-show, tasa asistencia) + pie distribución por estado (real) + bar agrupado Cumplidas vs No-show últimos 7 días (mock) (agendaStore).
- Nav Reportes = grupo (Generales/Inventario/Agenda); /reportes redirige a /reportes/generales.

## Implemented (2026-06 / Fase 8 Configuración tenant core) — DONE
- Nuevo `configStore` (persist 'diedo-config') = fuente única de branches, categories, paymentMethods, users y settings (seed desde data/products). Refactor: POS (CategoryBubbles, BranchSelector, PaymentSection) e Inventarios (página + ProductFormModal) leen del configStore.
- `/configuracion/sucursales`: ajustes generales (nombre negocio, región, impuesto default) + CRUD de sucursales con toggle activa.
- `/configuracion/usuarios`: CRUD de usuarios con roles mock (Administrador/Gerente/Cajero/Recepción) y estado activo.
- `/configuracion/categorias`: CRUD de categorías del catálogo POS (cross-module con POS/Inventarios).
- `/configuracion/metodos-pago`: activar/desactivar métodos (solo activos aparecen en el cobro POS) + agregar/eliminar personalizados; los core no se eliminan.
- Impuesto default alimenta el ITBIS por defecto de nuevos productos. Nav Configuración = grupo; /configuracion redirige a sucursales. Sin permisos granulares/WhatsApp/nómina aún.
- Fixes post-test (iteration_11, 97%): PaymentSection reconcilia el método seleccionado si se desactiva en config (useEffect → primer activo); guard de última sucursal movido a configStore.deleteBranch; Sidebar consume settings.businessName (marca + inicial).

## Implemented (2026-06 / Mejoras Agenda+CRM) — DONE (verified iteration_12, 100%)
- "Agendar desde Cliente": botón en CustomerDetailModal abre AppointmentFormModal con el cliente preseleccionado (nueva prop defaultCustomerId); la cita creada aparece en /agenda y en las "Próximas citas" del cliente.
- "Confirmar Cita": botones rápidos en las tarjetas de Agenda (día y semana) para marcar Cumplida (completada) o No-show (nuevo estado 'noshow') con toast; estado persiste.
- Reporte de Agenda ahora usa DATOS REALES: KPIs (cumplidas/no-show/tasa asistencia), dona por estado y comparativa semanal Cumplidas vs No-show derivadas de citas reales (ya no mock). Fix cosmético: KPI renombrado a "No-show".

## Backlog (future phases)- P1 Fase 2: `/pos/caja` (cierre de caja real), `/pos/cuentas-por-cobrar`. Real "Item manual" in cart; real print/download.
- P1 Fase 3: `/inventarios` + catálogo/config items.
- P2 Fase 4: CRM `/crm/clientes`, `/crm/ventas`. Fase 5 Agenda. Fase 6 Finanzas. Fase 7 Reportes. Fase 8 Config tenant.
- P2: block zero-value sale on 100% discount; render single CartPanel instance per viewport.

## Next tasks
- Fase 8 (Configuración) implementada — todas las fases core (1–8) del roadmap completas. Await user review / próximas mejoras.
