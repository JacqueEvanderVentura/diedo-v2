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
- Moneda **RD$** (`src/lib/format.js`), idioma **Español**

## Cómo correr

### Solo frontend (modo demo)
```bash
cd frontend
yarn install
yarn dev        # → http://localhost:3000
```
Sin backend, la app funciona con datos mock y usuario demo (`CURRENT_USER`).

### Frontend + API (PostgreSQL)
Terminal 1 — backend (desde `backend/`):
```bash
docker compose up -d          # Postgres en :5433
pip install -r requirements.txt
alembic upgrade head
python -m app.scripts.bootstrap_local
# opcional: python -m app.scripts.seed_local_demo
uvicorn app.main:app --reload --port 8000
```

Terminal 2 — frontend:
```bash
cd frontend
cp env.example .env           # VITE_API_BASE_URL=/api-backend
yarn dev                      # proxy /api-backend → :8000
```

Login: `owner@erp.dev` (contraseña definida en `backend/.env` → `LOCAL_BOOTSTRAP_ADMIN_PASSWORD`).

```bash
yarn build      # build de producción
```

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
  lib/                   # utils (cn), format (RD$), useLenis
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
