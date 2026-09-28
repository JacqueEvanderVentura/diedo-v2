# Carwash — fase 1: configuración rápida

La configuración funciona con API y PostgreSQL reales. El módulo continúa deshabilitado por
defecto; ninguna compañía real se activa con la migración. Recepción, cobro, comisiones
devengadas y reportes quedan para sus fases respectivas.

## Entrega

- `/carwash?tab=configuracion&branchId=…`: servicios configurados por sucursal, búsqueda,
  filtro de habilitación y paginación. `serviceSearch`, `serviceEnabled` y `servicePage`
  se conservan en la URL.
- «Nuevo Servicio» permite seleccionar servicios comerciales existentes o crear hasta 20
  servicios desde el mismo modal. Los nuevos se crean en Inventarios y se habilitan en Carwash
  dentro de una sola transacción. No existe un segundo catálogo de precios.
- Edición de porcentajes y habilitación con versión. Valores iniciales 20 %/5 %, rango 0–100,
  suma máxima 100 y auditoría de los cambios.
- Nombre, precio, impuesto, categoría y disponibilidad provienen del catálogo. Precio con
  moneda del workspace. La edición comercial abre Inventarios en otra pestaña;
  «Recargar valores actuales» actualiza el modal.
- Accesos a categorías y empleados sin cerrar el formulario. No tener empleados aún permite
  configurar servicios; la recepción de fase 2 exigirá responsables.
- Tablas en escritorio, tarjetas `ResponsiveList` en móvil y pie del modal visible.
  Los datos sintéticos continúan limitados a la demo de solo lectura.
- Los fallos de carga conservan la última copia como solo lectura; una denegación la elimina.
  Las escrituras fallidas no anuncian éxito. Reintentar una creación ambigua conserva
  exactamente el payload y la clave de idempotencia.

## Backend y migración

Aplicar `alembic upgrade head` con el procedimiento normal del entorno. La revisión
`20260928_0050` crea únicamente `carwash_service_configs`, con FK compuesta hacia la asignación
comercial y unicidad workspace/sucursal/servicio. No copia precios ni modifica entitlements.
El downgrade elimina esta tabla; no es el mecanismo para desactivar el módulo.
La desactivación normal conserva los registros.

Contrato y permisos: [CARWASH_API.md](../../docs/backend/CARWASH_API.md). Se extrajo
`InventoryService.create_item_in_transaction` para confirmar un lote completo; el endpoint
público de Inventarios conserva su transacción y contrato.

## Validación y evidencia

Pruebas específicas: `backend/tests/test_carwash_settings.py`,
`frontend/tests/carwashSettings.test.jsx`, `frontend/e2e/carwash.spec.js` y
`frontend/e2e/full-stack/carwash.spec.js`.

El recorrido full-stack crea una compañía descartable, activa Carwash, crea dos servicios
desde el modal, reintenta el lote, recarga, edita/deshabilita/rehabilita, cambia el precio
comercial, comprueba aislamiento de compañías, simula un fallo de lectura, habilita un servicio
gratuito existente y conserva la búsqueda en la URL. También verifica que revocar y reactivar
conserva los registros. Las pruebas de API fuerzan dos lecturas iniciales simultáneas antes de
crear el mismo lote y prueban ediciones concurrentes, rollback y fuentes comerciales inactivas.

Capturas reproducibles en `output/playwright/` (ignoradas por Git):

- `carwash-phase1-create-desktop.png`
- `carwash-phase1-settings-desktop.png`
- `carwash-phase1-edit-mobile.png`
- `carwash-phase1-settings-mobile.png`

Resultados finales (27 de septiembre de 2026):

| Control | Resultado |
| --- | --- |
| Backend `npm run prepush` | Ruff, formato, mypy, upgrade/check de migraciones y reset de base: aprobados. **398 pruebas**, **89,35 %** de cobertura, umbral 80 % sin exclusiones nuevas. |
| Frontend `npm test` | **469 pruebas**, 122 archivos; los 4 casos específicos se repitieron tras el ajuste visual final. |
| Frontend `npm run build` | Aprobado. Mantiene advertencias preexistentes de atributos duplicados en CRM, imports mixtos y tamaño del bundle. |
| `npm run test:e2e -- carwash.spec.js` | **8 casos** aprobados, incluyendo demo, permisos, escritorio y móvil. |
| `npm run test:e2e:full-stack -- carwash.spec.js` | **1 recorrido** aprobado con navegador, API y persistencia reales. |

Backend validado con PostgreSQL 18.6 local y descartable, `APP_ENV=test`, base `erp_test` en
127.0.0.1:5434. Las suites que recrean la base se ejecutaron secuencialmente. Los logs quedan
en `backend/.local/carwash-phase1-prepush.log` y `output/playwright/carwash-phase1-*.log`.
Las migraciones y activaciones se probaron solo en esta base descartable.

## Punto de entrada para fase 2

Crear lavados y líneas con snapshots de precio, impuestos, tasas y responsables. Admitir solo
configuraciones `enabled` cuya fuente esté disponible en el workspace/sucursal. Los endpoints
actuales son administrativos y requieren `carwash.settings.manage`; la recepción debe tener
su propia consulta autorizada para `carwash.wash.manage`, sin dar permisos de configuración
a todos los recepcionistas.

La tabla de configuración no toca historial. Como todavía no hay lavados en esta fase, la
prueba de invariancia de snapshots se incorporará junto con las entidades de fase 2.
Completar permanece deshabilitado; no registrar ventas, caja o devengos al recibir lavados.
