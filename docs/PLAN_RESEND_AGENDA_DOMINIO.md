# Plan: correos de Agenda con helios360erp.com

## Objetivo y decisiones confirmadas

Completar los correos de Agenda desde el enlace público y desde el Calendario administrativo, con una plantilla básica por empresa, envío real mediante Resend y recordatorios automáticos 24 horas antes. Destinatario de pruebas autorizado: `jeanpaulrodriguezb@gmail.com`.

Este documento es un plan de implementación. Durante su preparación solo se consultó Cloudflare y se creó un cliente en PostgreSQL local. No se cambiaron DNS, secretos ni configuración de producción y no se enviaron correos.

## Diagnóstico comprobado

- Cloudflare: zona `helios360erp.com` activa y accesible. Existen `resend._domainkey.helios360erp.com` (TXT), `send.helios360erp.com` y `rsend.helios360erp.com` (CNAME hacia infraestructura `rmta.net`), además de DMARC `p=none`. Esto no demuestra por sí solo que el dominio esté verificado en la cuenta correcta de Resend.
- La CLI `resend-cli v2.21.0` está instalada, pero `resend doctor --json` informa que no hay API key. Tampoco está configurada en `backend/.env`.
- Ya existen transporte Resend, HTML/texto, registro de notificaciones, claves para evitar duplicados, reintento administrativo y envío posterior al guardado de la cita.
- Invitación, confirmación, cancelación y reprogramación funcionan a nivel de integración en el flujo público. `AgendaService` todavía no dispara esos avisos desde el Calendario administrativo.
- El recordatorio existente usa una ventana de 23–25 horas, envío directo y un booleano; no utiliza el registro persistente común. Existe un endpoint interno, pero eso no constituye un programador automático.
- `AppointmentFormModal.jsx` inicia `reminderSent: true`; el cliente no debe poder afirmar que se envió un correo.
- La plantilla actual es texto convertido en HTML. La cancelación agrega también un botón genérico de gestión, que debe sustituirse por la acción de volver a reservar.
- La base configurada por defecto en `.env` (`localhost:5433/erp`) no estaba disponible. Se encontró la base de pruebas de Agenda activa en `127.0.0.1:5434/erp_booking_test`, con migración `20260915_0032`.

## 1. Verificar dominio, cuenta y remitente

1. Autenticar la CLI mediante `resend login`, con entrada oculta. Consultar dominios y recuperar el dominio existente; evitar crear otro sin revisar primero la configuración previa.
2. Contrastar los registros exactos que devuelva Resend con Cloudflare. Conservar la configuración correcta existente; aplicar solo diferencias necesarias. No sustituir los CNAME actuales por ejemplos genéricos SPF/MX de una guía.
3. Confirmar estado verificado y capacidad de envío. Revisar SPF, DKIM y alineación DMARC en un correo recibido. Mantener la política DMARC actual durante las pruebas.
4. Remitente propuesto: `Helios 360 ERP <agenda@helios360erp.com>`, sujeto a verificación del dominio raíz que ya aparece configurado. Las empresas usarán su nombre visible y datos propios, con una dirección de envío autorizada por la plataforma.
5. Para esta prueba, `EMAIL_REPLY_TO=jeanpaulrodriguezb@gmail.com`. Las respuestas irán allí; crear el remitente en Resend no crea un buzón para recibir respuestas. En uso real, resolver el contacto de cada empresa sin utilizar el Gmail de prueba como contacto global.
6. Clave de envío del backend con el menor alcance disponible, restringida al dominio; credencial administrativa de CLI separada cuando corresponda. Configurar secretos localmente y en el servicio API de Railway, nunca en variables del frontend ni en Git.

Configuración de activación:

```dotenv
EMAIL_FROM=Helios 360 ERP <agenda@helios360erp.com>
EMAIL_REPLY_TO=jeanpaulrodriguezb@gmail.com
EMAIL_ENABLED=false
RESEND_REQUEST_TIMEOUT_SECONDS=10
```

Añadir `RESEND_API_KEY` por el canal de secretos. Mantener el correo desactivado hasta superar la prueba controlada. `PUBLIC_APP_URL` debe apuntar al frontend del mismo entorno: local para pruebas locales y al origen publicado confirmado para producción. No enlazar citas locales con la base de producción. El dominio del remitente y el de los enlaces pueden ser distintos.

Referencia: [configuración de Resend en Cloudflare](https://resend.com/docs/knowledge-base/cloudflare) y [CLI oficial](https://resend.com/docs/cli).

## 2. Cubrir todos los eventos de Agenda

| Mensaje | Disparador | Regla |
| --- | --- | --- |
| Invitación a agendar | Calendario → Enlace de agendación → Enviar por correo | Nombre y correo válidos; WhatsApp sigue siendo independiente. |
| Confirmación | Nueva cita confirmada, pública o administrativa | Un aviso por cita; en series recurrentes, uno por ocurrencia creada. |
| Cambio de cita | Cambio de fecha, hora, duración, servicio, especialista o sucursal | Un único aviso con los datos actualizados y, para fecha/hora, antes y después. |
| Cancelación | Cancelar desde gestión pública o Calendario | Un aviso al cambiar a cancelada; repetir la operación no repite el correo. |
| Recordatorio | Cita confirmada que alcanza las 24 horas previas | Un aviso por programación de la cita, sujeto a las reglas de la sección 5. |

Guardar notas internas, registrar pagos, marcar asistencia o editar datos sin cambios relevantes para el cliente no debe generar correos. Si se reactiva una cita cancelada, enviar una nueva confirmación. Una eliminación administrativa no debe sustituir silenciosamente a la cancelación: definir su tratamiento en el servicio y la interfaz antes de conectarla a correos.

El correo del cliente es opcional para reservar. Si no existe, guardar la cita y mostrar «Cliente sin correo». El Calendario debe permitir seleccionar al cliente y completar su correo mediante el perfil existente. No inventar un destinatario ni reutilizar el correo de otro cliente. Un cambio de cliente invalida los avisos pendientes dirigidos al anterior y confirma al nuevo destinatario, sin revelar datos del anterior.

## 3. Plantilla básica por empresa

Crear una estructura compartida en `mailer.py`, con HTML compatible con Gmail móvil/escritorio y versión de texto equivalente:

- Nombre comercial de la empresa y logo si ya existe una URL pública válida; respaldo de texto si no hay logo.
- Saludo, título claro y texto específico del evento.
- Servicio, sucursal, fecha en español, hora y zona horaria del establecimiento, duración y especialista cuando exista.
- Botón según evento: «Agendar cita», «Gestionar cita» o «Agendar otra cita»; URL legible de respaldo.
- Pie con contacto y dirección configurados; omitir campos faltantes, nunca inventarlos.
- En pruebas, asunto con prefijo `[PRUEBA]`.

Resolver la empresa y sucursal en el servidor y escapar todo texto dinámico. Mantener los enlaces de gestión limitados a la cita autorizada. No incluir notas internas ni documentos de identidad. Desactivar seguimiento de aperturas/clics para estos correos con enlaces de gestión; la entrega se verifica mediante eventos del proveedor.

## 4. Unificar envío y trazabilidad

1. Extraer el registro de eventos de cita de `PublicBookingService` a un servicio compartido con `AgendaService`. Evitar que ambas capas creen el mismo aviso.
2. Registrar cita y notificación en la misma transacción; enviar después del commit. Un fallo de correo nunca revierte una reserva, cambio o cancelación.
3. Conservar clave estable por evento/cita/revisión del evento. Guardar una instantánea de destinatario, remitente, reply-to y contenido: el reintento debe repetir exactamente la solicitud original.
4. Separar la revisión relevante para notificaciones de la versión genérica del registro. Un cambio de notas o pago no debe invalidar una confirmación válida ni volver a habilitar un recordatorio enviado.
5. Mantener estados de envío actuales y agregar estado de entrega separado: aceptado, entregado al servidor receptor, demorado, rebotado, rechazado/suprimido. «Aceptado» no significa «en bandeja de entrada».
6. Mostrar el estado en el detalle de la cita y en la respuesta a la operación. Agregar historial y reintento con permiso `appointment.manage`, acceso a la sucursal y auditoría. El reintento usa la misma notificación; no crea otra automáticamente.
7. Incorporar un proceso periódico para pendientes y fallos transitorios, con límite de intentos, espera creciente y tratamiento de límites de Resend. No reintentar errores permanentes sin corregir su causa.
8. Conservar el límite conservador de 23 horas para resultados inciertos: las claves de Resend duran 24 horas. Los estados abandonados `sending` requieren reconciliación antes de reenviar; nunca liberar un bloqueo únicamente porque pasó cierto tiempo.

Referencia: [idempotencia de Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).

## 5. Recordatorios automáticos 24 horas antes

- Usar un comando del backend ejecutado como tarea periódica en Railway cada 5 minutos; confirmar compatibilidad del despliegue al implementarlo. El proceso debe terminar después de cada ejecución. No depende de que el usuario tenga el navegador abierto.
- Fecha objetivo = inicio de cita menos 24 horas, calculada con instantes UTC y presentada en la zona horaria de la sucursal.
- En funcionamiento normal, enviar en la primera ejecución posterior a esa fecha, con hasta 5 minutos de margen.
- Para recuperación tras una interrupción: permitir el envío tardío solo durante la hora posterior al objetivo. Después registrar «omitido por retraso»; no enviar recordatorios antiguos en bloque.
- Si la cita se creó o reprogramó a menos de 24 horas del inicio, enviar solo la confirmación o aviso de cambio, evitando un recordatorio inmediato redundante.
- Reprogramar recalcula la fecha objetivo. Cancelar, eliminar o completar invalida el recordatorio pendiente. Una nueva programación a más de 24 horas puede tener su propio recordatorio aunque el horario anterior ya tuviera uno.
- Reclamar trabajo con bloqueo transaccional y unicidad por cita/programación/evento para resistir procesos concurrentes.
- Migrar el envío directo existente al registro común. `reminder_sent` pasa a ser derivado del resultado persistido, no editable por frontend. No reiniciar masivamente registros históricos; la activación inicial tendrá un corte explícito para evitar avisos duplicados de citas antiguas.

## 6. Confirmar entrega con webhooks

Agregar `POST /api/v1/webhooks/resend`, público para Resend pero autenticado por firma con `RESEND_WEBHOOK_SECRET`:

- Verificar firma y antigüedad sobre el cuerpo original antes de procesar.
- Deduplicar por `svix-id`; relacionar por `provider_id`. Conservar eventos recibidos antes de que se guarde el ID del envío y reconciliarlos después.
- Procesar `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.failed`, `email.suppressed` y `email.complained`; soportar duplicados y llegada desordenada sin perder el historial.
- Mostrar fallos permanentes y evitar nuevos intentos automáticos a destinatarios bloqueados; no realizar reenvíos automáticos ante quejas o rebotes permanentes.
- En local, probar con reenvío de webhooks mediante la CLI/túnel al backend local. Usar secretos distintos de producción.

Referencias: [webhooks y garantías de entrega](https://resend.com/docs/webhooks/introduction), [verificación de firma](https://resend.com/docs/webhooks/verify-webhooks-requests) y [tipos de evento](https://resend.com/docs/webhooks/event-types).

## 7. Cliente local y pruebas reales

Cliente creado y guardado durante esta preparación:

- Nombre: **PRUEBA RESEND - Jean Paul**.
- Correo: `jeanpaulrodriguezb@gmail.com`.
- Teléfono: el autorizado en la conversación.
- Base: `127.0.0.1:5434/erp_booking_test`.
- Workspace: `local-erp`; sucursal: Sede Principal.
- Cliente: `01a0a833-b0f0-7682-b096-531ec0c56716`.
- Sucursal: `01a0a410-50ef-7113-933d-2c19c85305b2`.

El cliente tiene perfil CRM y asignación activa a la sucursal. No es una nueva cuenta administrativa ni altera el backoffice de producción. Esta base es desechable: el comando E2E que la reinicia eliminará el cliente. Preparar una semilla local idempotente y una base dedicada `erp_resend_local` antes del recorrido real, para conservar los resultados mientras se ejecutan otras pruebas.

Prueba de aceptación:

1. Configurar una lista permitida de destinatarios de prueba, limitada al Gmail indicado y aplicada también al comando de prueba y al proceso periódico. El modo local no debe enviar a otros clientes de la semilla.
2. Habilitar individualmente un especialista de prueba, su jornada, servicio y cabina. Confirmar disponibilidad real antes de iniciar el recorrido.
3. Enviar un correo técnico con `send_resend_test`; comprobar ID del proveedor y recepción en Gmail, incluyendo spam. Este comando fuerza el envío aunque `EMAIL_ENABLED=false`.
4. Enviar invitación desde el modal, reservar, recibir confirmación y gestionar desde un navegador limpio. Reprogramar y cancelar comprobando cada correo y su botón.
5. Repetir creación, modificación y cancelación desde Calendario. Verificar cliente nuevo/existente, series recurrentes, ausencia de email y cambio de destinatario.
6. Probar recordatorio con reloj controlado en pruebas automáticas; para envío real, preparar una cita local cuyo objetivo de recordatorio esté próximo. No alterar el reloj del servidor ni debilitar la regla de producción.
7. Verificar entrega mediante Resend/webhook y confirmación de recepción del usuario. Una respuesta API 200 o un ID de Resend no basta para afirmar que llegó a Gmail.

## 8. Verificación técnica y despliegue

- Backend/PostgreSQL: permisos por sucursal, aislamiento entre empresas, cada disparador, errores de Resend, timeouts, idempotencia, rollback sin correo, reserva guardada aunque falle el envío, reintentos concurrentes y reconciliación.
- Recordatorios: límites horarios, distintas zonas, fechas pasadas, interrupciones, reprogramación, cancelación, cambios de notas y ejecución simultánea.
- Webhooks: firma inválida, duplicados, eventos desordenados, evento antes del commit del resultado y rebote permanente.
- Frontend: botones independientes, estados reales, doble clic, correo ausente, mensajes de configuración y enlaces desde navegador limpio.
- Plantillas: HTML escapado, logo ausente, textos largos, Gmail móvil/escritorio y botón correcto por evento.
- Ejecutar pruebas focalizadas, integración con PostgreSQL desechable y build. Los tests automáticos no enviarán correos reales.
- Desplegar migraciones y backend con envío desactivado; desplegar frontend; verificar webhook y un envío controlado a Gmail; habilitar envío y después el proceso periódico con corte de activación definido. No reenviar automáticamente el historial `disabled`.
- Ante un problema, desactivar envíos y el proceso periódico. Las citas deben seguir operativas y conservar las notificaciones para revisión.

## Pendientes para ejecutar el plan

1. Autenticación en la cuenta correcta de Resend y provisión segura de la API key. No pegar secretos en el chat.
2. Confirmar el estado real del dominio en esa cuenta y ajustar solo los registros que su API indique.
3. Implementar los cambios de eventos administrativos, plantilla, recordatorios, estados de entrega y pruebas descritos arriba.

El dominio y la inclusión de recordatorios ya fueron confirmados por el usuario. El envío real aún no está probado.
