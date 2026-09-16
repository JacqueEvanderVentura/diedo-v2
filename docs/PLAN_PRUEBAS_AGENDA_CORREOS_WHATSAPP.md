# Plan de pruebas: Agenda, correos y WhatsApp

## Objetivo y alcance

Comprobar el recorrido completo del cliente y del personal: compartir enlace, reservar, consultar, modificar, cancelar y recibir los mensajes correspondientes. Evaluar funcionamiento, claridad de las plantillas, persistencia, permisos y recuperación de errores. El resultado será un informe con evidencia, fallos priorizados y mejoras de contenido.

Este documento prepara la ejecución. No implica que las pruebas funcionales ya hayan pasado. No se enviaron mensajes durante la preparación del plan.

## Datos y entorno

- Correo exclusivo de pruebas reales: **jeanpaulrodriguezb@gmail.com**.
- WhatsApp exclusivo: **8294220141**, normalizado a **+1 829 422 0141**; la URL debe comenzar por `https://wa.me/18294220141`.
- Cliente identificado como `PRUEBA AGENDA - Jean Paul`, con sufijo de ejecución si se necesita diferenciar casos. Usar documentos ficticios de prueba únicamente cuando el formulario los requiera.
- Usar un usuario del establecimiento con permisos de Agenda y sucursal. La cuenta de operador de plataforma del backoffice no sustituye esa cuenta.
- Preparar un especialista, servicio con precio, jornada y cabina de prueba. Registrar sucursal y zona horaria; las citas deben estar en el futuro.
- Ejecutar primero los casos de errores, concurrencia y permisos con datos locales y proveedores simulados. Ejecutar después un recorrido controlado real contra la aplicación publicada, usando solo los destinatarios anteriores.
- Los enlaces locales deben apuntar al entorno local; los enlaces de producción, al origen publicado configurado. Registrar origen y versión desplegada antes de iniciar.
- Inventariar datos y mensajes de prueba. Al terminar, cancelar únicamente las citas creadas para esta ejecución y conservar la evidencia; esa cancelación también puede generar correo y debe contabilizarse.

## Estado conocido y puntos de atención

1. El usuario confirmó la recepción de un correo técnico enviado directamente a Resend. Falta comprobar que el transporte del backend y cada operación de Agenda envían correctamente.
2. Los recordatorios automáticos y los webhooks de entrega del plan anterior siguen pendientes de implementación completa. No aprobarlos basándose en un envío manual.
3. La plantilla predeterminada de WhatsApp «Enlace de agendación» contiene `{{enlace}}`, pero los botones de Calendario y Gestión no pasan esa variable. El reemplazo conserva los marcadores sin valor: hay que reproducirlo en la interfaz y clasificarlo como fallo funcional.
4. El modal «Enlace de agendación» construye su propio mensaje en `selfBooking.js`; no usa la misma plantilla configurable del menú. Probar qué sucede al editar la plantilla y decidir si ambas entradas deben compartirla.
5. El enlace opcional de perfil del modal usa `doc` y no incluye sucursal. Probar desde navegador limpio, incluida sucursal distinta de la principal, sin confundir identificación por documento con autorización para gestionar citas.
6. El HTML de cancelación agrega un botón genérico «Gestionar cita» aunque el texto invita a volver a reservar. Revisar su coherencia y destino.
7. Las operaciones públicas y `AgendaService` pueden registrar el mismo evento. Verificar que reutilizan una sola notificación sin conflicto ni doble correo.
8. La invalidación de correos pendientes utiliza la versión general de la cita. Probar si editar notas o pagos impide después reenviar una confirmación válida.
9. El formulario inicializa `reminderSent=false`, pero el store tiene otro valor por defecto y el backend aún acepta el campo al crear. Verificar el resultado real y evitar marcar como enviado sin evidencia.

## Secuencia y resultados esperados

### A. Preparación e invitación

| Caso | Acción | Resultado esperado |
| --- | --- | --- |
| A01 | Verificar sesión, sucursal, permisos, servicios y recursos | Se puede operar la sucursal seleccionada; servicios y precios corresponden a ella. |
| A02 | Seleccionar cliente existente en Enlace de agendación | Nombre, correo y teléfono correctos; cambiar cliente no conserva datos del anterior. |
| A03 | Compartir por correo con nombre y Gmail, sin teléfono/documento | Un solo correo de invitación con enlace a la sucursal correcta. |
| A04 | Abrir WhatsApp con nombre y número, sin correo/documento | Chat al número autorizado y mensaje completo; no se exige correo. |
| A05 | Correo inválido, teléfono vacío o solo letras | Validación comprensible; no se envía ni se abre un destino incorrecto. |
| A06 | Doble clic o reintento de la misma solicitud | No se duplican correos ni solicitudes de reserva. |
| A07 | Copiar enlace y abrirlo en incógnito | Funciona sin sesión administrativa ni datos guardados del navegador. |

### B. Reserva pública y disponibilidad

| Caso | Acción | Resultado esperado |
| --- | --- | --- |
| B01 | Reservar como cliente nuevo | Se crea una sola ficha de cliente y una sola cita, con datos completos. |
| B02 | Volver a reservar como cliente existente | Se reutiliza el cliente; no se sobreescribe otra persona por coincidencia de nombre o teléfono. |
| B03 | Seleccionar servicio, especialista, duración y horario | Solo opciones activas y disponibles; duración inicial de 30 minutos y precio guardado del servicio. |
| B04 | Cambiar rápidamente fecha, especialista y duración | Se limpia la hora anterior y se descartan respuestas antiguas. |
| B05 | Deshabilitar solo al especialista de prueba o retirar su asignación | No se ofrece; el administrador recibe indicaciones y el cliente un mensaje claro. |
| B06 | Probar descansos, vacaciones, cierre de jornada, fecha pasada y zonas horarias | No se ofrecen horarios inválidos ni se desplaza la hora por el navegador. |
| B07 | Ocupar cabinas o al especialista en otra sucursal | No se ofrece el recurso ocupado; se elige una cabina libre si existe. |
| B08 | Dos navegadores confirman simultáneamente el mismo horario | Solo una reserva válida; el otro recibe conflicto y puede elegir otra hora. |
| B09 | Perder la respuesta y reintentar | Se devuelve la misma cita; no se crea otra ni se duplica el correo. |
| B10 | Reservar sin correo | Cita guardada, sin envío y con explicación clara. |

### C. Calendario y gestión de la cita

| Caso | Acción | Resultado esperado |
| --- | --- | --- |
| C01 | Buscar la reserva pública en Calendario y Gestión | Mismo cliente, servicio, especialista, fecha, hora, precio, duración y estado; persiste al recargar. |
| C02 | Abrir el enlace recibido en un navegador limpio | Solo se accede a la cita autorizada y se puede gestionar sin sesión. |
| C03 | Reprogramar públicamente | Cita y Calendario actualizados, horario anterior liberado y un correo con los nuevos datos. |
| C04 | Cancelar públicamente y repetir la acción | Se libera el horario; no se repite el correo ni se altera otra cita. |
| C05 | Crear, reprogramar y cancelar desde Calendario | Mismos resultados y notificaciones que el flujo público. |
| C06 | Editar solo notas o pagos; después reintentar un correo pendiente | No genera cambios de cita por correo ni invalida una notificación todavía pertinente. |
| C07 | Cambiar servicio, especialista, duración, sucursal o cliente | Aviso coherente con el cambio; nunca datos de un cliente dirigidos a otro. |
| C08 | Probar recurrencia, reactivación, asistencia y eliminación | Cantidad de citas/correos conforme a la operación; distinguir eliminar de cancelar. Registrar cualquier comportamiento no definido. |
| C09 | Token ausente/alterado, ID de otra cita y usuario sin acceso a sucursal | Acceso rechazado sin exponer datos ni permitir cambios. |

### D. Correos reales y fallos de envío

Enviar inicialmente un recorrido de **7 correos esperados** al Gmail autorizado: invitación + confirmación/cambio/cancelación públicos + confirmación/cambio/cancelación administrativos. El recordatorio agrega una octava prueba cuando esté habilitado. Cualquier reejecución se registra con su motivo para distinguirla de un duplicado.

Para cada correo comprobar remitente, reply-to, nombre del cliente, empresa, sucursal, servicio, horario y duración, según corresponda; asunto comprensible, caracteres y saltos de línea correctos; HTML y texto equivalente; enlaces al entorno correcto; visualización en Gmail móvil/escritorio; recepción y carpeta donde aparece. Verificar que la cancelación invite a volver a reservar y que la reprogramación deje inequívoco el nuevo horario.

Conservar ID de notificación, evento, ID de cita, ID de Resend, hora de solicitud y hora de recepción. La aceptación del proveedor y la recepción en Gmail son comprobaciones separadas. Los enlaces con token y las credenciales se omiten de capturas y reportes compartidos.

Probar de forma simulada correo desactivado, clave inválida, remitente no verificado, límite del proveedor, timeout y error de red. La operación de Agenda debe conservarse y la interfaz mostrar el resultado del correo por separado. Un reintento de la misma notificación no debe reenviar un correo ya aceptado ni recuperar avisos obsoletos.

### E. WhatsApp y revisión de plantillas

Probar todas las entradas: modal Enlace de agendación, botón de una cita en Calendario, botón en Gestión y creación/edición de plantillas de Agenda. Registrar plantilla y punto de entrada porque hoy no comparten toda la lógica.

Para cada plantilla:

1. Comparar vista previa con el texto que abre WhatsApp; comprobar acentos, emojis, saltos de línea y enlaces.
2. Verificar destinatario `18294220141`, usando también las formas `+1 829 422 0141` y `18294220141` del mismo número.
3. Confirmar sustitución de variables; ningún `{{nombre_cliente}}`, `{{fecha}}`, `{{hora}}`, `{{servicio}}`, `{{enlace}}` u otro marcador debe quedar visible en el mensaje final.
4. Revisar datos faltantes, nombre largo y plantilla personalizada. El sistema debe avisar o usar una alternativa clara si falta un dato necesario.
5. Editar/crear una plantilla de prueba, recargar y abrir otro navegador; comprobar persistencia, permisos y aislamiento por empresa. Una plantilla de prueba no debe modificar el mensaje de otro negocio.
6. Abrir desde móvil y escritorio; comprobar que el bloqueo de ventanas emergentes o la ausencia de sesión de WhatsApp no se presenten como envío exitoso.
7. Comprobar que la plantilla describe el estado real: no confirmar una cita cancelada ni recordar una cita pasada por error.
8. Para la prueba de recepción, enviar un ejemplar por plantilla válida únicamente al número autorizado y confirmar llegada. Abrir `wa.me` solo prepara el mensaje: no prueba que se haya enviado o entregado.

La tarjeta de cita que permite copiar/descargar una imagen también se revisa: datos actuales, precio, duración, especialista, legibilidad y ausencia de notas o auditoría interna en el archivo compartido. La apertura de WhatsApp no adjunta esa imagen automáticamente.

Textos propuestos para comparar durante la revisión (son ejemplos de contenido, no variables nuevas ya implementadas):

- **Invitación:** «Hola Jean Paul, agenda tu cita en [empresa], [sucursal]: [enlace público]. Al finalizar verás la confirmación y podrás gestionar tu cita.»
- **Confirmación:** «Hola Jean Paul, tu cita de [servicio] está confirmada para el [fecha] a las [hora], en [sucursal]. Duración: [minutos]. Te esperamos.»
- **Reprogramación:** «Hola Jean Paul, tu cita de [servicio] cambió del [fecha/hora anterior] al [fecha/hora nueva], en [sucursal]. Este es tu nuevo horario.»
- **Cancelación:** «Hola Jean Paul, tu cita de [servicio] del [fecha] a las [hora] fue cancelada. Puedes elegir otra fecha aquí: [enlace público].»
- **Recordatorio:** «Hola Jean Paul, te recordamos tu cita de [servicio] del [fecha] a las [hora], en [sucursal]. Te esperamos.»

Los ejemplos de reprogramación y cancelación no están en las plantillas predeterminadas actuales; su ausencia se registrará como funcionalidad pendiente si se desea enviar esos avisos por WhatsApp. Agregar enlaces de gestión solo cuando el servidor entregue un token válido para esa cita.

### F. Recordatorios y entrega avanzada

- Verificar que existe una tarea periódica activa, que se ejecuta sin navegador y que envía alrededor de las 24 horas previas, conforme al plan de implementación.
- Probar límite horario, cita creada con menos de 24 horas, reprogramación después de un recordatorio, cancelación, dos ejecuciones concurrentes y recuperación tras interrupción.
- No marcar «recordatorio enviado» por un valor recibido del frontend ni por abrir WhatsApp.
- Verificar webhooks firmados, entregas duplicadas/desordenadas, rebotes y errores permanentes cuando se implemente el receptor.
- Mientras falte la tarea periódica o el receptor, registrar **pendiente de implementación**, no «aprobado» ni «fallo intermitente».

## Evidencia, prioridades y criterio de cierre

Por caso guardar: identificador, entorno/versión, datos de prueba, pasos, resultado esperado, resultado observado, evidencia, estado y severidad. Estados: aprobado, fallido, bloqueado por configuración o pendiente de implementación. La ausencia de correo no se considera éxito aunque la cita se guarde correctamente.

- **P0:** acceso a otra cita/empresa, exposición de datos o envío a destinatario equivocado.
- **P1:** no se puede reservar/gestionar, doble reserva/correo, enlace roto o aviso crítico que no se envía.
- **P2:** variables sin resolver, datos confusos, plantilla incorrecta, errores mal explicados o diferencias entre pantallas.
- **Mejora:** presentación, redacción o facilidad de uso sin pérdida de funcionalidad.

Entregar una matriz de resultados, inventario de mensajes recibidos, hallazgos reproducibles y mejoras propuestas ordenadas por prioridad. Declarar por separado la aprobación de reserva/gestión, correos, WhatsApp y recordatorios; no afirmar que «todo está en orden» mientras existan bloques pendientes.

Se aprueba el recorrido completo cuando todas las pruebas esenciales funcionan en móvil y escritorio, los mensajes llegan exclusivamente a los destinatarios autorizados con datos correctos, no hay duplicados ni acceso indebido y los recordatorios automáticos están comprobados. Las mejoras de estilo pueden quedar como tareas posteriores identificadas.
