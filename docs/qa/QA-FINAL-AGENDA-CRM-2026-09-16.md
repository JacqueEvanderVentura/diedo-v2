# QA final Agenda y CRM - 2026-09-16

## Version candidata

- Commit base observado antes de cambios: `b1482b9 adding html templates to the backend for a better ui experience`.
- Cambios de esta corrida: integracion backend de CRM discovery con SerpAPI/Serper, cuota por workspace, frontend usando `/crm/discovery/search`, tests simulados y esta matriz de QA.
- Entorno local previsto: `APP_ENV=test` con PostgreSQL descartable permitido por el repositorio.
- Entorno preproduccion: pendiente de aprobacion/aprovisionamiento. El Worker preview existente no se usa para escrituras porque apunta a la API de produccion.

## Matriz de salida

| Area | Resultado esperado | Estado actual | Evidencia / siguiente paso |
|---|---|---|---|
| Agenda interna | CRUD, estados, recurrencia, historial, filtros y persistencia aprobados. | Pendiente de ejecutar en matriz final. | Reutilizar `backend/tests/test_agenda.py` y ampliar/ejecutar Playwright full-stack. |
| Disponibilidad | Jornadas, descansos, vacaciones, recursos, especialistas inactivos, timezone y conflicto del mismo especialista entre sucursales. | Pendiente de ejecutar; conflicto entre sucursales queda como caso obligatorio. | Ejecutar tests de disponibilidad y agregar regresion si aparece doble reserva. |
| Reserva publica | Cliente nuevo/recurrente, precio/duracion, tokens, privacidad y navegador limpio. | Pendiente de ejecutar en matriz final. | Reutilizar `backend/tests/test_public_booking_flow.py` y `frontend/e2e/full-stack/booking.spec.js`. |
| Concurrencia | Una sola operacion valida sin duplicados de citas, ventas, cobros ni notificaciones. | Pendiente de ejecutar en matriz final. | Ejecutar pruebas concurrentes locales y staging sin reset de base. |
| CRM comercial | Lead/importacion a cobro e historial, con rechazo, vencimiento, perdida y anulaciones. | Pendiente de rerun completo; discovery backend implementado. | Ejecutar `backend/tests/test_crm.py` y E2E CRM. |
| CRM discovery SERP | Frontend usa backend; SerpAPI principal, Serper fallback, secretos del servidor, cuota 50/hora y 250/mes por workspace. | Implementado localmente; pendiente de credenciales reales en staging. | Tests simulados cubren fallback y cuota; falta prueba real controlada. |
| Clientes y pipeline | Personas/empresas, scoring, tareas, deep links, filtros y paginacion fuera de primera pagina. | Pendiente de ejecutar en matriz final. | Reutilizar auditoria CRM 2026-09-15 como regresion. |
| Importes y conexiones | Impuestos, descuentos, redondeo, abonos, inventario, POS, CxC e historial coherentes. | Pendiente de ejecutar en matriz final. | Ejecutar tests CRM/POS/CxC y conciliacion DB. |
| Agenda y finanzas | Cita desde cliente, deuda asociada, permisos financieros separados y conciliacion. | Pendiente de ejecutar en matriz final. | Ejecutar flujo manual/E2E con deuda sin abono y con abono. |
| Accesos | Permisos UI/API, aislamiento tenant/sucursal, referencias ajenas y limpieza de sesion. | Pendiente de ejecutar en matriz final. | Ejecutar IAM, CRM y Agenda con usuarios estandar. |
| Interfaz | Desktop/movil, teclado, vacios, carga, error/reintento, textos largos y caracteres especiales. | Pendiente de ejecutar en matriz final. | Ejecutar Vitest, build y Playwright multi-browser esencial. |
| Correos Agenda | Cinco plantillas HTML/texto, logo publico, enlaces y lectura sin imagenes. | Implementado previamente; pendiente de recepcion real autorizada. | Requiere destinatario autorizado y staging con Resend. |
| Recordatorios | Programador sin navegador, ventana prevista, no duplicados, cancelacion/reprogramacion y recuperacion. | Pendiente de preproduccion. | Requiere scheduler staging y reloj controlado. |
| WhatsApp | Invitacion, Calendario y Gestion con variables, numero, enlace y recepcion autorizada. | Pendiente de recepcion real autorizada. | Abrir WhatsApp no cuenta como entrega. |
| Migracion/backup/restore | Migrar desde version anterior, restaurar respaldo sintetico y recuperar sin downgrade destructivo. | Pendiente de staging/local controlado. | Requiere snapshot sintetico y runbook de restore. |
| Carga | 1.000 leads, 1.000 clientes, 1.000 citas y 10 usuarios por 15 min, API p95 <= 2s y pantallas <= 5s. | Pendiente. | Medir proveedores externos por separado. |

## Dictamen

Estado: bloqueado para aprobacion productiva hasta completar preproduccion, secretos SERP/Resend/WhatsApp, destinatarios autorizados, scheduler y ejecucion completa de la matriz.

Los cambios locales reducen un bloqueo concreto del plan: discovery CRM ya no depende de claves en el navegador ni de proxies Vite. La aprobacion final sigue requiriendo evidencia de la misma version candidata desplegada en staging y reejecucion de los recorridos obligatorios.

## Evidencia local de esta implementacion

| Control | Resultado |
|---|---|
| `python -m ruff check app tests` | Aprobado. |
| `python -m ruff format --check app tests` | Aprobado tras formatear archivos tocados. |
| `python -m mypy app` | Aprobado. |
| `python -m py_compile ...` sobre archivos tocados y migracion | Aprobado. |
| `python -m pytest tests/test_crm_discovery.py tests/test_crm.py::test_crm_scoring_detects_vertical_signals_and_respects_manual_boundaries tests/test_crm.py::test_scoring_rejects_scoped_permission_before_mutating -q` | 5 aprobadas. |
| `npm test -- --run tests/leadSearch.test.js tests/crmApi.test.js` | 4 aprobadas. |
| `npm test` | 337 aprobadas. |
| `npm run build` | Aprobado. Mantiene warnings preexistentes de atributos `disabled` duplicados en `PipelinePage.jsx` y chunks grandes. |
| `python -m pytest -q` | 172 aprobadas, 98 omitidas por no estar en base descartable, 2 fallidas por dependencia local ausente `resend`. |
| Integracion PostgreSQL con `APP_ENV=test` y `erp_test` | Bloqueada: `localhost:5434` no escucha y Docker Desktop no esta disponible para levantar `postgres_test`. |
