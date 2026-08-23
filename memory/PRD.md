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

## Backlog (future phases)
- P1 Fase 2: `/pos/caja` (cierre de caja real), `/pos/cuentas-por-cobrar`. Real "Item manual" in cart; real print/download.
- P1 Fase 3: `/inventarios` + catálogo/config items.
- P2 Fase 4: CRM `/crm/clientes`, `/crm/ventas`. Fase 5 Agenda. Fase 6 Finanzas. Fase 7 Reportes. Fase 8 Config tenant.
- P2: block zero-value sale on 100% discount; render single CartPanel instance per viewport.

## Next tasks
- Await user review of módulo Activos; proceed to Fase 4 (CRM Clientes + Ventas) on confirmation.
