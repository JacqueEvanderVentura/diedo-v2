# Handoff de pruebas QA — CRM / Finanzas / Inventarios

**Para:** compañero de QA (pruebas manuales en el navegador)  
**Rama:** `fix/agenda-crm-bugs-20261026` → `qa`  
**Fecha:** 2026-10-26  
**Workspace:** `franchesko-columna`

Este archivo es la lista de lo que hay que **probar en QA**. No es una guía de implementación.  
El brief técnico (si hace falta contexto) está en `docs/qa/CRM-FINANZAS-INVENTARIOS-BUGS-HANDOFF-2026-10-26.md`.

---

## 1. Antes de empezar

### URL correcta

| | URL |
|---|---|
| **Frontend QA** | https://diedo-frontend-qa.helios360erp.workers.dev |
| **API QA** | https://api-qa-6ed7.up.railway.app |

Usa **solo** esas dos. No uses:

- Vite / `localhost:3000`
- https://diedo-frontend-preview.helios360erp.workers.dev — apunta a **API de producción**
- https://diedo-frontend-production.helios360erp.workers.dev — producción

No escribas en producción. Los gastos o categorías de prueba, créalos solo en QA.

### Usuario y sucursal

- Workspace: **franchesko-columna**
- Usuario: el **staff real** que ya ve ventas, gastos y categorías en producción
- **No** uses el admin QA inventado de Agenda (`QA Agenda Franchesko`): su ACL no es el de un staff real
- Sucursal: **MAIN / Charm DN** (o la que ese staff ya usa)

### Cuándo QA ya tiene este código

El Worker QA y la API QA **solo se actualizan cuando este PR se mergea a `qa`**. Hasta entonces la URL de QA sigue con el código viejo.

Señales de que **frontend + API** ya desplegaron:

1. **F1 (frontend):** en CRM → Ventas, abre una factura, ciérrala y abre otra. Debe verse el detalle (número, cliente, líneas, totales). Si la app queda en blanco, este PR aún no está en el Worker.
2. **F0 (API):** si alguna acción revienta con 500, el toast **no** dice `Error interno del servidor.` Debe decir `No pudimos completar la acción.` y, si hay código, `Si sigue, copia este código: …`. En Network, la respuesta 500 lleva header `X-Request-Id`.

Si F1 sigue en blanco, **no sigas** con F2/F0: el deploy de frontend no llegó. Avísale a Jean.

---

## 2. Qué SÍ probar (en este orden)

Marca cada caso Pass / Fail. Si falla: captura + hora + URL + qué hiciste.

### F1 — El detalle de venta no deja la pantalla en blanco

**Dónde:** el mismo modal “Detalle de venta” se usa en Ventas, ficha de Cliente y Compras por Cliente.

#### F1.a — Ventas (obligatorio)

1. Entra a **CRM → Ventas**.
2. Abre cualquier venta (ej. `VTA-00000020` o la primera de la lista).
3. Debe verse: número (`VTA-…`), cliente, sucursal, método de pago, líneas y total. El resto de la app sigue usable (sidebar, filtros).
4. Cierra el modal.
5. Abre **otra** venta distinta (ej. `VTA-00000018`).
6. Debe abrirse el detalle de esa segunda venta. **No** pantalla blanca.

**Falla si:** la pantalla se pone en blanco al abrir, al cerrar, o al abrir la segunda. O el modal abre vacío sin número/cliente/total.

#### F1.b — Ficha de cliente (obligatorio)

1. **CRM → Clientes**. Busca un cliente que tenga compras (en QA: **Amin hernandez** tenía `VTA-00000018` / RD$ 14,160.00).
2. Abre la ficha.
3. En **Historial de compras**, pulsa esa venta.
4. Debe abrirse el mismo detalle (número, cliente, líneas, totales).
5. Cierra el detalle. La ficha del cliente **sigue** abierta. La lista de clientes no se blanquea.

**Falla si:** white screen, o al cerrar el detalle se pierde toda la app.

#### F1.c — Compras por Cliente (si hay filas)

1. **CRM → Compras por Cliente**.
2. Si el listado trae clientes con compras, abre uno y pulsa una venta.
3. Mismo criterio que F1.a: detalle visible, cerrar y abrir otra no blanquea.

Si el listado sale en **0 clientes** con el staff real, anótalo y no bloquees F1: el modal ya se cubrió en Ventas y en la ficha. Avísale a Jean (puede ser filtro/ACL, no este ticket).

**Falla si:** hay filas, clic en una venta, y white screen.

---

### F2 — Registrar gasto: el gasto queda aunque falle el comprobante

**Dónde:** Finanzas → Gastos.

El 500 viejo no era al crear el gasto: `POST /expenses` sí creaba. Reventaba **después**, al subir el archivo a S3 (`SignatureDoesNotMatch`).

#### F2.a — Sin archivo (obligatorio)

1. **Finanzas → Gastos → Registrar** (gasto variable, no fijo).
2. Concepto claro de prueba, ej. `QA F2 sin archivo 26-oct`.
3. Monto pequeño (ej. RD$ 1.00), sucursal MAIN / Charm DN, **sin** adjuntar archivo.
4. Guardar.
5. Toast: `Gasto registrado`. El gasto aparece en la lista.

**Falla si:** 500, o toast `Error interno del servidor.`, o el gasto no queda.

#### F2.b — Con archivo (obligatorio)

1. Otro gasto, concepto `QA F2 con archivo 26-oct`.
2. Adjunta un PDF o imagen chica (un comprobante de verdad, no un .exe).
3. Guardar.

Dos resultados válidos:

| Resultado | Qué debes ver |
|---|---|
| S3 QA sano | Toast `Gasto registrado`. El gasto existe y el archivo se puede ver/descargar. |
| S3 QA sigue roto | El **gasto existe** en la lista. Toast tipo `Gasto registrado. No se pudo guardar el comprobante. Intenta de nuevo o sigue sin archivo.` Código HTTP del adjunto 4xx/503, **nunca** 500 genérico. |

**Falla si:** no se crea el gasto, o el toast dice `Error interno del servidor.`, o la UI trata el fallo del archivo como si el gasto no existiera.

No hace falta “arreglar S3” para pasar F2. Si el upload funciona, mejor; si no, el mensaje de comprobante es el AC.

---

### F0 — El usuario no ve “Error interno del servidor”

No hay un botón “forzar 500”. Se valida con lo que ya reviente o con Network.

1. Mientras pruebas F2.b, F3 o cualquier otro flujo de este PR, abre DevTools → Network.
2. Si alguna request responde **500**:
   - El JSON `message` empieza por `No pudimos completar la acción.`
   - Trae `requestId` (o el toast muestra `Si sigue, copia este código: …`)
   - Header de respuesta `X-Request-Id` con el mismo código
   - El toast **no** contiene la frase `Error interno del servidor.`
3. Si no aparece ningún 500 en esta ronda: Pass condicional. Anota “sin 500 observado”. F2.b con S3 caído es el 500 histórico; si ahora es 503 con el texto de comprobante, F0 también queda cubierto.

**Falla si:** cualquier toast o modal muestra `Error interno del servidor.`

---

### F3 — Categorías: duplicado y permisos se entienden

**Dónde:** Configuración → Categorías (también alta rápida al crear un producto).

En prod/QA el `POST /catalog/categories` **ya** devolvía 201 (ok) y 409 (duplicado). No había 500 de create. Este ticket es UX: que el toast diga la verdad.

#### F3.a — Duplicado (obligatorio, no crea basura)

1. **Configuración → Categorías**.
2. Anota un nombre que **ya exista** (ej. `Insumos`).
3. **Nueva Categoría**, mismo nombre, mismo tipo (Producto si el original es PRODUCTO).
4. Crear.
5. Toast: `Ya existe una categoría con este nombre.`
6. No aparece una segunda fila. El modal puede quedarse abierto.

**Falla si:** 500, toast genérico, o se crea el duplicado.

#### F3.b — Alta nueva (opcional)

Solo si quieres ver el happy path. Usa un nombre único y obvio, ej. `QA F3 26-oct`, y **archívala** al terminar.

1. Crear categoría nueva de Producto.
2. Toast de éxito. Aparece en la lista.
3. Archivar.

**Falla si:** toast `Error interno del servidor.` o no se crea.

#### F3.c — Sin permiso (solo si tienes un usuario sin `catalog.manage`)

1. Entra con alguien que **no** gestione categorías de todo el workspace.
2. Intenta crear.
3. Toast: `Gestionar categorías requiere alcance sobre todo el workspace.` (o el 403 del API). No 500.

Si no tienes ese usuario, marca **N/A**.

---

## 3. Qué NO probar en este PR

| Tema | Por qué |
|---|---|
| Facturar cotización (`POST /crm/quotes/{id}/invoice` 500) | Hallazgo extra del 26-oct. No está en este lote. |
| `PATCH /crm/leads/{id}` 500 | Igual: fuera de alcance. |
| ACL de cabinas / Agenda | Ya fue el PR #15. No reAbrir esa lista aquí salvo regresión evidente. |
| Arreglar credenciales S3 en Railway | Infra. F2 exige mensaje claro, no PutObject perfecto. |
| Inventar un 500 de “crear categoría” | El create en prod estaba sano (201/409). |

---

## 4. Cómo reportar

Copia esto al chat o al PR:

```
F1.a Ventas:              Pass / Fail —
F1.b Ficha cliente:       Pass / Fail —
F1.c Compras por cliente: Pass / Fail / Sin datos —
F2.a Gasto sin archivo:   Pass / Fail —
F2.b Gasto con archivo:   Pass / Fail —  (¿gasto quedó? ¿adjunto OK o toast de comprobante?)
F0  Sin “Error interno”:  Pass / Fail / Sin 500 observado —
F3.a Duplicado 409:       Pass / Fail —
F3.b Alta nueva:          Pass / Fail / No corrí —
F3.c Sin permiso 403:     Pass / Fail / N/A —

Deploy visto (F1 no blanquea / toast F0 nuevo): Sí / No
Usuario staff (nombre): 
Sucursal:
```

Si algo falla: captura, URL, usuario, sucursal, y si F1 ya no blanqueaba (para saber si el deploy había llegado).
