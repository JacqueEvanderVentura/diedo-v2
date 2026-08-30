# Integración full-stack — Agenda

Estado: Calendario y Gestión de citas conectados al contrato transaccional de Agenda.

## Fuente de verdad y alcance

- En modo API, PostgreSQL es la fuente de verdad. `agendaStore` conserva únicamente una caché en
  memoria y nunca confirma una mutación antes de recibir la respuesta del backend.
- En modo demo explícito, `demoRepository` expone las citas relativas a la fecha actual y los
  recursos definidos en `src/data/agenda.js`; no existe fallback silencioso desde API a demo.
- Los listados respetan el scope efectivo del usuario. Las rutas `/agenda/*` requieren
  `appointment.read`; crear, editar y cancelar requiere `appointment.manage`.

## Contrato consumido

- `GET /api/v1/appointments` con `branchId`, `dateFrom`, `dateTo`, `search`, `employeeId`,
  `status`, `page` y `pageSize`.
- `POST /api/v1/appointments` crea una cita o una serie recurrente atómica y devuelve siempre
  `{ items: [...] }`. Cada intento lleva `Idempotency-Key`.
- `PATCH /api/v1/appointments/{id}` actualiza o cancela con `version`. La acción visual de eliminar
  se traduce a `status: cancelled`; no borra historia.
- `GET /api/v1/appointment-resources?branchId=...` alimenta las cabinas/recursos de cada sucursal.
- El catálogo expone `itemType` y `branches`; el formulario muestra únicamente servicios activos
  asignados a la sucursal elegida. En modo API no mezcla servicios de los fixtures locales.

El adapter traduce los estados ingleses del API a los IDs españoles ya usados por las vistas y
convierte `resourceId` al `cabinaId` del modelo visual. Los snapshots de cliente, servicio y precio
se conservan para que una cita histórica no cambie al editar un maestro.

Al cambiar de sucursal, el formulario limpia servicio, empleado y cabina anteriores. Si la nueva
sucursal no tiene cabinas/recursos activos, no permite guardar y muestra el motivo dentro del modal.

## Frescura y conflictos

El calendario consulta solamente el rango visible de la sucursal seleccionada (día, semana o las
seis filas del mes). Gestión consulta la sucursal seleccionada. Ambos refrescan cada 10 segundos,
al recuperar foco y al volver visible la pestaña. Después de crear, editar o cancelar se refresca
de inmediato el rango afectado.

La disponibilidad mostrada por React es orientativa. La garantía definitiva vive en la transacción
del backend: si otro asesor ocupó la misma cabina o empleado en un período solapado, POST/PATCH
responde `409 { message, parameter: "time" }`. El formulario permanece abierto, muestra ese mensaje
inline y recarga el día para que el usuario elija otro horario.

## Verificación

- pruebas unitarias del adapter de estados, referencias, payload versionado y detección del `409`;
- regresión de disponibilidad de módulos y preservación de `/agendar` como ruta pública;
- suite Vitest y build Vite de producción.
