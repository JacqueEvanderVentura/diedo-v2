# Agenda API

Agenda implementa los submódulos **Calendario** y **Gestión de citas** sobre una sola fuente
transaccional en PostgreSQL. Todos los recursos y citas pertenecen a un `workspace` y una
`branch`; la autorización aplica el alcance de sucursales del usuario.

## Modelo

- `appointment_resources`: cabinas u otros recursos exclusivos de una sucursal. Cada sucursal
  recibe las cinco cabinas del flujo actual al crearse.
- `appointments`: horario local y zona horaria de la sucursal, ventana UTC, snapshots de cliente,
  servicio y precio, empleado/recurso, estado, recurrencia, versión optimista e idempotencia.
- `appointment_events`: historial append-only que alimenta la auditoría de Gestión de citas.
- `audit_entries`: además recibe el evento resumido para la auditoría global del ERP.

Los estados externos son `pending`, `confirmed`, `completed`, `attended`, `no_show`, `cancelled`,
`delayed` y `rescheduled`. Cancelar es una actualización de estado; no se elimina una cita y no se
pierde trazabilidad.

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
en una sola transacción: si una ocurrencia tiene conflicto, no se crea ninguna.

## Endpoints

Todos requieren Bearer token. Las lecturas usan `appointment.read` y las mutaciones
`appointment.manage`.

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
original; reutilizar el key con otros datos devuelve `409`. La respuesta siempre es
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
activos. La validación del navegador sirve para orientar; el POST/PATCH y las restricciones de
PostgreSQL son siempre la autoridad final.
