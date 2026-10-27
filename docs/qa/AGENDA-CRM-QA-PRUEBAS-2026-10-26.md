# Handoff de pruebas QA — Agenda / CRM

**Para:** compañero de QA (pruebas manuales en el navegador)  
**PR:** https://github.com/JacqueEvanderVentura/diedo-v2/pull/15  
**Rama:** `fix/agenda-crm-bugs-20261026` → `qa`  
**Fecha:** 2026-10-26

Este archivo es la lista de lo que hay que **probar en QA**. No es una guía de implementación.

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

### Usuario y sucursal

- Workspace: **franchesko-columna**
- Usuario: el **staff real** que ya ve cabinas en producción (no crear un usuario QA nuevo: no verá cabinas)
- Sucursal: **MAIN / Charm DN**
- Día ancla del calendario: **22 oct 2026**

### Cuándo QA ya tiene este código

El Worker QA y la API QA **solo se actualizan cuando el PR se mergea a `qa`**. Hasta entonces la URL de QA sigue con el código viejo.

Señales de que ya desplegó:

1. En el calendario del 22 oct, si hay citas sin cabina, aparece la columna **Sin cabina**.
2. En CRM, **Agendar primera cita** ya no manda el lead a Ganados.

Si ninguna de las dos se cumple, **no sigas**: el deploy aún no llegó. Avísale a Jean.

---

## 2. Qué SÍ probar (en este orden)

Marca cada caso Pass / Fail. Si falla: captura + hora + qué hiciste.

### D — Agendar desde el pipeline no debe marcar Ganado

**Dónde:** CRM simplificado.

1. Crea un lead **nuevo** (no uses los Ganados históricos).
2. Déjalo en Interesados o Seguimiento, **sin** cliente vinculado.
3. Pulsa **Agendar primera cita**.
4. Debe pedir ficha de cliente (cédula / datos). Crea el cliente.
5. Debe abrirse el modal de cita. Completa sucursal MAIN, fecha, hora, cabina y guarda.
6. Vuelve al pipeline: el lead **sigue** en Interesados/Seguimiento. **No** está en Ganados.

Segundo caso:

1. En ese mismo lead (ya con cliente), pulsa otra vez **Agendar primera cita**.
2. Debe abrir el modal de cita **sin** pedir cédula de conversión.
3. El lead **sigue** abierto.

**Falla si:** el lead pasa a Ganados, o el modal de cita no abre, o pide “convertir” otra vez.

---

### A2 — El detalle muestra la misma cabina que el calendario

**Dónde:** Calendario → vista día → 22 oct 2026 → MAIN.

1. Abre un chip que esté en **Cabina 1, 2 o 3** (una cita que sí tiene columna).
2. El campo **Cabina** debe mostrar ese mismo nombre. No “Seleccionar…”.
3. Sin tocar cabina ni especialista, guarda.
4. Recarga el día: la cita sigue en la **misma** columna.

**Falla si:** el campo queda vacío, cambia de cabina solo, o al guardar la cita desaparece / pasa a Sin cabina.

---

### A3 — Citas sin cabina se ven

**Dónde:** mismo calendario, 22 oct 2026.

En el dump de QA de ese día había citas activas **sin cabina** a estas horas (hora local Charm DN):

| Hora | Origen | Notas |
|---|---|---|
| 08:00 | portal (`self`) | “Cita de continuación (seguimiento)” — en QA debería seguir viva |
| 15:00 | staff | huérfana |
| 15:30 | staff | huérfana |

1. Debe existir la columna **Sin cabina** y verse esas citas (o las que sigan activas sin cabina).
2. Abre una, asígnale una cabina real y guarda.
3. Debe moverse de **Sin cabina** a esa columna.
4. Arrastra otra de **Sin cabina** sobre una cabina libre. Debe quedarse ahí.
5. Arrastrar **hacia** “Sin cabina” debe **rechazarse** (mensaje de soltar sobre una cabina).

**Falla si:** no hay columna, las citas no aparecen, o asignar cabina no las mueve.

---

### C — Cancelar la cita que no se veía

**Política del portal (no cambió):** el cliente **no** puede cancelar ni reagendar una cita que ya empezó. El mensaje `Solo puedes modificar citas confirmadas que todavía no han comenzado` es correcto en `/agendar/portal`.

**Lo que sí hay que probar (staff):**

1. En el calendario, abre una cita de **Sin cabina** del 22 oct (la de 08:00 si sigue ahí, u otra ya empezada).
2. Cancélala o elimínala desde el calendario / Gestión, como staff.
3. Debe desaparecer de la grilla activa (o verse solo con “mostrar canceladas”).

**No hace falta** pelear con el portal para esa cita de las 08:00: la hora ya pasó y la política la bloquea a propósito.

**Falla si:** staff no puede cancelarla/eliminarla desde el calendario ahora que se ve.

---

### B3 / B2 — “Cualquiera disponible” deja la cita visible

**Dónde:** reserva pública, no el calendario staff.

1. Abre `https://diedo-frontend-qa.helios360erp.workers.dev/agendar?branch=01a117e6-94c7-77a1-af86-11270c2aa7c0`
2. Identifícate con un documento de prueba (o uno que ya exista en QA).
3. Elige sucursal MAIN / Charm DN.
4. En especialista elige **Cualquiera disponible**.
5. Reserva un cupo **futuro** (después de hoy; no uses el 22 oct).
6. Debe confirmarse sin error.
7. Entra al calendario staff, ese día, MAIN.
8. La cita **aparece** en una columna de cabina, con un especialista asignado. No en el limbo.

Opcional: reserva otra “Cualquiera disponible” a la **misma hora**. Debe ir a **otro** especialista/cabina, o decir que el horario ya no está disponible. Nunca una cita confirmada sin cabina.

**Falla si:** la reserva se crea y no aparece en el calendario, o queda en Sin cabina.

---

### B4 — Un solo guardado / drag, sin toast rojo falso

**Dónde:** Calendario staff, API sana.

1. Recarga el calendario del 22 oct.
2. En cuanto se pinten las cabinas, arrastra una cita a otra cabina libre **o** abre y guarda un cambio menor.
3. Debe funcionar al **primer** intento.

**Falla si:** sale `Las mutaciones están bloqueadas mientras la API no está disponible.` y hay que repetir. (Ese toast **sí** es válido si `/health/ready` de la API QA está caído.)

---

### E — Recorrer etapas + registrar pago

No hay fix de código aparte de D. Es el walk de certificación, con un lead **nuevo**.

Mapeo UI → etapa:

| Columna UI | Estado |
|---|---|
| Nuevos | `nuevo` |
| Contactados | `contactado` |
| Interesados | `propuesta` |
| Seguimiento | `negociacion` |
| Ganados | `cerrado` |

1. Crea un lead nuevo y arrástralo: Nuevos → Contactados → Interesados → Seguimiento.
2. En Interesados, **Agendar** (ticket D): el lead **no** pasa a Ganados.
3. Con caja **abierta** en MAIN y un ítem en la cotización, pulsa **Registrar pago**.
4. Debe crear factura + venta y dejar el lead en **Ganados**.

**Falla si:** no deja cambiar de etapa, Agendar lo manda a Ganados, o Registrar pago no genera factura/venta (anota si era caja cerrada o cotización sin ítem).

**No toques** los ~20 Ganados históricos sin cotización/venta.

---

## 3. Qué NO probar en este PR

| Ticket | Por qué |
|---|---|
| **B1** | Producto nuevo (permisos online por cabina + dashboard). No se implementó. |
| **A1** | Dos chips lado a lado no son dos confirmadas vivas. El gist de Postgres ya impide overlap real. No hay cambio. |

---

## 4. Cómo reportar

Copia esto al chat o al PR:

```
D:  Pass / Fail —
A2: Pass / Fail —
A3: Pass / Fail —
C:  Pass / Fail —
B3: Pass / Fail —
B4: Pass / Fail —
E:  Pass / Fail —
```

Si algo falla: captura, URL, usuario (staff vs portal), sucursal, fecha del calendario y si viste o no la columna **Sin cabina** (para saber si el deploy ya estaba).
