# PO backlog — fases de implementación

Índice vivo del trabajo solicitado por Producto. El producto se llama **Helios 360** (rebrand completado en Fase 0).

## Estado por fase

| Fase | Tema | Estado |
|------|------|--------|
| 0 | Helios 360 rebrand + favicons + PWA/SEO | Completada |
| 1 | Fundamentos compartidos (gráficos, fechas, sucursales) | Completada |
| 2 | Bugfixes rápidos | Completada |
| 3 | Nueva cita UX | Completada |
| 4 | Estados agenda + cumplida en retraso | Completada |
| 5 | Caja por sucursal | Completada |
| 6 | Factura + cotización PDF | Completada |
| 7 | Anular factura + elevación de permisos | Completada |
| 8 | Activos + incidencias | Completada |
| 9 | CRM templates + pipeline iOS | Completada |
| 10 | Categorías | Completada |
| 11 | Pipeline → factura | Completada |
| 12 | Reportes consolidado + dividendos | Completada |
| 13 | KPI personal + insumos | Completada |

## Fase 0 — Helios 360 rebrand (completada)

### Qué se hizo

- **Favicons:** `favicon.ico`, PNG 16/32, SVG, `apple-touch-icon.png`, Android 192/512 en [`frontend/public/`](../frontend/public/).
- **HTML head:** [`frontend/index.html`](../frontend/index.html) — título, meta description, theme-color, Open Graph, Twitter Card, JSON-LD `SoftwareApplication`, manifest link.
- **PWA:** [`frontend/public/site.webmanifest`](../frontend/public/site.webmanifest) — nombre, descripción `es-DO`, iconos, shortcuts (Dashboard, POS, Agenda, Caja), `theme_color` `#395F7E`, `background_color` `#0E0E0E`.
- **Componente de marca:** [`HeliosIcon`](../frontend/src/components/brand/HeliosIcon.jsx) + `PRODUCT_NAME` export.
- **Copy UI:** sidebar, login, config, facturas, navegación, agenda pública, CRM leads.
- **Demo seed:** `businessName` → `Helios 360 Demo` en `demo-data` y snapshot.
- **Docs:** README frontend, agents, design_guidelines, este índice.

### Qué no se cambió (a propósito)

- **Claves `localStorage` internas** (`diedo-config`, `diedo-pos`, etc.) — renombrarlas borraría datos demo persistidos. Migración opcional en fase futura.

## Fase 1 — Fundamentos compartidos (completada)

### Qué se hizo

- **Animaciones de gráficos:** [`frontend/src/lib/chartAnimation.js`](../frontend/src/lib/chartAnimation.js) — `CHART_ANIMATION` (~800ms ease-out) aplicado en dashboard, finanzas y todos los reportes Recharts.
- **Período unificado:** [`DatePeriodFilter`](../frontend/src/components/ui/DatePeriodFilter.jsx) — presets (Hoy/Semana/Mes/Trimestre) + Desde/Hasta en un solo control; lógica en [`datePeriod.js`](../frontend/src/lib/datePeriod.js) y [`reportes.js`](../frontend/src/modules/reportes/lib/reportes.js).
- **Multi-sucursal:** [`BranchMultiSelect`](../frontend/src/components/ui/BranchMultiSelect.jsx) + helpers en [`branches.js`](../frontend/src/lib/branches.js) (`matchesBranches`, `filterByBranches`, `applyBranchFilter`).
- **Integración:** Dashboard, `ReportFilterBar`, reportes (Generales, Agenda, Personal, Inventario, Dividendos, Membresías), historial de Caja.
- **Hover en tarjetas:** KPI dashboard, pipeline CRM, stat cards de reportes, KPI de caja y finanzas (`scale-[1.02]` + sombra).

### Cómo verificar

1. Dashboard: cambiar período con presets y rango personalizado; seleccionar 1..N sucursales.
2. Reportes → Generales: mismos filtros; gráficos animan al cargar.
3. CRM → Pipeline: hover en tarjetas de oportunidad.
4. POS → Caja → Historial: filtro multi-sucursal.

### Nota API

- Rango personalizado en dashboard con sesión **online** requiere soporte `dateFrom`/`dateTo` en backend (pendiente); funciona completo en **demo** y en reportes con datos locales.

## Fase 2 — Bugfixes rápidos (completada)

### Qué se hizo

- **Distribución de ingresos:** normalización de etiquetas (`Transferencia` / `transferencia`, `Efectivo` / `efectivo`) en backend [`reports.py`](../backend/app/services/reports.py) y demo [`reportes.js`](../frontend/src/modules/reportes/lib/reportes.js).
- **ITBIS en POS:** el carrito recalcula `taxPct` desde el catálogo al vuelo ([`posStore.js`](../frontend/src/stores/posStore.js), [`CartPanel.jsx`](../frontend/src/modules/pos/components/CartPanel.jsx)).
- **Incidencias:** adjuntos optimistas al subir + lightbox para ampliar fotos ([`incidenciasStore.js`](../frontend/src/stores/incidenciasStore.js), [`IncidenciaDetail.jsx`](../frontend/src/modules/incidencias/components/IncidenciaDetail.jsx)).
- **RRHH horario:** validación explícita con alertas; el modal ya no cierra si hay bloques inválidos ([`schedule.js`](../frontend/src/modules/rrhh/lib/schedule.js), [`EmployeeFormModal.jsx`](../frontend/src/modules/rrhh/components/EmployeeFormModal.jsx)).
- **Sidebar Finanzas:** orden Overview → Ingresos → Gastos → resto ([`navigation.js`](../frontend/src/data/navigation.js)).
- **Dividendos:** sin presets Hoy/Semana; solo Mes/Trimestre + rango personalizado ([`DividendosPage.jsx`](../frontend/src/modules/reportes/pages/DividendosPage.jsx)).
- **Salida múltiple:** eliminado selector de cita vinculada ([`SalidaMultipleModal.jsx`](../frontend/src/modules/inventarios/components/SalidaMultipleModal.jsx)).

### Cómo verificar

1. Reportes → Generales: un solo segmento Transferencia y uno Efectivo en el pie.
2. Editar ITBIS de un producto en inventario y volver al POS: total actualizado sin recargar.
3. Incidencias: subir foto aparece al instante; clic amplía la imagen.
4. RRHH → horario 1:00–1:00 muestra error y no guarda.
5. Dividendos: filtros de período sin Hoy/Semana.

## Fase 3 — Nueva cita UX (completada)

### Qué se hizo

- **Orden del formulario:** Cliente → Fecha/hora → Servicio → Empleado; Sucursal, Cabina y Notas debajo del flujo crítico ([`AppointmentFormModal.jsx`](../frontend/src/modules/agenda/components/AppointmentFormModal.jsx)).
- **Pickers personalizados:** [`DatePicker`](../frontend/src/components/ui/DatePicker.jsx) y [`TimePicker`](../frontend/src/components/ui/TimePicker.jsx) reemplazan `type="date"` / `type="time"` nativos (misma UI en iPad y Mac).
- **Cupos por empleado:** si hay empleado seleccionado, `TimePicker` muestra solo horarios disponibles; si no, grilla estándar 08:00–19:30.
- **Nueva cita más rápida:** tarjeta de compartir solo al editar una cita existente.

### Cómo verificar

1. Agenda → Nueva cita: primeros campos son Cliente y Fecha en la misma fila (desktop).
2. Fecha abre calendario custom (no rueda iOS); hora abre grilla de botones.
3. Servicio y Empleado vienen después de fecha/hora.
4. Crear una cita completa en menos de un minuto sin pickers nativos.

## Fase 4 — Estados agenda + cumplida en retraso (completada)

### Qué se hizo

- **Estados canónicos:** CONFIRMADO, CUMPLIDA, NO SHOW, CANCELADO (se eliminaron pendiente, asistió, retrasada, reprogramada de la UI).
- **Migración backend:** `completed`/`attended` → `fulfilled`; nuevos campos `completed_at`, `completion_punctuality`, `delay_responsibility`, `completion_note`.
- **Flujo cumplida:** modal amigable al marcar cumplida (a tiempo vs retraso; si retraso: Centro/Cliente + nota opcional).
- **Resumen visible:** “Cumplida a las HH:MM” o “Cumplida en retraso · Cliente/Centro”.
- **Reportes:** distribución de estado usa Cumplidas, no Completada/Asistió.

### Cómo verificar

1. Gestión de citas: selector de estado solo muestra los 4 estados.
2. Marcar cumplida → elegir retraso → guardar responsable; el resumen aparece en agenda.
3. Reportes → Agenda: pie de distribución con Cumplidas / Confirmadas / NO SHOW / Canceladas.

## Fase 5 — Caja por sucursal (completada)

### Qué se hizo

- **Contexto de caja independiente del POS:** `cajaBranchId` y caché `registerByBranch` en [`posStore.js`](../frontend/src/stores/posStore.js); abrir/cerrar ya no depende del selector de sucursal del terminal.
- **Selector explícito en Caja:** sucursal visible al abrir y al operar la caja abierta ([`CajaPage.jsx`](../frontend/src/modules/pos/pages/CajaPage.jsx)).
- **Barra de estado multi-sucursal:** [`BranchRegisterStatusBar.jsx`](../frontend/src/modules/pos/components/BranchRegisterStatusBar.jsx) muestra Abierta/Cerrada por sucursal y permite cambiar sin mezclar efectivo.
- **Historial consolidado online:** `hydrateRegisterHistory()` carga cierres de todas las sucursales; el filtro multi-sucursal del historial sigue aplicando.

### Cómo verificar

1. Abrir caja en Charm DN, cambiar a Santiago y abrir otra caja: cada una conserva su efectivo.
2. Cerrar una sucursal no cierra la otra.
3. Historial de cajas filtra por sucursal sin mezclar montos.

## Fase 6 — Factura + cotización PDF (completada)

### Qué se hizo

- **Factura CRM con snapshot completo:** [`buildInvoiceDataFromSale`](../frontend/src/modules/crm/lib/sales.js) usa número documental (`FAC-…`), sucursal y líneas; [`ensureSaleDetail`](../frontend/src/stores/crmStore.js) carga líneas online antes de imprimir/descargar ([`SaleDetailModal.jsx`](../frontend/src/modules/crm/components/SaleDetailModal.jsx)).
- **Cotización CRM como documento:** mismo motor HTML/PDF (`kind: 'quote'`) con código **COT-xxxx** visible; botones Imprimir/Descargar en [`CotizacionesPage.jsx`](../frontend/src/modules/crm/pages/CotizacionesPage.jsx).
- **Plantilla:** [`invoice.js`](../frontend/src/modules/pos/lib/invoice.js) muestra validez de cotización y pie de documento diferenciado.

### Cómo verificar

1. POS → agregar ítems → Imprimir/Descargar: sucursal + líneas en el PDF.
2. CRM → Ventas → abrir venta → Imprimir: líneas y sucursal (online carga detalle si faltaba).
3. CRM → Cotizaciones → Imprimir/Descargar: documento con **COT-2026-xxx**, cliente, sucursal e ítems.

## Fase 11 — Pipeline → factura (completada)

### Qué se hizo

- **Cerrar = facturar:** al mover una oportunidad a **Cerrado**, se abre un modal de confirmación con vista previa `FAC-…` y la sucursal.
- **Checkout:** usa la cotización vinculada (ítems + total) y genera la venta vía `pos.checkout` online o venta demo local; la oportunidad queda cerrada.
- **Descarga automática:** al confirmar, se descarga el PDF de la factura ([`pipelineInvoice.js`](../frontend/src/modules/crm/lib/pipelineInvoice.js), [`CloseOpportunityInvoiceModal.jsx`](../frontend/src/modules/crm/components/CloseOpportunityInvoiceModal.jsx)).
- **Permisos:** requiere `pos.sell`; si falta, se ofrece elevación de permisos de 3 minutos (mismo patrón que anular factura).

### Cómo verificar

1. CRM → Pipeline: oportunidad con cliente + cotización con ítems (demo: **Glamour Studio** / `opp-1`).
2. Arrastrar a **Cerrado** → confirmar → PDF `FAC-…` se descarga.
3. CRM → Ventas: aparece la nueva venta.
4. Usuario sin `pos.sell`: pide autorización de supervisor antes de facturar.

### Requisitos

- Cliente vinculado y cotización con al menos un ítem.
- Modo online: caja abierta en la sucursal de la oportunidad.

## Fase 13 — KPI personal + insumos (completada)

### Qué se hizo

- **BOM por servicio:** cada servicio puede definir insumos esperados (`supplyBom`) en el catálogo demo ([`products.js`](../frontend/src/data/products.js), [`serviceBom.js`](../frontend/src/modules/inventarios/lib/serviceBom.js)).
- **Consumo esperado vs real:** salidas de inventario se comparan contra citas cumplidas × BOM; varianza visible en Reportes → Personal → Insumos y KPI ([`supplyUsage.js`](../frontend/src/modules/inventarios/lib/supplyUsage.js)).
- **KPI personal:** nueva pestaña con score compuesto (citas, puntualidad Fase 4, incidencias RRHH, sobreuso de insumos), gráficos y ranking ([`personalKpi.js`](../frontend/src/modules/reportes/lib/personalKpi.js), [`PersonalPage.jsx`](../frontend/src/modules/reportes/pages/PersonalPage.jsx)).
- **Puntualidad:** KPIs y tarjetas resumen usan `completionPunctuality` de citas cumplidas.

### Cómo verificar

1. Servicio **1 sesión axilas** (`p2`) tiene BOM de 1 guante (`sup-1`).
2. Con 2 citas cumplidas del servicio y 3 salidas de guantes para el mismo empleado → varianza **+1** en Insumos y penalización en KPI.
3. Reportes → Personal → **KPI personal**: ranking, gráfico de score y esperado vs real.

## Fase 12 — Reportes consolidado + dividendos (completada)

### Qué se hizo

- **Reporte consolidado:** en Reportes → Generales, gráficos de ventas **CRM / Pipeline** vs **Comercio / POS** y distribución por **origen de captación** (mostrador, redes, referidos). Usa `channel`/`quoteId` de la venta y `acquisitionSource` del cliente ([`consolidatedReport.js`](../frontend/src/modules/reportes/lib/consolidatedReport.js), endpoint `GET /reports/general/consolidated`).
- **Dividendos ricos:** KPIs de utilidad, barra por sucursal, pie por socio, detalle por sucursal con P&L, tabla consolidada por socio, botones **Calcular / Exportar / Exportar nómina** ([`DividendosPage.jsx`](../frontend/src/modules/reportes/pages/DividendosPage.jsx), [`dividendsReport.js`](../frontend/src/modules/reportes/lib/dividendsReport.js)).
- **Backend:** summary de dividendos incluye `byBranch`, `byPartner`, utilidad neta real (puede ser negativa) y desglose bruto/gastos por sucursal.

### Cómo verificar

1. Reportes → Generales: una venta POS y un cierre de pipeline (Fase 11) caen en buckets distintos del consolidado.
2. Reportes → Dividendos: gráficos, KPIs y export CSV; período sin Hoy/Semana.
3. Cambiar sucursal/período → **Calcular** refresca montos y gráficos.

## Fase 10 — Categorías (completada)

### Qué se hizo

- **`categoryKind` en backend:** migración `20260908_0025` en `item_categories` (`product`, `service`, `supply`, `income`, `expense`).
- **Adapter corregido:** [`catalog.js`](../frontend/src/services/adapters/catalog.js) ya no fuerza `type: 'producto'`; persiste el tipo al crear/editar online.
- **Configuración → Categorías:** pestañas **Catálogo** (Todos / Productos / Servicios / Insumos) y **Finanzas** (Ingreso / Egreso) en [`CategoriasPage`](../frontend/src/modules/configuracion/pages/CategoriasPage.jsx).
- **Finanzas:** formularios de ingreso y gasto leen categorías `ingreso`/`gasto` del `configStore` (con fallback legacy).
- **Inventario → Movimientos:** filtro **Solo insumos** + datalist de nombres de insumos en la búsqueda.

### Cómo verificar

1. Crear categoría **Servicio** y **Insumo** → recargar → conservan su tipo.
2. Finanzas → Gastos: aparecen chips de categorías de egreso configuradas.
3. Finanzas → Ingresos: selector incluye categorías de ingreso.
4. Inventarios → Movimientos → Alcance **Solo insumos** filtra salidas de materiales.

### Migración backend

- Ejecutar `alembic upgrade head` para `20260908_0025_category_kind`.

## Fase 9 — CRM templates + pipeline iOS (completada)

### Qué se hizo

- **Origen de captación:** WhatsApp, Instagram, Referido, Otros y Mostrador/POS en clientes y leads (`acquisition_source` en backend + formularios CRM).
- **Clientes por sucursal del usuario:** filtro automático en [`ClientesPage`](../frontend/src/modules/crm/pages/ClientesPage.jsx) vía [`customerScope.js`](../frontend/src/lib/customerScope.js); multi-sucursal sigue visible si incluye la sucursal del usuario.
- **Plantillas WhatsApp:** selector con **vista previa** antes de enviar, **crear plantilla** (Administrador/Gerente) y chips **PRIMER NOMBRE** / **TELÉFONO** en el editor ([`WhatsAppMenuButton`](../frontend/src/components/ui/WhatsAppMenuButton.jsx), [`PlantillasWaPanel`](../frontend/src/modules/configuracion/components/PlantillasWaPanel.jsx)).
- **Pipeline iOS:** arrastre con Pointer Events + fantasma elevado ([`usePointerKanban`](../frontend/src/modules/crm/hooks/usePointerKanban.js)) reemplaza HTML5 DnD.

### Cómo verificar

1. Usuario con solo Charm DN no ve clientes exclusivos de Santiago (pero sí los que comparten DN).
2. CRM → Clientes → WhatsApp: elegir plantilla → vista previa con primer nombre → enviar.
3. Configuración → Plantillas WA: chip PRIMER NOMBRE inserta `{{firstName}}` en el cursor.
4. Pipeline en viewport tablet: arrastrar tarjeta entre columnas sin recargar.

### Migración backend

- Ejecutar `alembic upgrade head` para `20260908_0024_acquisition_source`.

## Fase 8 — Activos + incidencias (completada)

### Qué se hizo

- **Fotos en activos:** adjuntos múltiples en demo y online (`asset_attachments` + `POST /api/v1/inventory/assets/{id}/attachments`); miniaturas y lightbox en [`ActivosTab`](../frontend/src/modules/inventarios/components/ActivosTab.jsx) y [`ActivoFormModal`](../frontend/src/modules/activos/components/ActivoFormModal.jsx).
- **Cinco AC identificables:** seed demo `EQP-009` … `EQP-013` con placas/fotos de color distinto en [`activosStore.js`](../frontend/src/stores/activosStore.js).
- **Historial desde incidencia:** icono ojo en [`IncidenciaDetail`](../frontend/src/modules/incidencias/components/IncidenciaDetail.jsx) abre [`ActivoHistoryModal`](../frontend/src/modules/activos/components/ActivoHistoryModal.jsx) con incidencias + mantenimientos del activo.
- **Comentarios en vivo:** comentarios optimistas en modo online ([`incidenciasStore.js`](../frontend/src/stores/incidenciasStore.js)).
- **Finanzas con comprobantes:** adjuntos en ingreso/egreso (demo/local) vía [`AttachmentField`](../frontend/src/components/ui/AttachmentField.jsx); gastos de mantenimiento vinculables a activo.

### Cómo verificar

1. Inventarios → Activos: EQP-009 y EQP-010 muestran miniaturas de color distinto; clic amplía.
2. Incidencias ligadas a un activo → icono ojo → historial con fotos de incidencias y mantenimiento.
3. Finanzas → Gastos → categoría Mantenimiento: vincular activo y adjuntar factura/foto.
4. Incidencias: comentario aparece al instante sin recargar la página.

### Migración backend

- Ejecutar `alembic upgrade head` para `20260908_0023_asset_attachments`.

## Fase 7 — Anular factura + elevación de permisos (completada)

### Qué se hizo

- **Permiso canónico:** `sales.invoice.void` para anular facturas; `sales.quote.manage` sigue gobernando cotizaciones (cancelación simple).
- **Backend IAM:** `POST /api/v1/auth/elevate` y `POST /api/v1/auth/elevate/revoke` con unión temporal de permisos del supervisor (3 min) sobre la sesión activa sin cambiar de usuario.
- **UI:** modal de autorización ([`PermissionElevationModal`](../frontend/src/components/auth/PermissionElevationModal.jsx)), banner “Permisos elevados hasta HH:MM · Cerrar” ([`ElevationBanner`](../frontend/src/components/auth/ElevationBanner.jsx)).
- **Anulación:** Caja y detalle CRM de venta usan `sales.invoice.void`; si falta permiso, piden elevación antes del motivo de anulación.

### Cómo verificar

1. Usuario sin `sales.invoice.void` no ve la anulación completarse sin elevación.
2. Supervisor autoriza con sus credenciales → banner visible → anular factura funciona.
3. Tras 3 min (o Cerrar en el banner) el permiso extra desaparece.
4. Demo: usuario demo no puede anular sin elevación; supervisor `demo.luz.supervisor@example.com` / contraseña `demo-supervisor`.

---

### Cómo verificar (Fase 0)

1. Abrir `http://localhost:3000` — pestaña muestra icono H/compass.
2. DevTools → Application → Manifest: nombre **Helios 360**, 8 iconos, 4 shortcuts.
3. Sidebar y login muestran **Helios 360**, no Diedo/Vilma.
4. View source: `og:title`, `twitter:card`, `application/ld+json` presentes.

### Assets de marca

| Archivo | Uso |
|---------|-----|
| `favicon.svg` | Tab icon, `HeliosIcon` en app |
| `helios-360-full.png` | Open Graph / Twitter |
| `helios-360-icon.png` | Referencia logo cuadrado |
| `helios-360-text.png` | Wordmark |
