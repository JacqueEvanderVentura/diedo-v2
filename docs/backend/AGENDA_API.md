# Agenda API

Agenda implementa los submódulos **Calendario** y **Gestión de citas** sobre una sola fuente
transaccional en PostgreSQL. Todos los recursos y citas pertenecen a un `workspace` y una
`branch`; la autorización aplica el alcance de sucursales del usuario.

## Modelo

- `appointment_resources`: cabinas u otros recursos exclusivos de una sucursal. Cada sucursal
  recibe las cinco cabinas del flujo actual al crearse.
- `appointments`: horario local y zona horaria de la sucursal, ventana UTC, snapshots de cliente,
  servicio y precio, empleado/recurso, estado operativo, estado activo/inactivo del registro,
  recurrencia, versión optimista e idempotencia.
- `appointment_events`: historial append-only que alimenta la auditoría de Gestión de citas.
- `audit_entries`: además recibe el evento resumido para la auditoría global del ERP.

Los estados externos son `pending`, `confirmed`, `completed`, `attended`, `no_show`, `cancelled`,
`delayed` y `rescheduled`. Cancelar sigue siendo una actualización operativa. Eliminar es una
desactivación independiente: conserva el estado que tenía la cita y toda su trazabilidad.

Cuando `serviceId` está presente debe identificar un ítem `service` activo y asignado a la misma
sucursal. El catálogo expone su `itemType` y las sucursales asignadas para que el cliente pueda
filtrar antes del POST; el backend vuelve a validar la relación como autoridad final.

## Garantía contra doble agenda

La consulta previa da un error rápido y legible, pero no es la garantía final. PostgreSQL mantiene
dos `EXCLUDE USING gist` sobre rangos semiabiertos `[startsAt, endsAt)` para estados activos:

1. una misma cabina no puede tener ventanas solapadas dentro de la sucursal;
2. un mismo empleado no puede tener ventanas solapadas dentro de la sucursal, aunque se elijan
   cabinas distintas.

Por eso dos POST concurrentes no pueden confirmar el mismo recurso o profesional. Uno confirma y
el otro recibe `409`:

```json
{
  "message": "Ese horario ya no está disponible; existe otra cita para la cabina o el empleado.",
  "parameter": "time"
}
```

Citas paralelas sí son válidas cuando usan cabinas y empleados diferentes. `cancelled`,
`completed`, `attended` y `no_show` dejan de bloquear la ventana. Una serie recurrente se confirma
en una sola transacción: si una ocurrencia tiene conflicto, no se crea ninguna. Una cita
desactivada tampoco bloquea el horario, aunque su último estado operativo fuera activo.

## Endpoints

Todos requieren Bearer token. Las lecturas usan `appointment.read`; crear, editar y cambiar estado
usan `appointment.manage`; eliminar requiere el permiso separado `appointment.delete`, asignado al
rol administrador del workspace por defecto.

### Recursos

`GET /api/v1/appointment-resources?branchId={uuid}`

Devuelve `{ "items": [...] }`. La respuesta lleva `Cache-Control: no-store`.

### Calendario y gestión

`GET /api/v1/appointments`

Filtros: `branchId`, `dateFrom`, `dateTo` (máximo 366 días), `search`, `employeeId`, `status`,
`page`, `pageSize` (máximo 200), `sortBy` y `sortDirection`. Devuelve el envelope paginado global.
El calendario debe consultar sólo su rango visible; Gestión puede combinar filtros y paginación.
La respuesta lleva `Cache-Control: no-store`.

### Crear una cita o serie

`POST /api/v1/appointments`

Requiere `Idempotency-Key` de 8 a 128 caracteres. El mismo key y payload devuelve la creación
original; reutilizar el key con otros datos o con una cita ya eliminada devuelve `409`. La respuesta siempre es
`{ "items": [...] }`, incluso para una cita única.

```json
{
  "branchId": "00000000-0000-0000-0000-000000000000",
  "resourceId": "00000000-0000-0000-0000-000000000000",
  "customerId": null,
  "employeeId": null,
  "serviceId": null,
  "date": "2026-09-01",
  "time": "14:00",
  "duration": 60,
  "customerName": "Cliente",
  "customerPhone": null,
  "serviceName": "Sesión de terapia",
  "price": "1500.00",
  "status": "confirmed",
  "notes": null,
  "pendingPayment": false,
  "pendingAmount": "0.00",
  "firstTime": false,
  "freeTrial": false,
  "reminderSent": false,
  "source": "staff",
  "recurrence": "none",
  "repeatCount": 1
}
```

Gestión de citas puede enviar únicamente `status` y `version` para cambiar el estado desde el
selector de la tabla; el formulario completo conserva el mismo endpoint.

### Eliminar una cita

`DELETE /api/v1/appointments/{appointmentId}?version={version}`

Devuelve `204 No Content`. La operación requiere `appointment.delete`, bloquea el registro y valida
su versión dentro de la transacción. La cita pasa a estado interno `inactive`, deja de aparecer en
Calendario, Gestión, Dashboard y métricas operativas, conserva su historial y libera la cabina y el
empleado para una nueva reserva. No cambia su estado operativo a `cancelled`.

Si la cita tiene una cuenta por cobrar pendiente, también se exige `pos.receivables.manage`; una
cuenta sin abonos se cancela junto con la desactivación. Si ya tiene cobros parciales, la operación
devuelve `409` para no perder consistencia financiera.

Para una serie, `recurrence` puede ser `weekly` o `monthly` y `repeatCount` debe estar entre 2 y
12. Las fechas y horas se interpretan en la zona horaria actual de la sucursal; esa zona queda como
snapshot de la cita.

### Actualizar, reprogramar o cancelar

`PATCH /api/v1/appointments/{appointmentId}`

El body incluye `version` y sólo los cambios. Una versión desactualizada devuelve `409` con
`parameter: "version"`. Reprogramar vuelve a ejecutar las validaciones de cabina, empleado,
vacaciones, jornada y solapamiento. Para cancelar:

```json
{
  "version": 3,
  "status": "cancelled"
}
```

## Frescura del frontend

El frontend hidrata desde la API al entrar, consulta el rango visible del calendario, vuelve a
leer inmediatamente después de cada mutación y hace polling mientras Calendario o Gestión están
activos. La validación del navegador sirve para orientar; el POST/PATCH/DELETE y las restricciones de
PostgreSQL son siempre la autoridad final.
