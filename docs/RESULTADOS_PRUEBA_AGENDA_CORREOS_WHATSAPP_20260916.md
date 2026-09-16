# Resultados de prueba: Agenda, correos y WhatsApp - 2026-09-16

## Entorno y datos usados

- Entorno: produccion.
- Frontend: `https://diedo-frontend-production.helios360erp.workers.dev`.
- API: `https://api.helios360erp.com`.
- Workspace: `Local ERP Workspace`.
- Sucursal: `Sede Principal`.
- Cliente de prueba: `PRUEBA AGENDA - Jean Paul`.
- Correo autorizado: `jeanpaulrodriguezb@gmail.com`.
- Telefono autorizado: `8294220141`.
- Usuario QA creado para la prueba: `agenda.qa.20260915-235902@helios360erp.com`.

La clave del usuario QA queda solo en el archivo privado local `C:\Users\jeanp\.codex\private\diedo-agenda-qa-20260915\acceso-agenda-qa.txt`.

## Recorrido ejecutado

Se creo un especialista QA activo, asignado a Sede Principal y seleccionable en agenda en linea. Con ese especialista se ejecuto:

- Envio de enlace de agendacion por correo.
- Reserva publica con duracion de 45 minutos.
- Reagendacion publica a 60 minutos.
- Cancelacion publica.
- Creacion administrativa desde Agenda.
- Reagendacion administrativa.
- Cancelacion administrativa.

IDs principales:

- Especialista QA: `01a0a85f-1a79-7780-855c-50502ffcf259`.
- Cliente QA: `01a0a85f-1f94-7743-8085-358399b766a7`.
- Cita publica: `01a0a85f-1fcd-7159-87e1-ca771421d43c`.
- Cita administrativa: `01a0a85f-25f0-7797-9780-4f1a6e93ef32`.

## Correos

Resultado: aprobado para envio y recepcion real en Gmail.

La API/Resend devolvio `sent` para:

| Evento | Notificacion | Provider ID |
| --- | --- | --- |
| Invitacion | `01a0a85f-1c5a-7115-9f8b-0ef4c5e0fa38` | `fed6e63b-b016-4ca6-a35c-94a9b2b11f27` |
| Confirmacion publica | `01a0a85f-1fda-74fe-bad0-1ffc09e13f71` | `4e621014-a6df-4398-b0b1-dc55ae897d9f` |
| Reagendacion publica | `01a0a85f-2197-70b4-833e-d7a4d32d605e` | `39ebe069-96b5-40e7-8597-10dc7e2884d9` |
| Cancelacion publica | `01a0a85f-2309-7407-aff3-5e67d46b9673` | `b471b784-bfa1-46ee-bae5-b3b0d773176c` |

Gmail mostro 7 correos transaccionales recientes desde `agenda@helios360erp.com`, agrupados en conversaciones por asunto:

- `Agenda tu cita - Local ERP Workspace`.
- `Tu cita ha sido confirmada - Local ERP Workspace`.
- `Tu cita fue reagendada - Local ERP Workspace`.
- `Tu cita fue cancelada - Local ERP Workspace`.

Las conversaciones de confirmacion, reagendacion y cancelacion agruparon 2 mensajes cada una: flujo publico y flujo administrativo. Los textos incluyeron cliente, servicio, fecha, hora, sucursal, workspace y enlaces al frontend publicado.

Hallazgo: las respuestas de los endpoints administrativos de Agenda no exponen el resultado de correo en el payload, aunque los correos si llegaron. El flujo publico si devuelve `notification`.

## Reserva y gestion

Resultado: aprobado en el recorrido principal.

- La reserva publica creo cita y cliente de prueba.
- La duracion seleccionada se conservo: 45 minutos en la reserva publica y 60 minutos despues de reagendar.
- La cancelacion publica libero y dejo la cita en estado `cancelled`.
- La cita administrativa aparecio en Gestion de citas con estado cancelado y datos correctos.
- La API de calendario devolvio `customerPhone=8294220141` para las dos citas QA.

## WhatsApp

Resultado: parcialmente aprobado.

Aprobado:

- El modal `Enlace agendacion` muestra canales separados: `Abrir WhatsApp` y `Enviar por correo`.
- Con nombre `PRUEBA AGENDA - Jean Paul` y telefono `8294220141`, la vista previa construyo:

```text
Hola PRUEBA AGENDA - Jean Paul, te comparto el enlace para agendar tu proxima cita en Sede Principal:

https://diedo-frontend-production.helios360erp.workers.dev/agendar?branch=01a06a23-1bc6-706b-afc7-cf1fb1f1c504

¡Te esperamos!
```

- El boton abrio WhatsApp con `phone=18294220141` y el texto codificado correctamente. No se envio el mensaje.

Fallos/hallazgos:

- En Gestion de citas, el boton `Enviar WhatsApp` de una cita QA aparece habilitado, pero en la build publicada no abrio menu ni pestaña al hacer click. Se reprodujo tambien con otra cita visible.
- La plantilla predeterminada `Enlace de agendacion` usaba `{{enlace}}`, pero las variables de cita no entregaban ese valor. Se corrigio localmente agregando el chip `ENLACE` y pasando el enlace publico de la sucursal desde Calendario y Gestion.

## Cambios implementados localmente

- `frontend/src/lib/whatsappVariables.js`: agrega el chip `ENLACE` para plantillas de Agenda.
- `frontend/src/modules/agenda/pages/GestionCitasPage.jsx`: pasa `enlace` a las plantillas WhatsApp de citas.
- `frontend/src/modules/agenda/components/calendar/AppointmentChip.jsx`: pasa `enlace` a las plantillas WhatsApp de citas.

## Verificacion tecnica

- `python -m ruff format --check app tests`: aprobado, 213 archivos formateados.
- `npm run build`: aprobado.

Warnings existentes observados durante build:

- `frontend/src/modules/crm/pages/PipelinePage.jsx` tiene atributos `disabled` duplicados.
- Vite reporta advertencias de chunking y tamano de bundle por imports estaticos/dinamicos compartidos.

## Pendientes recomendados

1. Exponer `notification` en las respuestas administrativas de crear, reagendar y cancelar cita, igual que en el flujo publico.
2. Verificar despues de desplegar el ajuste de WhatsApp que el menu de Gestion/Calendario abra correctamente y que la plantilla `Enlace de agendacion` no deje `{{enlace}}`.
3. Implementar o activar el programador real de recordatorios automaticos; esta prueba no lo aprobo como automatico.
4. Revisar el texto de cancelacion: el correo funciona, pero conviene que el boton principal diga claramente si lleva a gestionar o a volver a agendar.
