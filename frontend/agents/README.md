# /agents

Carpeta de contexto para agentes de IA que colaboran en el proyecto **Diedo / Vilma AI**.

## Propósito
Mantener instrucciones, prompts y decisiones que los agentes deben conocer antes de
tocar el código. Siempre presente en el repo (junto con `/docs`).

## Convenciones del proyecto
- **Stack:** React + Vite (JS/JSX, sin TypeScript, sin Next). Sin backend real: todo mock.
- **Estado:** Zustand (`src/stores/*`), con `persist` donde aplique.
- **Estilos:** Tailwind + SCSS (`src/styles`). Tokens en `_tokens.scss`.
- **Animaciones:** framer-motion + Lenis (scroll suave global).
- **Fonts:** Inter (UI) + Outfit (headings), self-host woff2 en `public/fonts`.
- **Datos:** mock en `src/data`, consumidos vía `src/services/apiClient.js` + `endpoints.js`.
- **Moneda:** RD$ (usar `formatDOP` de `src/lib/format.js`).
- **Idioma:** Español en toda la UI.

## Reglas UX no negociables
- POS: carrito = **sidebar derecha sticky** en desktop; **drawer/bottom sheet** en mobile.
- Checkout footer siempre visible (totales + CTA).
- Filtros de categoría = **bubbles horizontales** scroll-x (nunca `<select>`).
- Empty states + skeletons + validaciones inline (nunca `alert()`).
- Todo elemento interactivo lleva `data-testid` en kebab-case.

## Cómo agregar un módulo nuevo
1. Crear `src/modules/<modulo>/pages` y `.../components`.
2. Registrar ruta en `src/router/index.jsx`.
3. Añadir entrada en `src/data/navigation.js`.
4. Crear store en `src/stores` si necesita estado.
