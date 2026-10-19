Los **inputs** de oportunidad (el usuario tiene que elegirla o crearla a mano) están **solo en CRM**. POS, Agenda, Inventarios, Finanzas, RRHH e Incidencias **no piden oportunidad**.

La entidad en backend no se puede borrar mañana: el Kanban, Perdidos, cerrar=facturar y las tareas siguen keyed por `opportunityId`. Lo que sí se puede (y conviene) es **dejar de pedirla**: que la cotización la cree o reutilice sola.

---

## Regla que unifica todo

Al guardar una cotización con cliente/lead + ítems:

1. Si el cliente/lead ya tiene **una oportunidad abierta** en esa sucursal → se usa esa.  
2. Si hay **varias** abiertas → ahí sí un selector (caso raro: dos tratos a la vez).  
3. Si no hay ninguna → se crea: título = cliente + primer ítem, valor = total, etapa **Propuesta**.

Con eso el combo **“Sin oportunidad” desaparece** en el 95% de los casos.

---

## Inventario: cada input

### 1. `QuoteFormModal` — **el que sale en tu captura**

**Dónde se abre**

| Pantalla | Cómo llega |
|---|---|
| CRM → Cotizaciones | Nueva cotización |
| CRM → Clientes (ficha) | Cotizar |
| CRM simplificado → Clientes | Cotizar |
| Pipeline | Al cerrar sin cotización / `?opportunityId=` |
| CRM simplificado (cola) | Cotizar desde la tarjeta |

**Input:** Select **Oportunidad** con “Sin oportunidad” + todas las oportunidades del workspace (`QuoteFormModal.jsx`).

**Qué hacer:** **Eliminar el campo.** Al guardar, aplicar la regla de arriba. Si abres desde el pipeline (`initialContext.opportunityId`), queda implícito, sin mostrar combo.

Ese es el cambio de más impacto: un solo modal alimenta cinco entradas.

---

### 2. `ActivityFormModal` — Nueva / Editar tarea

**Dónde:** Seguimiento, Pipeline (tarea desde tarjeta), ficha de cliente (estándar y simplificado).

**Input:** Select **Oportunidad (opcional)** + “Sin oportunidad”.

**Qué hacer:** **Quitar el selector.** Vincular a **cliente** (ya está) o, si vienes de una tarjeta del pipeline, `defaultOpportunityId` sin UI. La tarea “de un trato” es la del cliente (o de la cotización abierta), no un dropdown de títulos tipo “Ana — Oportunidad”.

---

### 3. Pipeline → modal **Nueva oportunidad** (`PipelinePage.jsx`)

Formulario completo: lead, cliente, título, empresa, sucursal, valor, etapa, notas.

**Qué hacer:** **Eliminar este modal.** “Nueva” = abrir `QuoteFormModal`. El deal nace al cotizar. El Kanban puede seguir existiendo como **vista de esas cotizaciones/deals**, no como alta independiente.

Si alguien quiere “anotar un trato sin precio”, eso es un lead o una tarea, no un segundo objeto.

---

### 4. `CustomerQuickOpportunityModal` — **Nueva oportunidad** desde ficha

**Dónde:** Clientes (CRM estándar) y Clientes (simplificado). Título, sucursal, valor estimado.

La ficha ya tiene **Cotizar** al lado de **Oportunidad**.

**Qué hacer:** **Eliminar el botón y el modal.** Cotizar ya es el trato. El KPI “Pipeline” de la ficha puede contar **cotizaciones abiertas**, no oportunidades vacías.

---

### 5. Leads → botón **Pipeline** + select de etapa

No es un combo “qué oportunidad”, pero **crea** una oportunidad vacía (`addToPipeline`) y luego un select de etapas de oportunidad en cada lead.

**Qué hacer:** Quitar **Pipeline** como paso extra. **Cotizar** (o Convertir a cliente) crea el deal. El select de etapa puede vivir en la cotización/pipeline, no duplicado en el lead.

`LeadFormModal` **no** tiene campo de oportunidad. Bien.

---

### 6. `CloseOpportunityInvoiceModal` — vincular cotización al cerrar

Al arrastrar a Cerrado, si no hay cotización pide crear/vincular una. `onLinkQuote` escribe `quote.opportunityId`.

**Qué hacer:** No es un input de “elige oportunidad”; es al revés (elige cotización para este deal). Si cada cotización **ya nace** con deal, este paso casi no aparece. Se puede dejar como red de seguridad, no como concepto que el usuario deba entender.

---

## Lo que parece oportunidad y no es un input

| Superficie | Tipo | Acción |
|---|---|---|
| Pipeline Kanban (columnas, arrastrar, valor abierto) | Vista | Conservar como tablero de **cotizaciones/deals**, no como alta |
| CRM simplificado (cola, Perdidos, Reabrir) | Vista / estado | Internamente sigue siendo opportunity; al usuario: “trato / cotización perdida” |
| Ficha cliente: lista “Oportunidades abiertas”, KPI Pipeline | Lectura | Renombrar a cotizaciones abiertas o ocultar si se fusiona |
| WhatsApp Config → pestaña Oportunidades | Plantillas | Relabel a CRM / cotizaciones; no hay selector de deal |
| Importar CSV “Embudo” | Crea lead+oportunidad | Puede crear cotización borrador o solo lead |
| Dashboard “Oportunidades en progreso” | Tag | Cosmético |
| POS / Agenda / ventas / facturar cotización | Sin input | No tocar |

---

## Qué no conviene “eliminar” todavía (entidad, no input)

El modelo `opportunities` aguanta: etapas, `lost_reason`, `assigned_membership_id`, cierre con factura, 1 lead → 1 oportunidad, N cotizaciones por deal (revisiones).

**Eliminar inputs ≠ borrar la tabla.** Primero ocultar y auto-crear. Después, si cada deal tiene exactamente una cotización viva, la oportunidad se vuelve un detalle interno.

---

## Orden práctico (si lo implementas)

1. **Quitar el Select del `QuoteFormModal`** + auto-create/reuse al guardar.  
2. **Quitar `CustomerQuickOpportunityModal` y el botón Oportunidad** de la ficha (estándar + simplificado).  
3. **Quitar el Select del `ActivityFormModal`.**  
4. **Sustituir “Nueva oportunidad” del Pipeline** por nueva cotización.  
5. **Quitar “Enviar a pipeline”** en Leads.

Con 1–3 el usuario deja de ver “oportunidad” en los flujos diarios. 4–5 limpian el CRM “de libro”. El Kanban puede quedarse como vista, no como cosa que hay que rellenar.

Si quieres que lo baje a código, hay que salir de Ask y pasar a Agent; el primer PR natural es solo el punto 1 (`QuoteFormModal`).