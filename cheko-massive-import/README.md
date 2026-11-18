# Importación masiva Cheko → Diedo (Charm)

Orquestador: [`backend/app/scripts/run_cheko_massive_import.py`](../backend/app/scripts/run_cheko_massive_import.py)

## Datos de entrada

| Carpeta | Uso |
|---------|-----|
| `agenda/*.json` | Citas + **clientes** (únicos por `client_id`) |
| `finanzas/**/Reporte_*Gastos*.md` | Egresos línea a línea |
| `finanzas/**/Reporte_*Ingresos*.md` o `ingresos-charm-dn.md` | Ingresos manuales |
| `finanzas/**/gasto-fijo.json` | Gastos fijos |
| `finanzas/**/liabilities.json` | Pasivos |
| `finanzas/categories.json` | Categorías de gasto (catálogo `item_categories`) |
| `finanzas/sucursales.json` | Mapeo Cheko → sucursales Diedo |

## Preview (sin BD)

```powershell
cd backend
python -m app.scripts.run_cheko_massive_import --steps preview
```

## Producción (túnel SSH Railway en `15433`)

```powershell
cd backend
$env:APP_ENV = "production"
$env:DATABASE_URL = "postgresql+psycopg://postgres:***@127.0.0.1:15433/railway"

python -m app.scripts.run_cheko_massive_import --steps wipe categories customers agenda finance
```

Pasos por separado (reanudar):

```powershell
python -m app.scripts.run_cheko_massive_import --steps customers agenda finance
```

Reporte: `backend/.local/cheko-import-report.json`

## Corregir datos ya importados (sucursal / duplicados)

El import antiguo asignaba **las tres** sucursales Charm a cada cliente del CSV combinado.
Eso no se corrige con un re-import parcial: el upsert solo **añade** sucursales, no quita las
incorrectas (p. ej. un cliente solo de Santiago con etiqueta CHARM DN).

**Recomendado:** volver a cargar clientes y citas desde Cheko con el script actualizado:

```powershell
python -m app.scripts.run_cheko_massive_import --steps wipe customers agenda
```

Antes del wipe, puedes fusionar homónimos sin teléfono desde **CRM → Clientes → Duplicados**
(coincidencia por nombre ≥ 90%).

## CSV para UI (clientes + citas)

```bash
cd backend
python -m app.scripts.export_cheko_import_csvs
```

Archivos en `out/`:

- `customers-charm-dn.csv`, `customers-charm-sde.csv`, `customers-charm-stgo.csv` →
  **Configuración → Importar → Clientes**, cada archivo a **su** sucursal Charm.
- `customers-from-agenda.csv` → referencia combinada (no importar una sola vez a DN).
- `agenda-charm-dn.csv`, `agenda-charm-sde.csv`, `agenda-charm-stgo.csv` → **Citas** en la
  misma sucursal, con **syncCustomers** desactivado (después de importar clientes).
- Batch adicional SDE: `customers-sde-update.csv` y `agenda-sde-update.csv` (desde
  `agenda/sde-update.json`), importar en **Charm SDE** en ese orden.

Orden sugerido por sucursal: clientes DN → citas DN → clientes SDE → citas SDE → clientes
STGO → citas STGO. O repetir los tres CSV de clientes y luego los tres de citas.

Finanzas solo por script: `--steps categories finance`.