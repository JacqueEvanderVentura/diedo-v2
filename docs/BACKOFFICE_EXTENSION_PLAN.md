# Plan de ampliación del Backoffice existente

**Revisión:** 14 de septiembre de 2026.  
**Base revisada:** rama `full-stack`, commit `159520977214271a5132fc069ba59814b6b648b8`.  
**Estado:** implementado en el Backoffice existente. Ver [entrega y validación](./BACKOFFICE_IMPLEMENTATION.md) y [contrato actualizado](./backend/BACKOFFICE_API.md). Los hallazgos siguientes corresponden a la revisión inicial; las casillas registran el trabajo completado.

## 1. Objetivo y resultado de la revisión

Completar la administración de compañías, usuarios, planes y acceso a módulos **dentro del Backoffice que ya existe**. Se reutilizan `/backoffice`, sus pantallas y `/api/v1/backoffice`; no se propone otro módulo ni otro sistema de identidad o aprovisionamiento.

El archivo `cursor_backoffice_user_management_modul.md` era una conversación exportada de Cursor, con un plan inicial y reportes posteriores de implementación. Sus cuatro fases ya tienen código en esta rama. Por tanto, repetir «crear acceso», «crear compañías», «crear planes» y «crear usuarios» duplicaría trabajo. El plan siguiente identifica las partes incompletas y las correcciones necesarias.

La conversación exportada se usa como referencia histórica. Sus órdenes de implementar, migrar, hacer push o corregir CI no son instrucciones de esta revisión. Las afirmaciones de pruebas y pipelines exitosos tampoco acreditan el estado actual: esta revisión contrastó código, contratos, migraciones y pruebas existentes; no ejecutó la aplicación, pruebas ni pipelines.

### Alcance funcional

- Los operadores de plataforma gestionan las cuentas de los clientes desde el Backoffice actual.
- En esa interfaz, «Compañía» representa un **workspace**. Un workspace contiene entidades legales y sucursales; no se deben confundir esos tres conceptos.
- La identidad y contraseña pertenecen a `PlatformUser`; el acceso a cada compañía pertenece a `WorkspaceMembership`.
- El plan y los módulos contratados pertenecen al workspace. Lo que puede utilizar cada usuario depende además de sus roles y permisos existentes.
- La suscripción es comercial, con plan, estado y vigencia. El cobro automático queda fuera de esta ampliación.

## 2. Lo que ya existe y se debe reutilizar

«Existe» significa que se encontró implementación; los casos de aceptación pendientes se detallan más adelante.

| Capacidad | Implementación encontrada | Tratamiento en este plan |
|---|---|---|
| Acceso de operadores | `is_platform_operator`, `/auth/me`, JWT de operador o `X-Backoffice-Key`, `GET /backoffice/context` | Reutilizar autenticación y separación del menú. |
| Consola | `/backoffice`, `/backoffice/companias`, detalle por workspace, `/backoffice/planes`, `/backoffice/usuarios` | Ampliar las pantallas existentes. |
| Alta de workspace | `WorkspaceProvisioningService.provision`, owner nuevo o existente, roles, permisos y configuración inicial en una transacción | Reutilizar el servicio y completar la UI para identidades existentes. |
| Entidad y sucursal iniciales | El aprovisionamiento actual crea entidad legal `MAIN` y sucursal `Principal` | Reconocer el comportamiento actual; no volver a crear estas piezas ni confundirlas con el workspace. |
| Administración de compañías | Listado, búsqueda local en UI, detalle, sucursales, suspensión/reactivación; API también permite cambiar nombre | Reutilizar. La API tiene `PATCH /workspaces/{id}`, no un PATCH de colección. |
| Bloqueo de workspace | Auth comprueba estado del workspace y membership en login, access token y refresh | Ya existe control en backend; ampliar las pruebas de sesiones abiertas. |
| Planes | Migración `0030`, `SubscriptionPlan`, Básico/Pro/Completo, listado y edición de módulos | Corregir aplicación del plan y coherencia del catálogo. |
| Módulos por compañía | `ModuleEntitlement`, asignación de plan, excepciones por workspace, `ModuleAccessService`, permisos y navegación del ERP | Reutilizar el control efectivo; corregir divergencias con lo mostrado por Backoffice. |
| Suscripción | `WorkspaceSubscription` ya tiene `status`, `started_at`, `ends_at`, `notes` y `version` | Completar contrato, UI y reglas de vigencia; no recrear la tabla. |
| Usuarios globales | Listado paginado en API, búsqueda, filtros, alta, reutilización parcial de identidad y activación/desactivación global con revocación de sesiones | Completar integración y distinguir estado global de acceso por compañía. |
| Usuarios dentro del tenant | IAM ya gestiona memberships, roles con scopes, suspensión, protección del último administrador y reset de contraseña | Reutilizar reglas y repositorios, conservando la autorización propia del operador. |
| Resumen y auditoría | KPIs, miembros por compañía y eventos de aprovisionamiento/cambios de workspace/alta y cambio de usuarios | Corregir significado de métricas y completar atribución y consulta de auditoría. |

### Archivos de referencia

Rutas relativas a la raíz del repositorio:

- Backend Backoffice: `backend/app/api/routers/backoffice.py`, `backend/app/schemas/backoffice.py`, `backend/app/services/backoffice.py`, `backend/app/repositories/backoffice.py`.
- Aprovisionamiento: `backend/app/services/workspace_provisioning.py`, `backend/app/repositories/workspace_provisioning.py`.
- Planes y módulos: `backend/app/services/subscription_plans.py`, `backend/app/services/modules.py`, `backend/app/repositories/modules.py`, `backend/app/db/models/subscription.py`.
- Identidad e IAM: `backend/app/services/auth.py`, `backend/app/services/users.py`, `backend/app/repositories/users.py`, `backend/app/db/models/identity.py`.
- Frontend: `frontend/src/services/backofficeApi.js` y `frontend/src/modules/backoffice/pages/`.
- Sesión y navegación: `frontend/src/components/auth/AuthGate.jsx`, `frontend/src/components/layout/Sidebar.jsx`, `frontend/src/stores/sessionStore.js`, `frontend/src/router/index.jsx`.
- Migraciones existentes: `backend/alembic/versions/20260912_0029_platform_operator.py`, `20260912_0030_subscription_plans.py` y `20260912_0031_schema_model_sync.py`.

## 3. Diferencias identificadas en la revisión inicial

| ID | Hallazgo en el código actual | Efecto | Fase |
|---|---|---|---|
| BO-01 | `backofficeApi.listUsers` envía `workspaceId` y `pageSize`; el router declara `workspace_id` y `page_size` sin alias de query. Los alias de `ApiModel` son para modelos, no para esos parámetros. | El filtro por compañía y el tamaño de página enviados desde UI no coinciden con el contrato del backend. | A |
| BO-02 | `BackofficeUsuariosPage` usa solamente `items`, no controla página ni totales y no inicializa `status` desde la URL. `list_workspace_members` recorta a 500 y el endpoint presenta ese resultado como completo. | Usuarios posteriores a los primeros 25 no son accesibles desde la lista; el enlace «Usuarios inactivos» pierde su filtro; miembros pueden quedar ocultos. | A |
| BO-03 | El selector de plan solo cambia `planCode`; guardar envía también `selectedModules` del estado previo. El backend aplica primero el plan y después esos módulos. | Cambiar de Completo a Básico puede conservar los módulos anteriores. `planLabel` ya incluye «personalizado» y la ficha vuelve a añadirlo. | A |
| BO-04 | La UI de alta de compañía exige contraseña siempre; el aprovisionamiento exige omitirla si el owner ya existe. El alta global de usuarios también exige contraseña, aunque el servicio la ignora para identidades existentes. | No se puede dar de alta una compañía con owner existente desde la UI; el formulario de usuarios solicita una credencial que puede no utilizar. | B |
| BO-05 | La UI calcula «Activo» combinando plataforma y membership, pero el botón cambia únicamente `PlatformUser.status`. IAM ya puede suspender memberships. La creación comprueba duplicados solo en memberships `active`/`invited`, aunque la unicidad aplica a cualquier estado. | «Activar» no recupera un membership suspendido; «Inactivar» afecta todas las compañías; volver a registrar un membership suspendido acaba en conflicto. | B |
| BO-06 | Backoffice asigna un solo `roleCode`; roles de sucursal se asignan a la primera sucursal activa ordenada por nombre. La desactivación global no reutiliza la protección del último administrador de IAM. El aprovisionamiento no rechaza explícitamente un owner operador, mientras el alta de usuarios sí lo hace. | Falta completar gestión de acceso por compañía y aplicar las mismas invariantes en las entradas de Backoffice. | B |
| BO-07 | Las fechas y notas de suscripción no se exponen ni editan. `assign_plan` fuerza `active`; el acceso a módulos no consulta el estado/vigencia de `WorkspaceSubscription`. | Hay catálogo y asignación de plan, pero no gestión efectiva del ciclo de suscripción. | C |
| BO-08 | Backoffice obtiene módulos por estado del entitlement; `ModuleAccessService` además considera fechas y dependencias. Se filtran códigos desconocidos silenciosamente y `update_plan` puede guardarlos. | La consola puede mostrar módulos habilitados que el usuario no puede utilizar. | C |
| BO-09 | Editar un pack no sincroniza los entitlements de sus workspaces. `planCustomized` compara contra el catálogo actual. En el seed, Básico incluye inventario y Pro/Completo tienen el mismo conjunto de módulos. | Se necesita explicitar el efecto de editar el catálogo; el historial no describe exactamente los packs del código. | C |
| BO-10 | Aprovisionamiento, actualización de workspace y alta de usuarios registran actor nulo; edición de planes no registra auditoría. Solo la actualización global de usuario recibe el operador. | La trazabilidad existe parcialmente; falta saber quién realizó cada operación y consultarla desde la consola. | D |
| BO-11 | Overview cuenta identidades distintas con algún membership activo; la lista cuenta memberships y considera inactivo un membership no activo. | El KPI de inactivos y el listado filtrado representan conjuntos distintos. | D |
| BO-12 | Hay pruebas backend parciales; no se encontraron suites dedicadas a Backoffice en `frontend/tests` o `frontend/e2e`. Los servicios de Backoffice y planes están excluidos de cobertura. `BACKOFFICE_API.md` todavía describe solo API key, todos los módulos y ausencia de entidad/sucursal inicial. | Faltan pruebas de los flujos integrados y documentación consistente con la implementación. | E, con pruebas en cada fase |

## 4. Fases de ampliación

Estas fases sustituyen el trabajo pendiente del plan histórico. No se debe volver a implementar su base ya existente.

### Fase A — Corregir los flujos actuales de usuarios y planes

**Objetivo:** que lo que ya muestra la consola funcione con el contrato real.

- [x] **BO-01:** declarar `workspaceId` y `pageSize` como nombres públicos de query y alinear router, cliente y OpenAPI. Verificar consumidores de los nombres snake_case antes de retirarlos; si existen, mantener compatibilidad explícita y rechazar valores contradictorios.
- [x] **BO-02:** conectar `page`, `pageSize`, `totalItems` y `totalPages` con controles de paginación. Reiniciar página al cambiar filtros. Leer y conservar `workspaceId`, `status`, búsqueda y página en la URL.
- [x] Paginar también los miembros de la ficha, con total real; eliminar el recorte silencioso de 500. Mantener búsqueda de compañías existente; la paginación general de compañías puede abordarse después si el volumen lo requiere.
- [x] **BO-03:** al seleccionar otro plan, cargar sus módulos por defecto en el formulario. Personalizar después debe ser una acción visible; incluir «Restaurar módulos del plan».
- [x] Al guardar solo módulos, omitir `planCode` si no cambió. Al cambiar plan, enviar los módulos elegidos para ese nuevo plan. Evitar que un guardado de módulos reactive una suscripción por volver a asignar su plan.
- [x] Mostrar una sola indicación de personalización. Ante `409`, conservar el borrador y ofrecer recargar los datos actuales.

**Reutilizar/modificar:** router y schemas de Backoffice, `backofficeApi.js`, `BackofficeUsuariosPage.jsx`, `CompaniaDetailPage.jsx`; repositorio de miembros para paginación.

**Criterios de aceptación:**

1. Con dos workspaces y más de 25 miembros, filtrar uno no devuelve miembros del otro y se pueden recorrer todos los resultados.
2. Abrir `/backoffice/usuarios?workspaceId=...&status=disabled` y recargar conserva ambos filtros.
3. Cambiar Completo → Básico aplica los módulos de Básico; una excepción aparece solamente si fue seleccionada. Guardar módulos no reasigna el plan innecesariamente.
4. La ficha con más de 500 miembros informa el total real y permite acceder a todos por páginas.

### Fase B — Completar altas y acceso de usuarios por compañía

**Objetivo:** gestionar cuentas existentes y nuevas sin confundir credenciales globales con membresías de una compañía.

- [x] **BO-04:** ofrecer en el alta de compañía y de usuario las opciones «Identidad nueva» y «Cuenta existente». La nueva exige contraseña; la existente la omite y conserva sus credenciales y perfil global.
- [x] Ajustar `CreateBackofficeUserRequest` y el servicio para exigir contraseña solo para identidad nueva. Si una identidad existente recibe una contraseña, devolver error claro, siguiendo el aprovisionamiento; no ignorarla ni sobrescribirla.
- [x] Reutilizar búsquedas autorizadas para localizar identidades. No incorporar un buscador público de correos. Rechazar identidades sin credencial utilizable, deshabilitadas o de operador donde corresponda, tanto al crear owners como al agregar miembros.
- [x] **BO-05:** mostrar por separado **Estado de la cuenta global** y **Acceso a esta compañía**. La acción global indica que afecta todos los workspaces; la acción por compañía usa el membership y revoca solamente sus sesiones.
- [x] Extender Backoffice con `PATCH /api/v1/backoffice/workspaces/{workspaceId}/members/{membershipId}` para `version`, `status` y, cuando corresponda, `roleAssignments`. La versión corresponde al membership, no a `PlatformUser`.
- [x] Al encontrar un membership existente suspendido, dirigir a su reactivación explícita. No crear otro registro ni reactivar automáticamente memberships revocados o expirados.
- [x] **BO-06:** reutilizar contratos y reglas IAM de `roleAssignments[]` y scopes `workspace`, `legalEntity`, `branch`, agregando lectura de opciones/detalle bajo autorización de operador. Sustituir la elección implícita de la primera sucursal por una selección explícita.
- [x] Compartir la validación y persistencia con IAM mediante funciones/servicios comunes. No fabricar un JWT de cliente ni reutilizar un permiso de la compañía interna como si perteneciera al workspace destino.
- [x] Proteger al último administrador utilizable de cada workspace afectado por una suspensión, degradación o desactivación global. Para la operación global, comprobar todas sus compañías y aplicar bloqueos en un orden estable; fallar de forma atómica si alguna quedaría sin administrador.
- [x] Conservar la exclusión de operadores en usuarios finales y rechazar asignarlos como owners clientes también por el endpoint de aprovisionamiento.

**Reutilizar/modificar:** `BackofficeService`, provisioning, schemas y repositorios de usuarios, reglas de `UsersService`, formularios de `CompaniasPage`, `BackofficeUsuariosPage` y miembros de `CompaniaDetailPage`.

**Criterios de aceptación:**

1. Una identidad existente puede ser owner de otro workspace desde la UI sin cambiar su contraseña.
2. Un usuario miembro de A y B puede suspenderse en A y seguir operando en B; reactivar A no cambia el estado global.
3. Desactivar la cuenta global bloquea login, access tokens y refresh en todas sus compañías; reactivarla conserva las suspensiones locales previamente decididas.
4. Registrar nuevamente un membership suspendido ofrece un camino claro de reactivación; no produce una duplicación ni un error genérico de integridad.
5. No se puede dejar una compañía sin administrador, incluso con dos operaciones concurrentes. Las asignaciones no admiten IDs de roles/sucursales/entidades de otro workspace.
6. Un operador no puede convertirse en usuario final/owner por ninguna de las dos altas. Usuario tenant y petición anónima no pueden ejecutar acciones de Backoffice.

### Fase C — Completar suscripciones y coherencia de módulos

**Objetivo:** que plan, excepciones, vigencia y acceso real tengan reglas explícitas.

#### C.1. Estado y fechas de suscripción

- [x] **BO-07:** exponer en el detalle un objeto `subscription` con su propia `version`, `status`, `startedAt`, `endsAt`, `notes` y `effectiveStatus`. Mantener los campos actuales de resumen mientras haya consumidores.
- [x] Añadir `PATCH /api/v1/backoffice/workspaces/{workspaceId}/subscription` para estado, fechas y notas, con control de versión y validación de `endsAt >= startedAt`.
- [x] Reutilizar los estados de la tabla: `trial`, `active`, `cancelled`, `expired`. Cambiar de plan o modificar módulos no debe cambiar estado ni fechas de manera implícita; la reactivación/renovación se realiza expresamente desde esta sección.
- [x] Añadir los controles a `CompaniaDetailPage`, mostrando por separado estado del workspace y de la suscripción.

**Regla propuesta para implementar, sin pagos:**

- `trial` y `active` permiten los módulos contratados cuando `startedAt <= ahora` y `endsAt` está vacío o todavía no pasó.
- `cancelled`, `expired`, una fecha inicial futura o una fecha final pasada no permiten módulos comerciales. Conservar `foundation`/`iam` para identidad y consultar el estado de la cuenta; los permisos IAM siguen aplicando.
- Calcular vigencia en backend en cada resolución de acceso, con reloj comprobable en tests. Una suscripción con fecha vencida presenta `effectiveStatus=expired` aunque su estado almacenado todavía sea `active` o `trial`. No depender de un proceso periódico para bloquear acceso.
- Mantener la suspensión del workspace como restricción independiente. Renovar la suscripción no reactiva un workspace suspendido ni una identidad deshabilitada.
- Para workspaces previos sin suscripción, conservar inicialmente los entitlements actuales y mostrarlos como «Sin plan asignado». La transición exige asignación explícita o backfill documentado; no quitar acceso durante la migración por ausencia de una fila histórica.
- El workspace interno de operadores no queda bloqueado por reglas comerciales de clientes.
- En el ERP, mostrar un estado comprensible de suscripción sin vigencia y permitir cerrar sesión o cambiar a otro workspace habilitado. Ajustar `AuthGate` para evitar redirigir repetidamente a un dashboard que también esté deshabilitado.

Estas reglas ya están implementadas. Las nuevas asignaciones incluyen las dependencias del plan; en Básico, Agenda incorpora RRHH. Se conservan las configuraciones de compañías existentes.

#### C.2. Plan, excepciones y módulos efectivos

- [x] **BO-08:** usar un cálculo común de módulos efectivos para Backoffice y `/auth/me`, incluyendo disponibilidad, vigencia, dependencias y suscripción.
- [x] Si se muestran módulos configurados además de efectivos, exponerlos en campos distintos y explicar el motivo de bloqueo. El vencimiento no debe modificar los módulos contratados ni hacer que `planCustomized` cambie por sí solo.
- [x] Rechazar códigos inexistentes/no disponibles en altas y cambios; devolver un error de validación antes de guardar. Conservar `foundation` e `iam` como obligatorios.
- [x] Incluir dependencias en el catálogo de módulos utilizado por la UI. La selección debe añadir sus prerrequisitos y advertir al retirar un módulo necesario; el backend debe rechazar conjuntos inconsistentes.
- [x] **BO-09:** mantener los entitlements actuales al editar el catálogo de un plan. Indicar en Planes que los cambios se aplican a nuevas asignaciones y a «Restaurar módulos del plan»; no introducir propagación masiva implícita.
- [x] Explicar una diferencia con el catálogo como tal: también puede deberse a una edición posterior del pack. No atribuir necesariamente `planCustomized` a una edición manual del operador.
- [x] Documentar los packs reales: Básico incluye inventario en el seed revisado; Pro y Completo contienen los mismos módulos allí. No cambiar los módulos contratados ni inventar una diferenciación comercial sin una decisión posterior.
- [x] Refrescar el contexto de módulos del cliente en la siguiente carga/recuperación de sesión y ante una denegación por cambio de acceso. El backend debe hacer cumplir los cambios incluso con una pestaña abierta.

**Reutilizar/modificar:** `WorkspaceSubscription`, `WorkspaceEntitlementService`, `ModuleAccessService`, repositorios y schemas de Backoffice/auth, `CompaniaDetailPage`, `PlanesPage`, sesión y guardas del frontend. Las columnas de estado/fechas ya existen; cualquier migración adicional debe justificar un dato nuevo concreto.

**Criterios de aceptación:**

1. Crear, modificar, vencer y renovar una suscripción produce el mismo resultado en ficha, `/auth/me`, navegación y acceso directo a una API de negocio.
2. Un token emitido antes del vencimiento no permite usar módulos comerciales después de vencer; tampoco lo permite un refresh.
3. Renovar restaura únicamente los módulos contratados y los permisos vigentes, sin alterar bloqueos independientes.
4. Se prueban fechas futuras, final nulo, límite exacto de vencimiento, períodos inválidos y conflicto de versión.
5. Ningún módulo se presenta como efectivo si falta una dependencia. Un código desconocido no se descarta silenciosamente ni se guarda en el catálogo.
6. Editar un pack conserva el acceso de workspaces existentes; restaurar sus módulos aplica explícitamente el catálogo actual. Se preserva acceso de workspaces históricos sin suscripción y del operador interno.

### Fase D — Completar auditoría y aclarar las métricas

**Objetivo:** saber quién cambió el acceso y qué representan los contadores del Resumen.

- [x] **BO-10:** obtener un contexto único de acceso Backoffice que distinga operador JWT de API key. Pasar el actor a todas las mutaciones existentes y nuevas.
- [x] Reutilizar `AuditEntry` para aprovisionamiento, estado de workspace, plan/módulos, suscripción, alta de usuario, estado global y cambios de membership/roles. Guardar actor, workspace objetivo cuando aplique, target, acción, fecha, `requestId` y cambios relevantes antes/después.
- [x] Las operaciones globales de planes pueden usar `workspace_id=None`. Las de usuario global deben permitir reconstruir las compañías afectadas; no atribuirlas únicamente a un membership arbitrario.
- [x] Para API key, registrar el tipo de actor sin inventar un usuario humano ni almacenar el secreto. Para JWT, conservar el ID del operador real.
- [x] Agregar `GET /api/v1/backoffice/audit` paginado, con filtros por workspace, usuario objetivo, actor, acción y fechas. Integrar una sección de actividad en las pantallas existentes; reutilizar repositorio/tabla de auditoría, sin crear otro registro paralelo.
- [x] **BO-11:** distinguir métricas de **cuentas globales** y de **accesos por compañía**. Contar identidades sin duplicarlas en los KPIs globales; incluir cuentas cuyos memberships estén suspendidos. Separar el estado de suscripción del estado de workspace al agrupar por plan.
- [x] Hacer que los enlaces de cada KPI abran el listado con filtros equivalentes. Si el listado conserva una fila por membership, informar también el total de identidades distintas para que se entienda la diferencia.

**Reutilizar/modificar:** modelo `AuditEntry`, dependencia de acceso Backoffice, servicios que mutan datos, `BackofficeRepository.overview`, schemas, `BackofficePage` y sección de actividad de la ficha.

**Criterios de aceptación:**

1. Cada operación se puede atribuir al operador correcto o al uso de API key; la auditoría no contiene contraseñas, JWT ni claves.
2. Un cambio fallido no deja un evento de éxito ni cambios parciales. Las acciones de plan y suscripción tienen historial consultable.
3. Un usuario en dos compañías, un membership suspendido y una identidad deshabilitada producen conteos y filtros coherentes con las etiquetas de la UI.
4. El historial admite paginación y filtros reales; un usuario tenant no puede consultar el historial global.

### Fase E — Validación integrada y documentación de entrega

**Objetivo:** cerrar las ampliaciones con evidencia sobre el stack real.

- [x] **BO-12:** ampliar `backend/tests/test_backoffice_access.py`, `test_workspace_provisioning.py`, `test_subscription_plans.py` y pruebas de IAM/módulos según cada cambio. Añadir regresiones en la fase que corrige cada fallo, no posponer todas las pruebas hasta aquí.
- [x] Crear pruebas frontend específicas en `frontend/tests/` para parámetros, paginación, selección de plan, estados de usuario y suscripción.
- [x] Crear recorrido real en `frontend/e2e/full-stack/backoffice.spec.js`, reutilizando la configuración full-stack existente y PostgreSQL de prueba.
- [x] Ejecutar integración con `APP_ENV=test` y una base desechable llamada `erp_test`. Un resultado con tests de integración omitidos no cierra la fase.
- [x] Cubrir las ramas críticas de los servicios de Backoffice y planes y retirarlos de `coverage.run.omit` al incorporar su cobertura. Mantener el gate actual de CI durante la ampliación; no bajarlo ni añadir exclusiones para conseguir una ejecución exitosa. El aumento general a 90% es trabajo separado.
- [x] Actualizar `docs/backend/BACKOFFICE_API.md`: autenticación dual, rutas existentes y nuevas, parámetros, credenciales de identidad existente, entidad/sucursal inicial, planes, suscripción, memberships y errores `409`.
- [x] Documentar puesta en marcha local del operador, separación entre compañía/workspace/entidad legal/sucursal y la política de catálogo sin propagación automática.
- [x] Registrar comandos, entorno, commit validado y resultados separados de unitarios, integración, E2E y build. Comprobar el código de salida real; una ejecución de shell exitosa no acredita un resumen con pruebas fallidas.

**Recorrido mínimo de cierre:** operador entra → crea workspace con owner nuevo → crea otro con owner existente → cambia plan → configura una excepción válida → registra usuario y acceso por sucursal → suspende solo un membership → verifica la otra compañía → desactiva/reactiva globalmente respetando último admin → vence/renueva suscripción → suspende/reactiva workspace → revisa métricas y auditoría.

La prueba incluye sesiones ya abiertas, refresh, conflictos de versión y peticiones directas a las APIs de negocio. También verifica que cambiar módulos nunca amplía los permisos de un rol.

## 5. Contratos y datos que se amplían

Todas las rutas siguientes llevan el prefijo `/api/v1/backoffice`. `{workspaceId}` y `{membershipId}` son nombres ilustrativos de parámetros de ruta.

| Contrato | Cambio previsto |
|---|---|
| `GET /users` | Corregir query pública y paginación consumida por UI; aclarar filtros de identidad frente a membership. |
| `POST /users` | Soportar explícitamente identidad nueva/existente; asignaciones IAM con scopes y validación del workspace destino. |
| `PATCH /users/{userId}` | Mantener operación global, protección de administradores, versión global y auditoría completa. |
| `POST /workspaces` | Reutilizar aprovisionamiento; completar UI de owner existente y coherencia de validación de operadores/módulos. |
| `PATCH /workspaces/{workspaceId}` | Conservar nombre, estado y plan/módulos; evitar reactivación implícita de suscripción. |
| `GET /workspaces/{workspaceId}` | Agregar detalle/versionado de suscripción y distinguir módulos configurados de efectivos cuando difieran. |
| `GET /workspaces/{workspaceId}/members` | Paginación real y versiones separadas de identidad y membership. |
| Lecturas de opciones y detalle de miembro bajo `/workspaces/{workspaceId}/...` | Reutilizar catálogos/contratos IAM para editar roles y scopes como operador. Definir las rutas concretas al implementar B. |
| **Nuevo:** `PATCH /workspaces/{workspaceId}/members/{membershipId}` | Cambiar acceso/roles de esa compañía, con versión de membership. |
| **Nuevo:** `PATCH /workspaces/{workspaceId}/subscription` | Administrar estado, fechas y notas, con versión de suscripción. |
| `GET /modules`, `PATCH /plans/{planId}` | Dependencias, validación de módulos y política explícita de aplicación del catálogo. |
| `GET /overview` | Métricas definidas por identidad, acceso y suscripción; conservar compatibilidad de campos o migrar UI/API juntas. |
| **Nuevo:** `GET /audit` | Historial paginado de operaciones de plataforma con filtros. |

No se requieren nuevas tablas para identidad, membership, planes, suscripción ni auditoría. Mantener `version` para modificaciones y asegurar que comprobación y escritura sean atómicas; probar concurrencia en operaciones que podrían dejar una compañía sin administrador. No reescribir ni volver a ejecutar migraciones históricas como sustituto de una migración incremental.

## 6. Orden y límites

**Orden recomendado:** A → B → C → D → E. Cada fase entrega su UI, API y pruebas pertinentes sobre el módulo actual. La atribución de auditoría se incorpora desde que se toca una mutación; D termina su consistencia y consulta.

Quedan fuera de estas fases: Stripe/cobros/facturas de plataforma, redefinir comercialmente Básico/Pro/Completo, propagación masiva de cambios de plan, otro backoffice, otra base de identidades, CRUD alternativo de entidades legales/sucursales y un sistema independiente de permisos por usuario. Tampoco se programa aquí una consola para dar de alta/baja operadores de plataforma, reset global de contraseñas o un nuevo sistema de invitaciones; las capacidades IAM existentes se reutilizan cuando se amplíe ese alcance.

**Entrega:** fases A–E implementadas sobre el módulo existente, con validación local documentada. No se realizó push ni despliegue.
