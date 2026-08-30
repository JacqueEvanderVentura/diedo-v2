# Módulo de RRHH

Este documento define el contrato implementado para Overview, Directorio, Solicitudes de
vacaciones, Cuentas por cobrar a empleados y Documentos. Extiende
[GLOBAL.md](GLOBAL.md) y [MASTER_DATA_API.md](MASTER_DATA_API.md): autenticación, serialización
camelCase, aislamiento por `workspaceId`, alcance por sucursal y paginación conservan las reglas
globales.

## 1. Separación de datos

El Directorio mantiene en `employees` únicamente los datos generales, sucursales, supervisores,
horario y vínculo opcional con un usuario. La información sensible está separada en
`employee_hr_profiles`, una ficha única por empleado con salario inicial/actual, días de
vacaciones y datos bancarios.

El resto del módulo usa estas tablas:

| Tabla | Propósito |
|---|---|
| `hr_leave_requests` | Solicitudes propias, revisión y cancelación con control de versión |
| `employee_debts` | Principal de una deuda o adelanto en DOP |
| `employee_debt_payments` | Abonos inmutables asociados a una deuda |
| `hr_document_records` | Historial y snapshot de los datos usados al generar un documento |

Todos los importes usan `numeric(14,2)`. Las relaciones incluyen `workspace_id` y los listados
aplican el alcance efectivo de sucursales del usuario. La migración crea una ficha vacía para cada
empleado existente; los empleados nuevos reciben su ficha en la misma operación de creación.

## 2. Permisos

| Permiso | Alcance |
|---|---|
| `hr.overview.read` | KPIs y actividad reciente |
| `hr.profile.read` / `hr.profile.manage` | Leer o actualizar fichas sensibles |
| `hr.leave.request` | Ver saldo propio, solicitar y cancelar vacaciones propias |
| `hr.leave.review` | Listar, aprobar o rechazar solicitudes visibles |
| `hr.debt.read` / `hr.debt.manage` | Consultar o gestionar deudas y pagos |
| `hr.document.read` / `hr.document.manage` | Consultar historial o registrar documentos |

El permiso sólo es efectivo cuando el entitlement del módulo `hr` está habilitado. Los
administradores del workspace reciben los permisos nuevos durante la migración. Los roles del
seeder demo conservan asignaciones explícitas en `demo-data/v1/iam.json`.

## 3. Endpoints

| Método | Ruta | Permiso | Comportamiento |
|---|---|---|---|
| `GET` | `/api/v1/hr/overview` | `hr.overview.read` | Empleados, vacaciones, pendientes, deuda y solicitudes recientes |
| `GET` | `/api/v1/hr/profiles` | `hr.profile.read` | Fichas sensibles visibles y paginadas |
| `PATCH` | `/api/v1/hr/profiles/{employeeId}` | `hr.profile.manage` | Actualización con `version` optimista |
| `GET` | `/api/v1/hr/leave-requests/me` | `hr.leave.request` | Saldo y solicitudes del empleado vinculado al usuario |
| `GET` | `/api/v1/hr/leave-requests` | `hr.leave.review` | Solicitudes visibles para revisión |
| `POST` | `/api/v1/hr/leave-requests` | `hr.leave.request` | Crea una solicitud propia |
| `POST` | `/api/v1/hr/leave-requests/{id}/decision` | `hr.leave.review` | Aprueba o rechaza una solicitud pendiente |
| `POST` | `/api/v1/hr/leave-requests/{id}/cancel` | `hr.leave.request` | Cancela una solicitud propia pendiente |
| `GET` | `/api/v1/hr/debts` | `hr.debt.read` | Deudas filtradas y paginadas |
| `GET` | `/api/v1/hr/debts/stats` | `hr.debt.read` | Total, pagado, pendiente y empleados con deuda |
| `POST` | `/api/v1/hr/debts` | `hr.debt.manage` | Registra una deuda |
| `POST` | `/api/v1/hr/debts/{id}/payments` | `hr.debt.manage` | Registra un abono parcial o total |
| `GET` | `/api/v1/hr/documents` | `hr.document.read` | Historial filtrado y paginado |
| `POST` | `/api/v1/hr/documents` | `hr.document.manage` | Guarda el snapshot de un documento generado |

Los POST de deudas, pagos y documentos requieren `Idempotency-Key` (8–100 caracteres). Repetir
la misma operación con la misma clave devuelve el registro original; reutilizarla con otro payload
devuelve 409.

## 4. Reglas de negocio

- Un usuario debe estar vinculado a un empleado visible para consultar o solicitar vacaciones.
- Los días se cuentan de forma inclusiva. No se permiten rangos invertidos, solapamientos con una
  solicitud pendiente/aprobada ni solicitudes que excedan el saldo.
- Aprobar, rechazar y cancelar exige la versión vigente y bloquea la fila durante la transición.
- Los pagos bloquean la deuda y nunca pueden exceder el saldo. El estado se deriva como
  `pendiente`, `parcial` o `pagado`; no se persiste un estado duplicado.
- Los documentos admitidos son `certificado`, `bancaria`, `recomendacion` y `vacaciones`.
  Únicamente la carta `bancaria` puede incluir salario.
- El historial guarda un snapshot para que un documento antiguo no cambie cuando se edite la
  ficha del empleado.

## 5. Seeder y frontend

Con `DEMO_SEED_ENABLED=true`, PostgreSQL recibe empleados y fichas con IDs estables, dos
solicitudes y dos deudas (una con abono). El frontend usa la misma fuente canónica generada desde
`demo-data/v1/hr.json`; no mezcla filas demo con filas de la API ni persiste información sensible
en `localStorage`.

En sesión online, las cinco pantallas consumen estos endpoints. Las mutaciones fallidas muestran
el error de la API y no se convierten en escrituras locales. No se cambió la estructura visual de
las pantallas.
