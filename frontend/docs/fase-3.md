# Fase 3 — Inventarios + Catálogo compartido

## Alcance construido
- **`catalogStore`** (`src/stores/catalogStore.js`) = **única fuente de verdad** de productos/servicios,
  seed desde `data/products.js`, persistido (`diedo-catalog`).
  - CRUD: `addProduct`, `updateProduct`, `deleteProduct`, `setStock`.
  - `decrementForSale(items)` descuenta stock de productos vendidos.
  - `getLowStock()` / `deriveLowStock()` (umbral `LOW_STOCK_THRESHOLD = 5`).
- **`/inventarios`** — tabla densa operativa: buscador + bubbles de categoría (reutiliza el del POS),
  chips resumen (items, productos, servicios, bajo stock), badges low/critical, y CRUD vía modal
  (`ProductFormModal`: tipo producto/servicio, nombre, sku, precio, ITBIS, stock, categoría, sucursal).
- **POS lee del mismo store**: `ProductGrid` ahora consume `useCatalogStore` (no el array estático).
- **Venta descuenta stock**: `CartPanel.handleCheckout` llama `decrementForSale(items)` tras `recordSale`.
- **Dashboard coherente**: "Alertas de Stock" se deriva del catálogo (no más array mock).

## Done when (cumplido)
- Editar el stock/precio de un item en Inventarios se refleja **en vivo** en las cards del POS.
- Una venta de producto **descuenta** el stock mock (y puede pasar a AGOTADO en el POS + alerta en dashboard).

## No tocado
- Caja/CxC intactos, salvo el wire de descuento de stock al vender.

## Pendiente (fases siguientes)
- Fase 4: CRM Clientes + ventas. Movimientos de inventario/ajustes con historial, import CSV, multi-sucursal real.
