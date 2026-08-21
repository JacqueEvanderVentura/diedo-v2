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
- Vite scaffold, Tailwind+SCSS, self-hosted Inter/Outfit woff2, Lenis, framer-motion, sonner, recharts.
- Router `/`→`/dashboard`, `/dashboard`, `/pos`, placeholders for future modules.
- Layout: collapsible Sidebar (desktop) + mobile drawer, Navbar.
- Dashboard fully built (KPIs, chart, stock alerts, activity, appointments empty state, period filter persisted).
- POS fully built (grid, category filter, search, add-to-cart, qty steppers, discount, ITBIS 18%, customer & branch
  selectors, payment tabs + transfer upload validation, checkout clears cart, Imprimir/Descargar/Gasto mocks, mobile FAB+drawer).
- Stores: uiStore, dashboardStore, posStore (all persisted where relevant).
- Verified by testing agent: 14/14 frontend flows PASS. Minor fixes applied (mobile drawer close overlap,
  Gasto toast DOP$ format, chart height warning, mobile filter scroll).

## Backlog (future phases)
- P1 Fase 2: `/pos/caja` (cierre de caja real), `/pos/cuentas-por-cobrar`. Real "Item manual" in cart; real print/download.
- P1 Fase 3: `/inventarios` + catálogo/config items.
- P2 Fase 4: CRM `/crm/clientes`, `/crm/ventas`. Fase 5 Agenda. Fase 6 Finanzas. Fase 7 Reportes. Fase 8 Config tenant.
- P2: block zero-value sale on 100% discount; render single CartPanel instance per viewport.

## Next tasks
- Await user review of Fase 1; proceed to Fase 2 (Caja + CxC) on confirmation.
