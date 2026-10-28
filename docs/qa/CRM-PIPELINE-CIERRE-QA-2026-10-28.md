# QA — Pipeline CRM: cerrar, cotizar y vincular cliente

**Fecha:** 2026-10-28  
**Alcance:** Pipeline estándar (`/crm/pipeline`) y CRM Simplificado (`/crm/simplificado`).  
**Migración nueva:** `20261028_0083_crm_lead_customer_link_without_close` (requiere `alembic upgrade head`).

Este documento lista lo que hay que probar en el navegador. Usa solo el frontend y la API de QA, nunca producción.

---

## 1. Reglas nuevas

| Acción | Antes | Ahora |
|---|---|---|
| Convertir a cliente / Agendar primera cita | Movía el lead a **Ganado** sin factura | Crea o vincula el cliente; **el lead se queda en su etapa** |
| Ganado | Solo al convertir (y fallaba al facturar) | Al **facturar** la cotización, o con **Cerrar como ganado sin factura** si hay cliente vinculado |
| Reabrir un Ganado | No se podía | Se puede si el lead **no tiene venta**; con venta, el backend lo bloquea |
| Elegir cliente existente | Solo los clientes de la página cargada | Búsqueda en el servidor por nombre, teléfono o cédula, filtrada por la sucursal del lead |
| Cliente detectado por nombre | Se adivinaba por coincidencia de nombre | Solo el cliente vinculado al lead o el de su cotización |

---

## 2. Casos a probar

### A. Agendar primera cita sin convertir a Ganado (bug original)

1. En CRM Simplificado abre un lead en **Propuesta** sin cliente vinculado y sin cédula.
2. Pulsa **Agendar primera cita**.
3. Debe abrirse el modal **Convertir lead a cliente** pidiendo el documento.
4. Ingresa una cédula válida y pulsa **Crear cliente**.
5. **Esperado:** se abre el formulario de cita con el cliente preseleccionado. El lead **sigue en Propuesta**, no en Ganados.
6. Repite con un lead que ya tenga cédula: la cita abre directo, sin pedir documento, y la etapa no cambia.

### B. Elegir cliente existente al cerrar

1. Abre **Registrar pago** (Simplificado) o arrastra un lead a **Ganado** (Pipeline).
2. En **Cliente para facturar**, abre **Elegir cliente existente…**.
3. Busca un cliente que **no** aparezca en la primera página de Clientes (por nombre, teléfono o cédula).
4. **Esperado:** aparece en los resultados. Al elegirlo, se vincula al lead y a su cotización.
5. Un cliente de otra sucursal no debe aparecer. Si se fuerza, la API responde «El cliente no existe en la sucursal.».

### C. Cerrar la oportunidad con factura

1. Lead con cliente vinculado y una cotización con ítems.
2. **Registrar pago**, elige el método de pago y pulsa **Generar factura**.
3. **Esperado:** se genera la factura, se descarga el PDF y el lead pasa a **Ganados**. No debe aparecer ningún error de base de datos ni «Lead no encontrado».
4. Repite con un lead **sin cliente vinculado** pero cuya cotización sí tiene cliente: al facturar, el lead queda en Ganados y vinculado a ese cliente.
5. Repite la factura sobre la misma cotización (doble clic o reintento): no se crea una segunda venta.

### D. Método de pago

1. Desactiva **Efectivo** en Configuración → Métodos de pago.
2. Abre **Registrar pago**.
3. **Esperado:** queda preseleccionado el primer método habilitado. Si un método no está sincronizado con la API, se muestra un aviso en pantalla y no se rompe el modal.

### E. Cerrar como ganado sin factura

1. Lead con cliente vinculado y sin factura.
2. En el modal de cierre pulsa **Cerrar como ganado sin factura**. Aparece un aviso de confirmación.
3. Pulsa **Confirmar cierre sin factura**.
4. **Esperado:** el lead pasa a Ganados. En Simplificado se muestra «ganada sin factura registrada» con el botón **Reabrir oportunidad**.
5. Sin cliente vinculado, el botón no aparece. Si se fuerza por API, responde «Vincula un cliente antes de marcar el lead como ganado.».

### F. Reabrir

1. Sobre el lead del caso E, pulsa **Reabrir oportunidad**, elige **Propuesta** y confirma.
2. **Esperado:** vuelve a Propuesta y conserva el cliente vinculado.
3. Sobre un lead del caso C (con venta), **no** aparece **Reabrir oportunidad**. Por API, la respuesta es «El lead ya tiene una venta registrada y no puede reabrirse.».

### G. Cotizar desde el lead

1. Lead sin cliente y sin cédula: **Cotizar** → guardar.
2. **Esperado:** se abre el modal de documento. Al crear el cliente aparece «Cliente vinculado al lead. Ya puedes guardar la cotización.»; pulsa guardar otra vez. La cotización se crea y el lead **no** cambia de etapa.
3. Lead ya Ganado con cliente A: intentar una cotización para el cliente B responde «El lead está vinculado a otro cliente.».

### H. Dos leads, mismo cliente

1. Convierte dos leads distintos que correspondan a la misma persona (mismo documento o cliente existente).
2. **Esperado:** ambos quedan vinculados al mismo cliente, sin error de duplicado.

### I. Mover por cada etapa

Mueve un lead por Nuevo → Contactado → Calificado → Propuesta → Negociación → Ganado (con factura), luego otro hasta Perdido y reábrelo. Ningún paso debe mostrar errores.

---

## 3. Cobertura automática

- Backend: `backend/tests/test_crm_pipeline_close.py`, más los ajustes en `test_crm.py` y `test_crm_lost.py`.
- Frontend: `closeLeadInvoiceModal.test.jsx`, `simplifiedAppointmentActions.test.jsx`, `crmStoreFlow.test.js`, `pipelineInvoice.test.js`, `quoteCustomer.test.js`, `opportunityCustomer.test.js`.
