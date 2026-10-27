# Handoff — Bugs CRM / Finanzas / Inventarios

**Fecha:** 2026-10-26  
**Para:** un agente de desarrollo en **otro chat** (el de Agenda sigue aparte).  
**Workspace de repro:** `franchesko-columna`  
**Ambiente de evidencia:** prod API Railway (`diedo-production` / servicio `api`) + código actual. QA tiene espejo de datos del 2026-10-26.

No mergear. No escribir en prod. Verificar en frontend QA o prod con un **usuario staff real** (el que ya ve datos). No usar el admin QA inventado para Agenda (ACL de cabinas vacío).

## Cómo usar

1. Leer este archivo. Implementar en el orden de abajo.
2. Quitar cualquier `#region agent log` que se añada al debuggear.
3. PR a `qa` solo si Jean lo pide.

## Contexto detectado

- Mismos módulos que el ERP: FastAPI + React 19 + Zustand.
- Las “compras” del reporte CRM **no** son Órdenes de compra: `ComprasPage.jsx` abre el **mismo** `SaleDetailModal` (historial de ventas del cliente).
- El backend, ante cualquier excepción no mapeada, responde exactamente: `{"message":"Error interno del servidor."}` (`backend/app/core/errors.py` `unhandled_exception_handler`). El usuario **nunca** debería ver esa frase.
- No hay `ErrorBoundary` en el frontend: un throw en render deja la **pantalla en blanco**.

---

## Orden de implementación

1. **F1 — Detalle de factura en blanco** (bloquea ventas, clientes y “compras”).
2. **F2 — 500 al adjuntar comprobante de gasto** (S3 `SignatureDoesNotMatch`) + mismo patrón en proofs de CxC.
3. **F0 — Nunca mostrar “Error interno del servidor”** (mensaje + `request_id`; mapear errores de storage).
4. **F3 — Categorías “nuevas”** (sin 500 en logs; 409 sí; endurecer UX y confirmar con Leo la pantalla).

---

## F1 — Facturas: clic al detalle deja la pantalla en blanco

| | |
|---|---|
| **Módulos** | CRM (Ventas y facturas, Clientes, Compras/historial), también Caja POS. |
| **Reporte** | Las facturas no se visualizan; al entrar al detalle la pantalla se pone en blanco. Jean lo reprodujo: cualquier venta, y lo mismo en historial de compras del cliente. |
| **Esperado** | Abrir el modal “Detalle de venta” con número, cliente, líneas y totales. El resto de la app sigue usable. |
| **Actual** | White screen. No hay ErrorBoundary. |
| **Causa (código, alta confianza)** | `SaleDetailModal` se monta siempre (`open={!!selected}`). Al cerrar, un effect hace `setDetail(null)`. Al abrir otra venta, el **primer render** tiene `sale` válido y `detail === null`. Hay un fallback `view = detail \|\| sale` para el header, pero más abajo se usa `detail` sin guarda: `METHOD_LABELS[detail.method]` → `TypeError: Cannot read properties of null`. Eso tumba el árbol de React. |
| **Por qué pega en todos lados** | El mismo modal: `VentasPage.jsx`, `ClientesPage.jsx`, `SimplifiedCustomersPanel.jsx`, `ComprasPage.jsx`, `CotizacionesPage.jsx`, `CajaPage.jsx`. |
| **Qué hacer** | 1) Usar `view` (nunca `detail` crudo) para leer `method`/`reference`/`id`. 2) `const view = detail \|\| sale` **antes** de cualquier acceso. 3) Si `!sale` return null. 4) Añadir `ErrorBoundary` alrededor del modal y de las páginas CRM para que un fallo futuro no deje pantalla blanca. |
| **Archivos** | `frontend/src/modules/crm/components/SaleDetailModal.jsx` (~L163–196), páginas listadas arriba, `frontend/src/main.jsx` o layout para ErrorBoundary. |
| **Tests** | Test de componente: montar el modal con `sale` definido y `detail` aún null; no debe throw. Caso abrir → cerrar → abrir otra venta. |
| **Evidencia** | Código + repro de Jean (video + prueba propia). No hace falta log de API: el crash es 100% cliente. |
| **AC** | Clic en cualquier venta de Ventas, en una factura de ficha de cliente, y en historial de Compras: se ve el detalle. Cerrar y abrir otra no blanquea la app. |

```javascript
// Rotura actual (primer paint al reabrir):
if (!open || !sale) return null
const view = detail || sale          // OK
// ...
METHOD_LABELS[detail.method]         // detail es null → crash
```

---

## F2 — Registrar gasto: “Error interno del servidor”

| | |
|---|---|
| **Módulo** | Finanzas → Gastos. |
| **Reporte** | El usuario no puede registrar gastos (500). Jean en QA, **sin** el mismo adjunto, no pudo reproducir. |
| **Esperado** | El gasto se guarda. Si el comprobante falla, el gasto queda y se dice “no se pudo subir el archivo”, no 500 genérico. |
| **Actual** | `POST /api/v1/finance/expenses` **sí crea** el gasto. Acto seguido `addExpense` sube adjuntos. Ese upload explota. |
| **Causa (runtime Railway prod, confirmada)** | El 2026-10-26, 21:41–22:10 UTC, **7+** `Unhandled exception on POST /api/v1/finance/expenses/{id}/attachments`. Stack: `botocore.exceptions.ClientError` **`SignatureDoesNotMatch`** en `PutObject` (`attachment_storage.py` `upload_fileobj`). El handler genérico traduce eso a “Error interno del servidor.” |
| **Por qué Jean no lo ve** | Flujo sin archivo: no llama attachments. El create solo no 500. |
| **Mismo patrón** | 2026-10-25 `POST /pos/receivables/.../proofs` — mismo `ExceptionGroup` / TaskGroup (mismo storage). |
| **Qué hacer (app)** | En `AttachmentStorage.save`: capturar `ClientError` y convertir a error de dominio (`ServiceUnavailableError` / `InvalidOperationError`) con mensaje “No se pudo guardar el comprobante. Intenta de nuevo o sigue sin archivo.” En `finanzasStore.addExpense`: si el gasto ya existe y el upload falla, **no** revertir el éxito del gasto; toast de adjunto aparte. |
| **Qué hacer (Railway / S3)** | Revisar en el servicio `api` de **prod** (y QA): `AWS_*` / bucket / región / clock del contenedor. `SignatureDoesNotMatch` = clave, secreto, región o reloj desfasado; no es un bug de validación del gasto. El runbook `s3-copy-prod-to-qa` existe; no accept-deploy de ese patch a ciegas. |
| **Archivos** | `backend/app/services/attachment_storage.py`, `document_attachments.py`, `backend/app/api/routers/document_attachments.py`, `frontend/src/stores/finanzasStore.js` `addExpense` (~L242–260). |
| **Evidencia** | Logs prod citadas. IDs de gasto creados antes del 500: `01a17a29-37c0-…`, `01a17a29-6e68-…`, `01a17a29-8435-…`, `01a17a29-8ccc-…`, `01a17a2a-5bce-…`, `01a17a2e-e16b-…`, `01a17a31-4a21-…`. |
| **AC** | Gasto sin archivo: 201, toast OK. Gasto con archivo y S3 caído: gasto existe, mensaje de comprobante (4xx/503), **nunca** “Error interno del servidor.” Tras arreglar credenciales S3, el upload funciona. |

---

## F0 — Política: el usuario no ve 500 genéricos

| | |
|---|---|
| **Reporte de Jean** | “El usuario nunca debería tener errores de error del servidor.” |
| **Causa** | `unhandled_exception_handler` siempre manda esa frase. El FE la pinta en toast tal cual. |
| **Qué hacer** | 1) Mensaje al cliente: “No pudimos completar la acción. Si sigue, copia este código: {request_id}.” 2) Seguir logueando el stack en Railway. 3) Mapear `ClientError` de S3 (F2). 4) `ErrorBoundary` (F1). 5) En FE, si `status === 500`, no repetir el texto crudo. |
| **Archivos** | `backend/app/core/errors.py`, cliente HTTP del frontend (`apiClient`). |
| **AC** | Forzar un 500 de prueba en QA: el toast no dice “Error interno del servidor.” El log de Railway sí tiene el traceback + `request_id`. |

---

## F3 — Nuevas categorías: Leo ve 500; las existentes funcionan

| | |
|---|---|
| **Módulo** | Inventarios / Configuración → Categorías (también alta rápida en `ProductFormModal`). |
| **Reporte** | “Nuevas categorías dan error interno del servidor (dice Leo). Las que ya estaban creadas sí funcionan.” Jean no pudo reproducir. |
| **Esperado** | Crear categoría nueva (producto/servicio/insumo/gasto/ingreso) con mensaje claro. Duplicado → “Ya existe una categoría con este nombre.” Sin alcance workspace → 403, no 500. |
| **Actual en prod (logs 2026-10-01 → 2026-10-27)** | `POST /api/v1/catalog/categories`: varios **201**, un **409**, **cero 500**. No hay `Unhandled exception on POST /api/v1/catalog/...`. |
| **Causa más probable** | No es un 500 de create. Escenarios que encajan con “Leo sí / Jean no / existentes OK”: **(a)** nombre duplicado → 409 (Leo lo describe como error feo). **(b)** Leo crea categoría **y** adjunta o guarda un gasto/producto que dispara F2 (S3). **(c)** Leo no tiene `catalog.manage` workspace-wide: el API lanza `AuthorizationError` 403 (“Gestionar categorías requiere alcance sobre todo el workspace”); si el FE no lo muestra bien, se siente “roto”. Crear no; **usar** una categoría existente en un producto solo exige el item, no create. |
| **Qué hacer** | 1) Confirmar con Leo: ¿pantalla Config → Categorías, o alta rápida en producto/insumo? ¿Nombre ya existente? ¿Adjunto? 2) Asegurar que el toast de 409/403 muestra `error.message` del API (el catch de `CategoriasPage` ya lo hace). 3) Si el 409 se traga: revisar `apiClient` / `camelCase`. 4) No inventar un fix de create hasta ver un 500 real; el create en prod está sano. |
| **Archivos** | `backend/app/services/catalog.py` `create_category`, `frontend/src/modules/configuracion/pages/CategoriasPage.jsx`, `ProductFormModal.jsx` `createQuickCategory`, `frontend/src/lib/categories.js`. |
| **AC** | Duplicado → 409 visible. Sin permiso → 403 visible. Create happy path → 201 (ya ocurre en prod). Ningún toast “Error interno del servidor” en este flujo. |

---

## Hallazgos extra (no del reporte, no bloquear F1/F2)

Aparecieron en los mismos logs de prod el 2026-10-26:

| Path | Nota |
|---|---|
| `POST /crm/quotes/{id}/invoice` (22:28 y 22:31 UTC) | 500 al facturar cotización. Relacionado con BUG-E del handoff de Agenda. |
| `PATCH /crm/leads/{id}` | 500 suelto. |
| `PUT /appointment-resources/{id}/acl` | 500 recurrentes (21–26 oct). Agenda/ACL, no este lote. |

Anotarlos; no ampliar alcance salvo que Jean lo pida.

---

## Prompt para el chat de desarrollo

```
Implementa docs/qa/CRM-FINANZAS-INVENTARIOS-BUGS-HANDOFF-2026-10-26.md
en este orden: F1 (SaleDetailModal white screen), F2 (S3 SignatureDoesNotMatch
en adjuntos de gasto + proofs CxC), F0 (nunca “Error interno del servidor”),
F3 (UX 409/403 de categorías; no inventar un 500 de POST categories).
Verifica en QA con un usuario staff real de franchesko-columna.
No mergees. No escribas en prod. PR a qa solo si lo pido.
```

## Quality gates (al implementar)

| Gate | Evidencia |
|---|---|
| G0 | Este handoff |
| G2 | Tests del modal F1 + build frontend |
| G6 | AC de F1/F2/F0 |
| G8 | Tras F2: confirmar PutObject OK o 503 mapeado; no aceptar deploy S3 a ciegas |
