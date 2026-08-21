# Diedo / Vilma AI — Frontend (Fase 1)

ERP/POS multi-módulo construido como **PWA** con **React + Vite** (JS/JSX, sin TypeScript, sin Next).
Esta entrega cubre la **Fase 1**: Navbar + Dashboard + Terminal POS. 100% datos mock.

## Stack
- **React + Vite** (JavaScript, sin TypeScript)
- **Zustand** (+ `persist`) para estado — `src/stores`
- **Tailwind CSS + SCSS** — `src/styles`
- **framer-motion** + **Lenis** (scroll suave global)
- **Inter** (UI) + **Outfit** (headings), self-host woff2 en `public/fonts`
- **recharts** para gráficas, **lucide-react** para iconos, **sonner** para toasts
- Moneda **DOP$** (`src/lib/format.js`), idioma **Español**

## Cómo correr
```bash
yarn install
yarn dev        # o: yarn start  → http://localhost:3000
yarn build      # build de producción
```
> En esta plataforma, supervisor ejecuta `yarn start` (mapeado a Vite) en el puerto 3000.

## Estructura
```
public/fonts/            # woff2 self-hosted (Inter, Outfit)
agents/                  # contexto para agentes IA (convenciones + reglas)
docs/                    # documentación viva (fase-1.md, ...)
src/
  components/
    ui/                  # primitivos: Button, Card, Badge, Input, Modal, Skeleton, EmptyState
    layout/              # PageShell, Navbar, Sidebar, Placeholder
  data/                  # mock: products, customers, dashboard, navigation
  lib/                   # utils (cn), format (DOP$), useLenis
  modules/
    dashboard/           # pages + components
    pos/                 # pages + components (carrito sidebar + drawer)
  services/              # apiClient.js + endpoints.js (placeholders)
  stores/                # uiStore, dashboardStore, posStore
  styles/                # index.scss + _tokens.scss
  router/                # rutas (/, /dashboard, /pos)
```

## Agregar un módulo nuevo
1. `src/modules/<modulo>/pages` + `.../components`
2. Registrar ruta en `src/router/index.jsx`
3. Añadir entrada en `src/data/navigation.js`
4. Crear store en `src/stores` si necesita estado

Ver `agents/README.md` para las convenciones y reglas UX no negociables.
