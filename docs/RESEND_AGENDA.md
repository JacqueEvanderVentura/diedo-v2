# Resend y agendación pública

## Estado de esta implementación

La reserva, disponibilidad, gestión mediante token, notificaciones y recordatorios automáticos están implementados en el código. La publicación desde `full-stack` ejecuta las comprobaciones y Railway aplica las migraciones hasta `20260916_0033` antes de arrancar el backend. No se habilitan empleados automáticamente.

La CLI oficial está instalada en el equipo de desarrollo (`resend-cli v2.21.0`). `resend doctor --json` sirve para confirmar la autenticación local de la CLI. La API key del backend se configura como secreto del servicio API de Railway. Para publicar sin enviar correos, mantener `EMAIL_ENABLED=false`; para enviar correos reales, usar `EMAIL_ENABLED=true`, `PUBLIC_APP_URL` con el origen de producción y `EMAIL_FROM` con el remitente verificado.

El contexto público de Sede Principal devolvió cero especialistas. Eso confirma el síntoma, pero no cuál empleado tiene una asignación o habilitación incorrecta: queda pendiente revisar sus datos autenticados en producción. La opción incorporada por la migración `20260911_0026` se creó desactivada por defecto.

## Configuración del backend

Configurar estas variables en el servicio **API de Railway**, y en `backend/.env` para pruebas locales. La clave es un secreto del backend; no debe tener prefijo `VITE_`, entrar en Git ni guardarse en el Worker del frontend.

```dotenv
EMAIL_ENABLED=false
EMAIL_FROM=Helios 360 ERP <onboarding@resend.dev>
EMAIL_REPLY_TO=jeanpaulrodriguezb@gmail.com
RESEND_REQUEST_TIMEOUT_SECONDS=10
PUBLIC_APP_URL=https://diedo-frontend-production.helios360erp.workers.dev
```

Añadir `RESEND_API_KEY` mediante el gestor de secretos del servicio. Mantener `EMAIL_ENABLED=false` hasta tener la clave y un remitente utilizable. En desarrollo local, usar `PUBLIC_APP_URL=http://localhost:3000` o el origen real del servidor Vite.

`EMAIL_ENABLED`, `EMAIL_FROM` y `EMAIL_REPLY_TO` son los nombres principales. Si uno está ausente, se acepta su equivalente `MAIL_ENABLED`, `MAIL_FROM` o `MAIL_REPLY_TO`. Un valor explícito de `EMAIL_ENABLED=false` prevalece sobre `MAIL_ENABLED=true`. El transporte sigue siendo Resend; `MAIL_PROVIDER` se conserva por compatibilidad.

Para la prueba inicial, usar `onboarding@resend.dev` y `jeanpaulrodriguezb@gmail.com` **solo si ese correo corresponde a la cuenta de Resend**. El dominio de prueba permite enviar al correo de la propia cuenta; los clientes externos requieren un dominio verificado. [Restricción oficial](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

La reserva sigue funcionando con el correo desactivado o con un error del proveedor. El usuario obtiene la confirmación de su cita y el estado del correo por separado.

## CLI y prueba real

Instalación y autenticación, desde una terminal interactiva:

```powershell
npm install --global resend-cli
resend --version
resend login
resend doctor --json
resend domains list --json
```

`resend login` solicita la clave con entrada oculta y la guarda en Windows Credential Manager. Es independiente del secreto que utiliza el backend. Para administrar dominios, la credencial debe disponer de los permisos necesarios; el backend solo necesita enviar. [CLI oficial](https://resend.com/docs/cli).

Después de configurar el secreto del backend, ejecutar desde `backend`:

```powershell
.\.venv\Scripts\python.exe -m app.scripts.send_resend_test --to jeanpaulrodriguezb@gmail.com --idempotency-key agenda-prueba-inicial-20260915
```

Este comando administrativo envía de forma explícita aunque `EMAIL_ENABLED=false`. Devuelve el identificador aceptado por el proveedor. Confirmar también la recepción en la bandeja o spam; un identificador no demuestra entrega. Reutilizar la misma clave únicamente para reintentar esa misma prueba dentro de la ventana de idempotencia.

## Dominio y Cloudflare: completar cuando esté disponible

No hace falta un dominio propio para acceder al formulario: el origen `workers.dev` ya sirve los enlaces. Sí hace falta verificar un dominio de correo para enviar a clientes externos.

Usar la cuenta de Cloudflare que **posee la zona DNS**. Según el runbook del proyecto, la zona prevista está en una cuenta colaboradora distinta a la del Worker. Su acceso está pendiente. No trasladar el dominio ni cambiar sus nameservers.

Una vez decidido y disponible el dominio o subdominio de envío:

```powershell
$bookingMailDomain = 'mail.TU-DOMINIO'
resend domains create --name $bookingMailDomain --json
resend domains get ID_DEVUELTO_POR_RESEND --json
```

Guardar la salida del segundo comando en la documentación privada de la configuración. El array `records` contiene los **nombres, tipos, valores, prioridad y TTL exactos**. Copiar esos registros en Cloudflare DNS para esa zona, sin repetir el sufijo del dominio en el campo de nombre. Los valores DKIM y los destinos regionales se obtienen de esa respuesta: no se pueden completar correctamente sin haber creado el dominio en la cuenta real.

| Registro | Fuente de los valores |
| --- | --- |
| DKIM | Registro de verificación indicado por Resend; copiar su nombre y contenido completos. |
| SPF y MX de envío/Return-Path | Registros de envío indicados por Resend, respetando nombre y prioridad. |
| Recepción | No se habilita recepción en esta etapa. No sustituir los MX existentes de los buzones del negocio. |

Aplicar las indicaciones del [procedimiento oficial para Cloudflare](https://resend.com/docs/knowledge-base/cloudflare). Después:

```powershell
resend domains verify ID_DEVUELTO_POR_RESEND
resend domains get ID_DEVUELTO_POR_RESEND --json
```

Cuando Resend indique verificado, cambiar `EMAIL_FROM` a una dirección de ese dominio, revisar `EMAIL_REPLY_TO`, probar recepción real y habilitar `EMAIL_ENABLED=true`. Los enlaces pueden seguir en `workers.dev`; cambiar `PUBLIC_APP_URL` solo cuando el frontend tenga otro origen publicado.

## Preparar especialistas y servicios

En **RR. HH. → Directorio**, editar individualmente los empleados que atenderán reservas:

1. Empleado activo.
2. Asignación activa a Sede Principal, o a la sucursal del enlace.
3. Opción **Seleccionable como especialista** habilitada expresamente.
4. Jornada y zona horaria correctas; descansos representados por bloques separados. Las vacaciones aprobadas bloquean la disponibilidad.

Se conserva la disponibilidad predeterminada de 08:00–20:00 cuando no hay horario semanal registrado. Registrar la jornada real antes de habilitar al empleado; un día sin bloques dentro de una jornada configurada no ofrece cupos.

El modal de enlace muestra un aviso y abre RR. HH. filtrado por sucursal. Al regresar, vuelve a consultar la configuración. No se activa masivamente a ningún empleado.

Los servicios deben estar activos, asignados a la sucursal y tener un perfil de inventario con precio guardado. Se consulta la lista completa. Se usa el selector de duración de las citas normales, con 30 minutos por defecto.

Debe existir al menos una cabina activa. La reserva elige una libre automáticamente; no crea cabinas ficticias. Si faltan, el administrador debe completar la configuración de recursos del establecimiento (el proyecto actualmente no dispone de un editor de cabinas en ese modal).

Diagnóstico de solo lectura, desde `backend` con conexión a la base correspondiente:

```powershell
.\.venv\Scripts\python.exe -m app.scripts.booking_email diagnose --branch 01a06a23-1bc6-706b-afc7-cf1fb1f1c504
```

Muestra cantidades de servicios/especialistas, existencia de recursos, identificadores y estado de los empleados/asignaciones, y si el correo/clave están configurados. No imprime la clave.

## Notificaciones e idempotencia

- `POST /api/v1/agenda/booking-links/email` exige sesión, `appointment.manage`, acceso a la sucursal e `Idempotency-Key`. Acepta sucursal, nombre y correo; el servidor construye la URL y el HTML.
- Las operaciones públicas y administrativas de reservar/crear, cancelar y reagendar registran su notificación en la misma transacción que la cita. El envío ocurre después del commit. La respuesta de la cita devuelve el resultado del correo por separado; un fallo de Resend no revierte la cita.
- Cada aviso de cita se identifica por evento/cita/versión. Los recordatorios usan evento/cita/revisión de programación. Cada invitación tiene su propia solicitud. El transporte usa `notification/<id>` como clave de Resend.
- Repetir una reserva completada con la misma clave y datos devuelve la misma cita. Cambiar los datos conservando la clave devuelve conflicto. El frontend conserva la clave ante una respuesta perdida y evita dobles envíos.
- Si el cliente ya existe en otra sucursal, reservar lo vincula también a la sucursal elegida, conservando sus asignaciones activas anteriores y el mismo perfil.
- La API y PostgreSQL impiden solapamientos de cabinas y de empleados, incluso entre sucursales. La confirmación vuelve a consultar disponibilidad.
- Los enlaces de gestión autorizan exclusivamente su cita mediante token. Funcionan sin sesión ni almacenamiento previo. La búsqueda por documento no entrega tokens de gestión.

Estados guardados en `email_notifications`:

| Estado | Significado y acción |
| --- | --- |
| `pending` | Guardado antes del primer intento; puede reintentarse. |
| `disabled` | Correo desactivado; no se intentó enviar. Habilitar configuración y reintentar solo los avisos pertinentes. |
| `sending` | Un proceso reclamó el envío. Otro proceso no lo repite. Si quedó así tras un cierre inesperado, reconciliar manualmente con Resend. |
| `sent` | Resend aceptó el correo y devolvió ID. No equivale a recibido. No se reenvía. |
| `failed` | Error registrado; reintentar con la misma notificación. |
| `review` | Pasaron al menos 23 horas desde el primer intento. Requiere reconciliación antes de cualquier nuevo envío. |
| `superseded` | La cita cambió de versión o dejó de existir; el aviso antiguo no se envía. |

Resend retiene claves de idempotencia durante 24 horas; el límite local de 23 horas deja margen para evitar duplicados al repetir un resultado incierto. [Idempotencia de Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).

Comandos administrativos:

```powershell
.\.venv\Scripts\python.exe -m app.scripts.booking_email list --workspace UUID_DEL_WORKSPACE
.\.venv\Scripts\python.exe -m app.scripts.booking_email retry --id UUID_DE_LA_NOTIFICACION
.\.venv\Scripts\python.exe -m app.scripts.booking_email reminders --dry-run --recipient jeanpaulrodriguezb@gmail.com
resend emails get ID_DEL_PROVEEDOR --json
```

El comando de reintento no fuerza estados `sent`, `sending`, `review` o `superseded`. Ante `sending` abandonado o `review`, revisar los registros de Resend con el operador antes de reconciliar el registro; no cambiar su ID ni reenviar a ciegas. Mantener remitente y reply-to estables durante reintentos inciertos.

## Recordatorios automáticos y cron de Railway

El servicio de recordatorios ya está implementado, pero el cron de producción queda **pendiente de activación** hasta que se decida ejecutar la prueba controlada. No activar el programador como parte de un despliegue ordinario.

Comando previsto para Railway Cron, ejecutado desde la imagen del backend:

```bash
python -m app.scripts.booking_email reminders
```

Railway debe ejecutarlo cada 5 minutos. Cada ejecución procesa los recordatorios cuyo objetivo ya venció dentro de la ventana válida, termina el proceso y cierra la sesión de base de datos. La plataforma puede demorar algunos minutos; por eso el servicio recupera recordatorios atrasados hasta una hora después del objetivo.

Activación recomendada:

1. Desplegar backend y frontend con migraciones aplicadas, manteniendo el cron desactivado.
2. Crear una cita QA confirmada para `jeanpaulrodriguezb@gmail.com` cuyo recordatorio venza pocos minutos después.
3. Ejecutar diagnóstico sin envío:

```bash
python -m app.scripts.booking_email reminders --dry-run --recipient jeanpaulrodriguezb@gmail.com
```

4. Activar temporalmente el cron con filtro de destinatario, o ejecutar una corrida manual con `--recipient jeanpaulrodriguezb@gmail.com`.
5. Confirmar recepción en Gmail, estado `sent` en `email_notifications` y ausencia de duplicado en la siguiente ejecución.
6. Quitar el filtro de destinatario para todos los clientes elegibles.

Para pausar solo los recordatorios si aparece un fallo, desactivar el cron de Railway. Los correos transaccionales de crear, cancelar, reagendar e invitación pueden seguir funcionando con `EMAIL_ENABLED=true`.

## Migración y despliegue

Antes de migrar una base existente, comprobar solapamientos entre sucursales del mismo empleado:

```sql
SELECT a.id, b.id, a.employee_id, a.branch_id, b.branch_id
FROM appointments a
JOIN appointments b ON a.workspace_id = b.workspace_id
  AND a.employee_id = b.employee_id AND a.id < b.id
  AND a.scheduled_period && b.scheduled_period
WHERE a.record_status = 'active' AND b.record_status = 'active'
  AND a.status = 'confirmed' AND b.status = 'confirmed'
  AND a.branch_id <> b.branch_id;
```

Si devuelve filas, revisarlas con el responsable de Agenda. La migración rechaza esos solapamientos y no altera las citas automáticamente. Con la base preparada, ejecutar `python -m alembic upgrade head`, desplegar el backend y luego el frontend, con las variables anteriores. No ejecutar los scripts de reinicio de pruebas sobre una base real.

## Verificación reproducible

Resultados locales: 34 pruebas focalizadas de backend, 9 de frontend y el recorrido E2E aprobados. La regresión de cliente de otra sucursal también pasó al repetir las 6 pruebas de integración del flujo. Ruff y mypy (162 archivos) sin errores; Alembic no detectó diferencias pendientes de esquema. El build de Vite terminó correctamente, con avisos preexistentes de atributos duplicados en CRM y tamaño de bundle.

Las pruebas usan PostgreSQL 18 desechable en `localhost:5434`, base `erp_booking_test`, y crean un cliente identificado como prueba con el teléfono indicado. No usan Resend real.

Desde `backend`, apuntando a esa base de pruebas:

```powershell
$env:APP_ENV='test'
$env:DATABASE_URL='postgresql+psycopg://erp:erp@127.0.0.1:5434/erp_booking_test'
.\.venv\Scripts\python.exe -m pytest tests/test_agenda.py tests/test_public_booking_flow.py tests/test_booking_availability.py tests/test_mailer.py tests/test_email_service.py -q
```

Usar una base limpia para la suite completa: algunas pruebas existentes de Agenda reutilizan fechas fijas. Las pruebas nuevas cubren precio, permisos, habilitación, descansos, vacaciones, zona horaria, pasado, cabinas, otras sucursales, concurrencia, clientes nuevos/existentes, idempotencia y errores/reintentos de correo.

Desde `frontend`:

```powershell
npm test -- tests/bookingFlow.test.jsx tests/publicBookingApi.test.js tests/publicBookingPage.test.js
npm run build
$env:FULL_STACK_API_PORT='8201'
$env:FULL_STACK_WEB_PORT='3201'
$env:FULL_STACK_DATABASE_URL='postgresql+psycopg://erp:erp@127.0.0.1:5434/erp_booking_test'
npm run test:e2e:full-stack -- booking.spec.js
```

**El comando E2E reinicia esa base desechable.** Recorre el modal de correo sin teléfono, reserva de un cliente nuevo, aparición en el Calendario y gestión en un contexto nuevo de navegador, con reagendación, cancelación y una nueva reserva del cliente ya existente. No ejecutarlo simultáneamente con pytest sobre la misma base. La recepción real y la revisión de empleados de producción quedan pendientes de las credenciales/configuración indicadas arriba.
