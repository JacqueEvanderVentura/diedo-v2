# Agenda y booking — permisos de cabina, contadores del portal y "Cualquiera disponible"

**Fecha:** 28/10/2026. **Rama:** `fix/agenda-booking-bugs-20261028` → PR hacia `qa` (sin merge).

## Resultado por bug

| Bug reportado | Cambio implementado | Verificación |
| --- | --- | --- |
| 1 · Permisos de cabina no se aplican (incluida la reserva en línea) | Un usuario con al menos una asignación en la sucursal ve **solo** las cabinas asignadas; sin asignaciones ve todas. Aplica también a administradores. Nueva fila **"Reserva en línea"** por cabina en Config → Agenda y Cabinas → Permisos de usuarios (por defecto permitida). El booking público ignora el ACL del personal y solo ofrece cabinas con reserva en línea permitida. | Tests unitarios del ACL; `test_public_booking_ignores_staff_cabin_acl`, `test_cabin_blocked_for_online_booking_is_never_offered`, `test_calendar_lists_cabinless_appointments_for_restricted_users`; tests frontend de `agendaCabinas`. |
| 2 · Contador de estatus de citas en el portal | El portal del cliente muestra cuatro contadores clicables (Pendientes, Completadas, Canceladas, No-show) que filtran la lista. Las citas pasadas ya no muestran botones de reprogramar/cancelar (`canManageOnline` desde el backend). | `portalAppointmentStats.test.js`; `test_public_portal_flags_past_appointments_as_not_manageable`. |
| 3 · "Cualquiera disponible" asigna una especialista (siempre Celimar) | La cita queda **sin especialista**, con cabina reservada, y aparece en el calendario con la etiqueta **"Sin especialista"** hasta que el personal la asigne. Las citas sin asignar consumen capacidad de especialistas por horario para no sobrevender. Reprogramar en línea conserva la cita sin asignar. | `test_public_booking_flow` (cualquiera disponible, capacidad, reprogramación). |

## Cómo probar en QA

1. **Cualquiera disponible:** reservar en el booking público eligiendo "Cualquiera disponible". En Agenda → Calendario la cita aparece con cabina y etiqueta "Sin especialista". Editarla y asignar especialista; la etiqueta desaparece.
2. **Permisos de cabina:** en Permisos de usuarios asignar a un usuario una sola cabina. Iniciar sesión con ese usuario: solo ve esa cabina en el calendario (las citas sin cabina siguen visibles). Un usuario sin asignaciones muestra "Acceso total" y ve todas.
3. **Reserva en línea por cabina:** marcar una cabina como "Bloqueada" en la fila "Reserva en línea". El booking público no ofrece horarios que dependan de esa cabina. Si todas están bloqueadas, no hay cupos.
4. **Portal:** entrar al portal de un cliente con citas en distintos estados. Los contadores coinciden con la lista; al pulsar uno se filtra y al pulsarlo de nuevo se quita el filtro. Las citas pasadas no tienen acciones de gestión.

## Migración

`20261028_0081` agrega `appointment_resources.online_booking_enabled` (boolean, default `true`). Las cabinas existentes quedan permitidas para reserva en línea.

## Pruebas ejecutadas

| Batería | Resultado |
| --- | --- |
| Backend `npm run prepush` (ruff, mypy, alembic check, suite completa) | 558 passed, 3 skipped; cobertura 87.68% (mínimo 80%) |
| Frontend vitest | 177 archivos / 696 tests passed |
| Frontend `vite build` | OK |
