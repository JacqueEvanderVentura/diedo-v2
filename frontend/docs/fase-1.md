# Fase 1 — Navbar + Dashboard + Terminal POS

## Alcance construido
- **Scaffold Vite** (React JS, sin TS/Next) con estructura modular escalable, Tailwind + SCSS,
  fonts Inter/Outfit self-host (woff2), Lenis (scroll suave), framer-motion, `/agents` y `/docs`.
- **Router**: `/` → redirect `/dashboard`. Rutas `/dashboard`, `/pos` y placeholders de módulos futuros.
- **Layout**: `PageShell` (Sidebar colapsable + Navbar). Sidebar con navegación registrada en
  `data/navigation.js`, drawer en mobile.
- **Dashboard**: saludo dinámico, filtro de período persistente (Hoy/Semana/Mes/Trimestre),
  4 KPIs, gráfica de área "Tendencia de Ventas" (recharts), panel "Alertas de Stock" con scroll,
  "Agenda: Citas de Hoy" (empty state) y "Actividad Reciente". Skeletons al cambiar de período.
- **Terminal POS**: búsqueda, bubbles de categoría scroll-x, selector de sucursal, cards de
  producto (badge Servicio/Stock/Agotado → sku → título → precio azul), y **carrito**.

## Stores
- `uiStore` — sidebar drawer (mobile) + colapso desktop (persistido).
- `dashboardStore` — período persistido + selectores de KPIs/tendencia.
- `posStore` — carrito, cliente, descuento, ITBIS, método de pago, comprobante y drawer;
  con selectores derivados (subtotal, descuento, impuesto, total, conteo). Persistido.

## Decisiones UX del carrito (img1 → img2)
- **Carrito = sidebar derecha STICKY** (~360–400px, full height) en desktop. **NO** se apila
  bajo el grid de productos. Layout 2 columnas: productos (flex-1) + carrito (der).
- **Footer del carrito siempre visible**: descuento, subtotal, ITBIS, **Total grande** y CTA
  "Cobrar" fijos abajo; la lista de items tiene **scroll interno propio**.
- **Mobile**: carrito en **bottom sheet / drawer** disparado por un FAB con contador de items.
  Nunca stack infinito tipo UX vieja.
- Orden del panel: Header (Carrito Actual + `+ Item` / `Limpiar`) → Selector de cliente →
  Lista de items (scroll) → Descuento/Totales → Método de pago + CTA → Acciones secundarias
  (Imprimir, Descargar, Gasto).
- Pagos: efectivo / tarjeta / **transferencia + upload de comprobante** (validación inline si falta).
- Sin `alert()`: toasts (sonner), empty states diseñados, validaciones inline, skeletons.

## Mock / placeholders
- Datos en `src/data`. Consumo simulado vía `services/apiClient.js` + `endpoints.js`
  (registro de mocks + latencia). Listo para cambiar a `fetch` real sin tocar componentes.

## Pendiente (fases siguientes)
- Fase 2: `/pos/caja`, `/pos/cuentas-por-cobrar`. Item manual real en carrito, impresión/descarga real.
