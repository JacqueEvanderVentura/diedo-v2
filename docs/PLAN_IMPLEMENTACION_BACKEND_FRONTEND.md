# Plan de implementación Backend ↔ Frontend V2

Estado: **Fases 0, 1 y 2 reabiertas; bugs críticos estabilizados, cierre funcional pendiente**

Fecha de corte: 2026-08-29

Proyecto: Diedo / Vilma AI ERP

## 1. Decisión de recuperación

No se descartan todos los cambios actuales. La auditoría encontró piezas recuperables en backend:
migraciones lineales, separación router/service/repository, contratos Pydantic, scopes, versionado
optimista, refresh rotatorio server-side y pruebas PostgreSQL. Volver completamente a `HEAD`
reintroduciría problemas anteriores y también conservaría parte de la matriz dual de permisos.

El trabajo se recuperará por cortes verticales. Un archivo o flujo se conserva solo cuando cumple su
contrato y sus pruebas; lo demás se corrige o se revierte de forma selectiva. Ninguna fase se da por
terminada por cobertura global, build exitoso o un recorrido con APIs simuladas.

Problemas que obligaron a reabrir las fases:

- el refresh token no cruzaba el prefijo `/api-backend` del proxy porque la cookie usaba un path
  incompatible;
- el formulario fiscal aceptaba razón social y RNC, los descartaba antes del request y mostraba
  éxito;
- la pantalla de permisos mezclaba una matriz API con otra local no persistente;
- el editor de usuarios redujo un modelo de múltiples asignaciones y scopes a `un rol + N
  sucursales`, creando administradores con scope incorrecto;
- las pruebas E2E interceptaban la API y no ejercitaban cookie, PostgreSQL, proxy ni persistencia
  real;
- la fuente global de sucursales podía quedar obsoleta tras una mutación;
- el plan anterior marcó criterios como verificados aunque no existían pruebas para esos flujos.

## 2. Principios no negociables

### 2.1 Backend como fuente de verdad

- PostgreSQL conserva el estado de negocio, reglas durables, auditoría y concurrencia.
- El backend calcula permisos efectivos, scopes, impuestos, totales monetarios, disponibilidad,
  stock, transiciones y agregados. El frontend no replica esas reglas como fuente autoritativa.
- Se conserva el monolito modular FastAPI actual. El flujo base es
  `router → schema → service → repository → model/migration`.
- Los servicios controlan la transacción; los repositorios no hacen `commit`.
- Cada mutación relevante recibe `version`; dinero, stock y operaciones reintentables añaden
  `Idempotency-Key`.
- Los IDs de workspace, actor y scope vienen de la sesión, nunca de campos confiados del body.

### 2.2 Frontend preservado y escalable

- Se conserva la estructura visual y modular existente en `frontend/src/modules`. No se reescriben
  páginas completas para conectar un endpoint si basta un adapter y un hook/controlador.
- Los componentes reciben modelos de vista estables. La forma HTTP se traduce en adapters.
- En modo API, Zustand guarda estado de UI, filtros, selecciones, borradores permitidos y caché
  explícita; no confirma una mutación de negocio antes de la respuesta del backend.
- Cada módulo dispone de una única fachada de datos. La pantalla no decide entre API y demo con
  ramas repetidas ni importa seeds directamente.
- Las acciones se ocultan o deshabilitan con permisos `*.manage`; los guards de ruta `*.read` no
  sustituyen la autorización de botones.
- Se conserva la UX del compañero como referencia visual. La integración cambia el origen y ciclo
  de vida de los datos, no el diseño sin una razón funcional.

### 2.3 API y demo son dos modos explícitos

| Modo | Backend | Frontend | Escrituras |
|---|---|---|---|
| API | `DEMO_SEED_ENABLED=false` salvo carga demo explícita | `VITE_DEMO_SEED_ENABLED=false` | Solo API/PostgreSQL |
| Demo | `DEMO_SEED_ENABLED=true` en ambiente autorizado | `VITE_DEMO_SEED_ENABLED=true` | Repositorio demo aislado |

Reglas:

1. La caída de la API no convierte una sesión real en demo.
2. Las mutaciones fallidas nunca caen a Zustand/localStorage.
3. El manifest versionado es la fuente común para seed backend y snapshot frontend.
4. Ambas variantes deben mostrar los mismos campos, relaciones e IDs semánticos.
5. `false` impide cargar nuevos seeds, pero no borra datos existentes.
6. Producción usa `false`; demo requiere una decisión de despliegue explícita.
7. Deben existir comandos separados y documentados para ejecutar y probar ambos modos.

### 2.4 Decisiones de dominio cerradas

- Un membership puede tener **múltiples asignaciones de rol**.
- Cada asignación expresa `roleId`, `scopeType` (`workspace`, `legalEntity` o `branch`) y el ID del
  scope cuando corresponda. `primaryRole` es solo presentación.
- Un rol Administrador no implica scope global por su nombre; la asignación debe ser
  `scopeType=workspace`.
- Razón social y RNC pertenecen a la **entidad legal**, no al JSON de una sucursal.
- Varias sucursales pueden heredar la misma entidad legal. Una sucursal marcada como negocio
  independiente debe crear o seleccionar explícitamente otra entidad.
- Los permisos pueden permanecer configurados mientras un módulo está deshabilitado, pero no son
  efectivos. La API debe exponer ese estado sin permitir un payload incoherente.

## 3. Estrategia de pruebas obligatoria

Cada bug se corrige con una prueba de regresión que falle antes del cambio.

| Nivel | Propósito | Gate mínimo |
|---|---|---|
| Dominio/unitario backend | Reglas, transiciones y errores | Éxito y todas las ramas relevantes |
| Repositorio PostgreSQL | Constraints, scope, locks, migraciones | PostgreSQL desechable, nunca SQLite |
| HTTP FastAPI | Contrato, 400/401/403/404/409, paginación | Requests reales al ASGI app |
| Frontend unitario | Adapters, fachada, stores de UI | API y demo con el mismo modelo de vista |
| E2E UI simulado | Estados loading/empty/error/stale | Útil para errores controlados, no prueba integración |
| E2E full-stack | Navegador → Vite → FastAPI → PostgreSQL | Obligatorio para cerrar cada subfase |
| Paridad demo | Manifest → seed → snapshot → UI | Mismos campos y relaciones en true/false |
| Visual | Flujo y layout existente | Capturas de rutas afectadas en desktop/mobile |

El entorno integral debe:

- usar `APP_ENV=test` y una base `erp_test` desechable;
- aplicar migraciones desde cero antes del suite;
- limpiar o recrear el schema entre ejecuciones para impedir contaminación;
- iniciar un backend real y el proxy Vite;
- crear datos mediante seeder/API, no depender de la base de desarrollo;
- guardar trazas, request IDs y screenshots solo en fallos;
- verificar reload de página después de cada mutación crítica;
- ejecutar la misma historia con demo `true` cuando el módulo forme parte del manifest.

La cobertura se usa como diagnóstico. Los archivos tocados en autenticación, IAM y configuración
deben quedar con cobertura focal completa de sus nuevas ramas; el porcentaje global no sustituye
una historia end-to-end.

## 4. Etapa R — Recuperación de los cambios actuales

No se inicia Fase 3 hasta cerrar esta etapa.

### 4.1 Estado comprobado al corte

La implementación principal de los tres bugs reportados ya existe, pero la Etapa R continúa
abierta. “Implementado” en esta tabla significa que el flujo indicado tiene regresión automatizada;
no sustituye los criterios de salida que aún figuran como pendientes.

| Corte | Estado | Evidencia actual | Pendiente para cerrar |
|---|---|---|---|
| R.0 | En curso | Reset desde `base` hasta `head`, `alembic check`, lint, tipos y suites locales reproducibles | Repetir desde un checkout limpio, clasificar el WIP restante y confirmar que no contiene artefactos generados |
| R.1 | Núcleo implementado | Cookie limitada a auth y reescrita por Vite, logout simétrico, refresh único por pestaña y serialización entre pestañas; E2E real de login/reload y dos pestañas | Casos explícitos de expiración/atributos productivos y revisión visual del estado degradado |
| R.2 | Núcleo implementado; abierto | Matriz API única, batch multirrol atómico, grants durables, múltiples `roleAssignments[]`, scopes workspace/legalEntity/branch, aislamiento y último admin concurrente | Canal productivo de invitación, reenvío/reinvitación, UI pública de aceptación y recorrido owner → invitado → segunda sesión |
| R.3 | Núcleo implementado; abierto | Branch y perfil fiscal separados, RNC versionado, compartir/separar entidad y alta atómica; persistencia y concurrencia probadas | Paridad API/demo completa, archivado de entidad legal y un fallo fiscal relevante contra el stack real |
| R.4 | Parcial | Fachadas/adapters en configuración y maestros iniciales, limpieza única de tenant y descarte de respuestas tardías tras logout/cambio de workspace | Composition root explícito, `VITE_DATA_MODE`, snapshot demo dinámico, stores legacy, paginación, lazy loading y presupuesto de bundle |

Evidencia ejecutada el 2026-08-29 sobre `erp_test` desechable:

| Gate | Resultado |
|---|---|
| Alembic `downgrade base → upgrade head → check` | limpio; sin operaciones nuevas |
| Ruff / format / mypy | limpio; 94 archivos formateados y 76 módulos tipados |
| Pytest PostgreSQL con branches | 84/84; 91% global |
| Vitest | 39/39 |
| Playwright con respuestas controladas | 27/27 |
| Playwright full-stack real | 5/5 |
| Build Vite | correcto; quedan advertencias de chunk grande/imports cruzados que pertenecen a R.4 |

Los cinco E2E reales actuales cubren sesión, concurrencia entre pestañas, IAM y fiscal. No prueban
todavía la historia completa de invitación ni los recorridos full-stack de cliente, empleado y
adjunto; por eso no cierran Fase 1 ni Fase 2.

### R.0 — Baseline reproducible

Entregables:

- inventario de archivos modificados y clasificación `conservar / corregir / revertir`;
- respaldo recuperable del WIP antes de cualquier descarte selectivo;
- instalación reproducible desde requirements/lockfile;
- reset determinista de `erp_test`;
- comandos únicos para lint, tipos, unit, integración, E2E real y build;
- estado del plan corregido: ninguna fase figura completada sin evidencia actual.

Criterio de salida:

- una máquina limpia puede ejecutar todos los gates con comandos documentados;
- las pruebas jamás escriben en la base de desarrollo;
- `git status` no contiene artefactos generados por test/build.

### R.1 — Sesión y refresh detrás del proxy

Flujo:

1. login crea sesión server-side y cookie HttpOnly;
2. el access token vive solo en memoria;
3. reload llama refresh a través de `/api-backend`;
4. refresh rota cookie y access token;
5. `/auth/me` restaura usuario, workspace, scope y permisos;
6. replay de cookie anterior devuelve 401;
7. logout revoca la sesión y elimina la cookie con el mismo path.

Endpoints:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/sessions`
- `DELETE /api/v1/auth/sessions/{sessionId}`

Pruebas de cierre:

- navegador real a través de Vite: login → reload → continúa autenticado;
- cookie ausente, expirada, rotada, replay y sesión revocada;
- access expirado dispara un solo refresh para requests concurrentes;
- API caída muestra estado recuperable, nunca usuario demo implícito;
- atributos de cookie correctos en local y producción.

### R.2 — IAM, roles, permisos y scopes

Contratos objetivo:

- `GET /api/v1/permissions/matrix` devuelve roles, módulos, permisos, grants, entitlement y estado
  editable;
- `PUT /api/v1/roles/{roleId}/permissions` actualiza un rol de forma versionada;
- se evaluará `PUT /api/v1/roles/permissions:batch` para guardado atómico multirrol;
- `GET /api/v1/users/{membershipId}` devuelve todas las asignaciones;
- create/update/invite usan `roleAssignments[]`, no el atajo ambiguo `roleId + branchIds`;
- endpoint explícito para transferir o crear otro admin workspace-wide, protegido contra dejar el
  workspace sin administrador.

Frontend:

- online muestra una sola matriz API; demo muestra una sola matriz demo;
- `role.read` permite consultar y `role.manage` habilita celdas/guardar;
- el editor de usuario permite agregar y quitar asignaciones con scope visible;
- el frontend refresca `/auth/me` después de cambiar el rol actual y ante un 403 por permisos
  recién modificados;
- no se muestra “guardado” si solo cambió memoria local.

Pruebas de cierre:

- rol distinto por sucursal y múltiples roles para un membership;
- admin workspace-wide frente a admin branch-scoped;
- último admin, escalación horizontal/vertical y grants que el actor no posee;
- módulo enabled/disabled, permisos dormidos y reactivación;
- versión obsoleta y batch atómico sin commits parciales;
- UI read-only sin controles editables;
- guardar → reload → login del usuario afectado → permisos efectivos correctos.

### R.3 — Sucursales, entidad legal y datos fiscales

Modelo:

- `Branch` conserva operación local: nombre, dirección, contacto, horario y estado;
- `LegalEntity` conserva razón social y estado;
- `LegalEntityIdentity` conserva jurisdicción, tipo/valor fiscal, vigencia e identidad primaria;
- socios/propiedad se modelan como dato de entidad legal o se mantienen explícitamente como
  presentación temporal; no se confunden con contacto de sucursal.

Contratos objetivo:

- `GET /api/v1/legal-entities`, incluyendo identidad fiscal primaria, branches vinculadas y
  `sharing.branchCount/shared` para evitar un request por tarjeta
- `POST /api/v1/legal-entities`
- `GET /api/v1/legal-entities/{legalEntityId}`
- `PUT /api/v1/legal-entities/{legalEntityId}/fiscal-profile`, con body completo, `version` y
  respuesta `affectedBranchIds`
- `GET /api/v1/branches`
- `POST /api/v1/branches`, con unión discriminada
  `legalEntityAssignment: existing | new`
- `PATCH /api/v1/branches/{branchId}` solo para datos operativos y merge de campos presentes
- `PUT /api/v1/branches/{branchId}/legal-entity-assignment` para compartir, separar o reasignar
  una sucursal de forma atómica
- archivado versionado de branch/entity cuando las dependencias lo permitan.

El response de entidad incluye identidad fiscal primaria. La mutación usa la versión de la entidad
como control de concurrencia y actualiza la identidad fiscal en la misma transacción. RNC se
normaliza y valida según jurisdicción; la unicidad se protege en PostgreSQL.

La migración reutiliza `LegalEntityIdentity` como historial, garantiza una sola identidad primaria
vigente por entidad y la unicidad del identificador canónico dentro del workspace. Reasignar una
sucursal actualiza Branch y sus scopes branch-scoped en una sola transacción; los scopes heredados
de la entidad anterior no se copian silenciosamente.

Frontend:

- el modal conserva sus tabs y apariencia;
- el tab Fiscal muestra datos heredados de la entidad legal;
- guardar datos generales muta Branch; guardar datos fiscales muta LegalEntity;
- una nueva sucursal selecciona entidad existente o crea una independiente explícita;
- la fachada de configuración actualiza una sola caché global consumida por filtros, POS, Agenda,
  RRHH y demás módulos;
- el modal espera la respuesta y no se cierra si hay error;
- acciones se gobiernan por `branch.manage`, `legal_entity.manage` y `workspace.update`.

Pruebas de cierre:

- crear/editar branch y guardar/releer dirección, teléfono, email y horario;
- actualizar razón social/RNC → reload → mismos valores;
- dos branches comparten entidad y reflejan el mismo perfil fiscal;
- branch independiente conserva entidad/RNC diferente;
- RNC inválido/duplicado, 403, scope ajeno y versión obsoleta;
- PATCH parcial no borra campos omitidos;
- crear branch aparece de inmediato en todos los selectores globales;
- demo true/false presenta los mismos campos.

### R.4 — Frontera de datos frontend y paridad demo

Entregables:

- una fachada por módulo con interfaz común para API y demo;
- adapters puros de contrato HTTP a view model;
- selección de `ApiRepository` o `DemoRepository` una sola vez en el composition root; pages y
  repositories no importan `sessionStore` para decidir la fuente;
- stores de negocio online eliminados o reducidos a caché/UI explícita;
- claves locales versionadas y limitadas a preferencias/borradores permitidos;
- cache keys con `workspaceId + userId + módulo + operación + parámetros` y un único
  `clearTenantState()` para logout, expiración y cambio de workspace;
- snapshot generado únicamente desde `demo-data/v1`, cargado dinámicamente solo cuando el modo
  demo fue seleccionado;
- build con demo deshabilitado verificado para que el snapshot y sus datos no estén en los assets;
- `VITE_DATA_MODE=api|demo` separado de la capacidad `VITE_DEMO_SEED_ENABLED`, de forma que la
  comparación sea explícita y no dependa de provocar una caída de `/health/ready`;
- indicadores visibles `API`, `demo`, `stale` y `error` donde aporten contexto;
- carga de datos por ruta/módulo, no hidratación global de maestros innecesarios al iniciar App.
- búsqueda y paginación server-side; ningún límite oculto de 100 filas en maestros;
- lazy loading por rutas pesadas y presupuesto de bundle para evitar un único chunk de varios MB.

Gate de la Etapa R:

- refresh, permisos y datos fiscales pasan E2E full-stack;
- no hay matriz dual ni confirmaciones locales falsas en modo API;
- UI afectada conserva la apariencia y flujos del frontend original;
- Ruff, format, mypy, pytest, Vitest, E2E real y build pasan;
- revisión manual desktop/mobile aprobada.

## 5. Fase 0 — Plataforma de integración

Fase 0 deja de ser un bloque genérico y se divide en cuatro cortes.

### 0.1 Contrato y errores

- OpenAPI versionado y validado en CI.
- camelCase externo, snake_case interno y adapters explícitos.
- envelope esperado `{message, parameter}` para 400/401/403/404/409.
- request/correlation ID en response, logs y auditoría.
- paginación, filtros y sort con allowlists.

### 0.2 Tenant, scope y entitlements

- workspace/legal entity/branch derivados de sesión.
- repositorios reciben scope obligatorio.
- pruebas de aislamiento horizontal en cada aggregate.
- los entitlements filtran autorización y capacidades, no solo navegación.

### 0.3 Seeder y modos de datos

- manifest con `seedVersion`, `schemaVersion`, conteos y checksums;
- seed idempotente dos veces con mismos IDs/conteos;
- snapshot frontend generado desde el mismo manifest;
- true/false probado en backend y frontend;
- ningún secreto, token, contraseña real o PII sensible en fixtures.

### 0.4 Harness full-stack

- scripts de arranque test backend/frontend;
- migración limpia, seed, navegador y cleanup;
- casos base: online, reload, 401, 403, 409, API caída y demo explícito;
- evidencia automática vinculada a la subfase.

Criterio de salida de Fase 0:

- todos los módulos posteriores pueden reutilizar contrato, scope, facade, seeder y harness sin
  inventar otro patrón.

## 6. Fase 1 — Foundation, IAM y Configuración

### 1.1 Workspace y entidades legales

- settings, locale, moneda, timezone e impuesto default;
- CRUD/archivo de entidades legales e identidad fiscal vigente;
- selección explícita de entidad en sucursales.

### 1.2 Sucursales

- CRUD versionado, estado, contacto, horario y entidad legal;
- propagación a todos los selectores;
- constraints de última sucursal activa y dependencias.

### 1.3 Roles, permisos y asignaciones

- matriz única, múltiples assignments/scopes, último admin y auditoría;
- guards de lectura/acción en todas las pantallas conectadas.

### 1.4 Usuarios, invitaciones y sesiones

- alta directa, invitación, aceptación, suspensión/reactivación, reset y revocación de sesiones;
- perfil global separado de membership por workspace;
- cambio de workspace sin mezclar cachés.

### 1.5 Métodos de pago y configuración visible

- CRUD/activación de métodos;
- métodos de sistema no se eliminan físicamente;
- cambios visibles en POS mediante fachada común, no store duplicado.

Criterio de salida de Fase 1:

- un owner puede configurar entidad/RNC/sucursal, crear un rol con permisos, asignarlo con scope,
  crear/invitar un usuario y comprobar su acceso en una segunda sesión real.

## 7. Fase 2 — Maestros compartidos

### 2.1 Clientes

- `GET/POST /api/v1/customers`
- `GET/PATCH /api/v1/customers/{customerId}`
- archivo versionado y búsqueda por identidad/contacto/sucursal;
- un cliente creado aparece en CRM, POS y Agenda sin duplicar stores.

### 2.2 Empleados básicos

- `GET/POST /api/v1/employees`
- `GET/PATCH /api/v1/employees/{employeeId}`
- relación opcional única con platform user;
- identidad laboral, cargo, supervisor, branches y estado; salario queda fuera.

### 2.3 Horarios

- `GET/PUT /api/v1/employees/{employeeId}/schedule`
- validación de solapamientos, timezone, día libre y versión;
- adapter compartido por RRHH y Agenda.

### 2.4 Adjuntos

- endpoints anidados por owner;
- MIME/size allowlist, checksum, nombre seguro, autorización y retención;
- metadata en PostgreSQL y bytes detrás de un storage adapter;
- jamás base64 o documentos de identidad en localStorage.

### 2.5 Integración cruzada

- customer picker, employee picker, menciones, asignaciones y timeline usan UUID reales;
- caches se invalidan por aggregate y workspace;
- fixtures API/demo contienen las mismas relaciones.

Criterio de salida de Fase 2:

- crear un cliente y un empleado una sola vez, verlos en todos sus consumidores, editar/reload y
  adjuntar/descargar con autorización correcta.

## 8. Fases funcionales posteriores

Cada fase se implementa como cortes verticales pequeños; no se crean APIs de reportes antes de sus
fuentes transaccionales.

### Fase 3 — Catálogo, pricing, inventario y activos

- categorías, unidades, productos/servicios/insumos, listas de precio y vigencias;
- almacenes por branch, ledger de stock, ajustes, transferencias, recepciones y consumos;
- activos, ubicación, estado, mantenimiento y baja;
- frontend conserva Inventarios/POS, pero stock y precio efectivo vienen del backend;
- gate: venta/ajuste concurrente no produce stock negativo ni doble movimiento.

### Fase 4 — POS, ventas, caja, pagos y CxC

- apertura/cierre/arqueo de caja;
- cotización/cuenta abierta → factura inmutable;
- venta atómica con items, precio, impuesto, descuento, stock, pago/CxC y auditoría;
- pagos parciales, comprobantes, anulaciones y reversos;
- gate: un request repetido no duplica venta, pago, stock ni caja.

### Fase 5 — Agenda y autoagenda

- servicios reservables, profesionales, disponibilidad y holds temporales;
- crear/reprogramar/cancelar/confirmar/no-show/completar;
- tokens públicos, rate limit y antifraude básico;
- gate: dos reservas concurrentes no ocupan el mismo slot.

### Fase 6 — CRM y membresías comerciales

- leads, actividades, tareas, pipeline, cotizaciones y conversión a cliente;
- membresías/suscripciones, beneficios y vigencia;
- historial derivado de fuentes reales, no copias de ventas/agenda;
- gate: lead → cliente → cotización/venta mantiene trazabilidad.

### Fase 7 — Compras

- proveedores, solicitudes, aprobaciones, órdenes, recepción y cuentas por pagar;
- políticas de aprobación y segregación de funciones;
- recepción genera movimientos de stock idempotentes;
- gate: solicitud → aprobación → recepción parcial/total → saldo correcto.

### Fase 8 — Finanzas

- cuentas, ingresos/gastos, categorías, presupuestos, pasivos y conciliación simple;
- decidir antes del código si el alcance es caja gerencial o contabilidad formal;
- las cifras se proyectan desde ventas, compras, pagos y nómina;
- gate: no hay doble conteo entre caja, CxC/CxP e ingreso/gasto.

### Fase 9 — RRHH y nómina

- solicitudes, vacaciones, documentos, desempeño, deudas/adelantos y nómina;
- separación estricta de permisos para PII, salario y banco;
- cálculo reproducible, aprobación, pago y recibo inmutable;
- gate: cálculo → revisión → aprobación → pago con auditoría y reverso controlado.

### Fase 10 — Incidencias y notificaciones

- tickets, estados, SLA, comentarios, menciones y adjuntos;
- preferencias, plantillas y outbox de notificaciones;
- WhatsApp/email detrás de adapters con reintentos idempotentes;
- gate: transición genera una sola notificación auditable.

### Fase 11 — Dashboard y reportes

- endpoints de agregados autorizados por período/scope;
- exportaciones server-side para datasets grandes;
- definiciones métricas documentadas y conciliadas con fuentes;
- gate: cada KPI se reconcilia con una consulta transaccional conocida.

### Fase 12 — Migración y corte

- inventario de stores/seeds legacy por módulo;
- migración/importación validada y conciliada;
- feature flag por módulo, observación, rollback/roll-forward;
- retiro de escritura local online y de adapters temporales;
- gate: ningún aggregate real depende de localStorage o seed React.

## 9. Definition of Done por subfase

Una pantalla no está conectada porque haga `fetch`. Cada subfase requiere:

1. historia de usuario y estados/transiciones escritos;
2. contrato OpenAPI y errores antes del código de UI;
3. permisos, entitlement y scope definidos;
4. migración revisada con constraints e índices justificados;
5. service/repository con transacción explícita;
6. adapter/fachada frontend sin alterar innecesariamente el layout;
7. loading, empty, error, retry y conflicto visibles;
8. test unitario de reglas y fallos;
9. test PostgreSQL de persistencia/migración;
10. test HTTP 400/401/403/404/409 y aislamiento;
11. test frontend API/demo del mismo view model;
12. E2E full-stack de historia feliz y al menos un fallo relevante;
13. reload después de la mutación para confirmar persistencia;
14. fixture/manifest y paridad true/false cuando aplique;
15. lint, format, tipos, tests y build verdes;
16. revisión visual desktop/mobile;
17. documentación y matriz de estado actualizadas con evidencia reproducible.

Regla de aceptación: si modo API todavía confirma una mutación solamente en Zustand/localStorage,
si el E2E reemplaza la API real por un mock, o si la pantalla expone una acción que el backend
rechazará por permisos conocidos, la subfase no está terminada.

## 10. Orden de ejecución inmediato

1. Cerrar los casos residuales de R.1: expiración/atributos productivos y revisión visual.
2. Implementar entrega productiva de invitaciones, reenvío/reinvitación y aceptación pública sin
   exponer el token; probar owner → invitado → segunda sesión real.
3. Cerrar R.3 con paridad API/demo, archivado seguro de entidad legal y un conflicto/error fiscal
   contra el stack real.
4. Completar R.4: selección de repositorio en el composition root, `VITE_DATA_MODE`, snapshot dinámico,
   retiro gradual de seeds/stores de negocio online y descarte seguro de respuestas tardías.
5. Añadir paginación/búsqueda server-side, lazy loading por ruta y presupuesto de bundle.
6. Añadir E2E reales de Fase 2 para cliente, empleado, horario y adjunto con autorización y reload.
7. Ejecutar paridad demo `true/false` y revisión visual desktop/mobile de todos los flujos afectados.
8. Repetir el gate integral desde un checkout limpio; solo entonces cerrar Etapa R y revalidar Fase 0.
9. Cerrar Fase 1 con todos sus submódulos y después Fase 2 con su historia cruzada completa.

Solo después se abre Fase 3. Cada punto debe entregarse como cambio revisable y verificable, no
como otra implementación masiva de varias fases a la vez.
