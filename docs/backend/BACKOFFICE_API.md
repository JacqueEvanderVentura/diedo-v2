# Backoffice: compañías, usuarios y suscripciones

El módulo existente `/backoffice` administra workspaces de clientes, planes y accesos. Todas las rutas siguientes llevan el prefijo `/api/v1/backoffice`.

## Acceso de plataforma

- **Operador:** JWT obtenido por `/api/v1/auth/login` de una cuenta con `is_platform_operator=true`. `/auth/me` expone `isPlatformOperator`. Funciona sin API key configurada.
- **Integración:** cabecera `X-Backoffice-Key` con `BACKOFFICE_API_KEY`. Es una credencial de servidor; no se entrega al frontend. La auditoría registra `api_key`, sin inventar una persona ni almacenar la clave.

Usuarios tenant no tienen acceso. Se conserva la respuesta existente para solicitudes sin credencial válida: `503` cuando no hay API key configurada, `401` cuando la integración está configurada pero falta una clave válida. Operadores y workspace interno `helios-platform` quedan excluidos de los clientes.

## Compañía, entidad legal y sucursal

En la consola, **Compañía = workspace**. Dentro hay entidades legales y sucursales. La identidad y contraseña pertenecen a `PlatformUser`; cada acceso a una compañía pertenece a `WorkspaceMembership`.

El aprovisionamiento crea en una transacción el workspace, entidad legal inicial `MAIN`, sucursal `Principal`, administrador con alcance de workspace, roles y permisos estándar, módulos del plan y configuración base. Las entidades y sucursales posteriores se gestionan con las APIs existentes de foundation.

## Rutas

| Método y ruta | Función |
|---|---|
| `GET /context` | Comprobar acceso a la consola. |
| `GET /overview` | Totales de compañías, cuentas, memberships y suscripciones vigentes por plan. |
| `GET /workspaces` | Lista de compañías, plan y suscripción. |
| `POST /workspaces` | Crear compañía con owner nuevo o existente. |
| `GET /workspaces/{workspaceId}` | Ficha, owner, sucursales, plan, módulos y suscripción. |
| `PATCH /workspaces/{workspaceId}` | Nombre, estado, plan o módulos. |
| `GET /workspaces/{workspaceId}/members` | Miembros paginados, sin recorte a 500. |
| `GET /workspaces/{workspaceId}/member-options` | Roles, sucursales y entidades para asignaciones IAM. |
| `GET /workspaces/{workspaceId}/members/{membershipId}` | Acceso individual y versión actual. |
| `PATCH /workspaces/{workspaceId}/members/{membershipId}` | Estado local y asignaciones de roles. |
| `PATCH /workspaces/{workspaceId}/subscription` | Estado, vigencia y notas. |
| `GET /users` | Listado global: una fila por membership. |
| `POST /users` | Acceso con cuenta nueva o existente. |
| `PATCH /users/{userId}` | Activar/deshabilitar cuenta global. |
| `GET /modules` | Catálogo disponible con `dependencyCodes`. |
| `GET /plans` | Planes activos y módulos, incluyendo requisitos. |
| `PATCH /plans/{planId}` | Actualizar catálogo con control de versión. |
| `GET /audit` | Historial paginado de cambios de Backoffice. |

## Alta de compañía

```json
{
  "slug": "empresa-nueva",
  "name": "Empresa Nueva",
  "defaultCurrency": "DOP",
  "timezone": "America/Santo_Domingo",
  "locale": "es-DO",
  "taxDefaultRate": 18,
  "planCode": "completo",
  "owner": {
    "email": "owner@example.com",
    "displayName": "Propietario",
    "password": "Ejemplo!de-clave-inicial"
  }
}
```

Para identidad existente, omitir `owner.password`; se conservan nombre y credencial globales. Se rechaza enviar contraseña para una identidad existente, reutilizar una cuenta deshabilitada o sin contraseña, y usar un operador como owner. `planCode` por defecto es `completo`; `enabledModules`, si se envía, sustituye los módulos del plan.

## Usuarios: cuenta global y acceso local

`GET /users` admite `search`, `workspaceId`, `platformStatus=active|disabled`, `status=active|disabled`, `page` y `pageSize` (1 a 100, por defecto 25). `status=active` exige cuenta y membership activos; `disabled` incluye cuenta deshabilitada o membership no activo. `platformStatus` filtra solo la cuenta global. Workspace y suscripción son restricciones independientes.

Se mantienen los alias heredados `workspace_id` y `page_size`. Valores contradictorios entre alias devuelven `400`. La respuesta contiene `items`, `page`, `pageSize`, `totalItems`, `totalPages` y `totalUsers`: este último cuenta identidades distintas y `totalItems` cuenta accesos.

El listado de miembros acepta `page` y `pageSize`. Cada fila incluye `userId`, `membershipId`, `platformStatus`, `membershipStatus`, `version` de la cuenta, `membershipVersion` del acceso y `roleAssignments`.

Alta por sucursal:

```json
{
  "workspaceId": "<UUID de compañía>",
  "email": "usuario@example.com",
  "displayName": "Usuario",
  "password": "Ejemplo!de-clave-inicial",
  "roleAssignments": [
    {"roleId": "<UUID de rol>", "scopeType": "branch", "branchId": "<UUID de sucursal>"}
  ]
}
```

Para cuenta existente, omitir `password`; no se modifica la identidad. Un membership existente, incluso suspendido, devuelve `409` para gestionarlo explícitamente. No se duplican ni reactivan automáticamente accesos revocados, invitados o expirados.

Las asignaciones admiten `workspace`, `legalEntity` con `legalEntityId`, o `branch` con `branchId`. IDs activos de la compañía destino son obligatorios; Administrador requiere alcance `workspace`. La UI pide el alcance explícito. `roleCode` permanece como compatibilidad para consumidores antiguos que no envían `roleAssignments`.

El PATCH local recibe, por ejemplo, `{"version": 1, "status": "suspended"}`, usando **membershipVersion**. `status` admite `active|suspended`; enviar `roleAssignments` reemplaza el conjunto. Suspender o cambiar roles revoca solo sesiones de ese membership.

El PATCH global recibe `{"version": 1, "status": "disabled"}`, usando **version de PlatformUser**. Deshabilitar revoca todas sus sesiones; reactivar conserva suspensiones locales. Ambas operaciones protegen al último administrador utilizable. La operación global comprueba todas las compañías afectadas y falla atómicamente si alguna quedaría sin administrador.

## Planes y módulos

El PATCH del workspace usa su versión. Cambiar `planCode` carga los módulos del nuevo plan; `enabledModules` aplica una selección explícita adicional. Para editar solo módulos, omitir `planCode`. Cambiar de plan nunca reactiva la suscripción ni modifica sus fechas.

- `configuredModules`: entitlements configurados.
- `enabledModules`: cálculo compartido con `/auth/me`, considerando disponibilidad, fechas, dependencias y suscripción.
- `planCustomized`: diferencia frente al catálogo actual; puede deberse a una edición posterior del catálogo. Vencer no modifica este indicador.
- `foundation` e `iam` son obligatorios. Códigos desconocidos/no disponibles y conjuntos sin dependencias devuelven `400`, sin cambios parciales.
- La UI añade requisitos al seleccionar módulos y retira dependientes al quitar un requisito.

Editar un plan conserva los entitlements de compañías existentes. El catálogo se aplica en nuevas asignaciones y al guardar «Restaurar módulos del plan» en una compañía. No hay propagación masiva.

El seed histórico de Básico incluye Agenda e inventario; Agenda depende de RRHH. Nuevas asignaciones y lectura del catálogo incorporan los requisitos del pack: Básico incluye RRHH como dependencia. No se reescriben configuraciones existentes. Pro y Completo conservan los mismos módulos del seed.

## Vigencia de suscripción

La ficha incluye `subscription` con `version`, `status`, `effectiveStatus`, `startedAt`, `endsAt` y `notes`. Su versión es independiente del workspace.

```json
{
  "version": 1,
  "status": "active",
  "startedAt": "2026-09-15T00:00:00-04:00",
  "endsAt": null,
  "notes": "Renovación acordada"
}
```

El PATCH recibe estado y período completos. Estados: `active`, `trial`, `cancelled`, `expired`. Fechas con zona horaria; final nulo o mayor/igual al inicio; notas opcionales de hasta 2000 caracteres.

`active` y `trial` habilitan los módulos durante el período inclusivo `startedAt <= ahora <= endsAt`. Final nulo significa sin vencimiento. `effectiveStatus` se calcula al leer: inicio futuro → `scheduled`; final pasado → `expired`; estados explícitos `cancelled|expired` prevalecen. No requiere cron.

Sin vigencia se conservan `foundation`/`iam`, sujetos a permisos habituales, y se bloquean APIs de negocio incluso con tokens anteriores al vencimiento o tras refresh. El ERP muestra un aviso y permite comprobar acceso, cambiar compañía o cerrar sesión. Renovar no reactiva workspaces, cuentas o memberships suspendidos.

Workspaces históricos sin suscripción conservan sus entitlements hasta asignar un plan explícitamente. El workspace interno del operador está exento de reglas comerciales.

## Auditoría, métricas y errores

`GET /audit` admite `workspaceId`, `actorId`, `targetId`, `action`, `dateFrom`, `dateTo`, `page` y `pageSize`. Las fechas requieren zona horaria. Devuelve actor, acción, objetivo, workspace, fecha, `requestId`, tipo de actor y cambios relevantes. Registra aprovisionamiento, cuentas, memberships, roles, planes, módulos y suscripciones. Los cambios globales de cuenta dejan trazabilidad en cada workspace afectado. No registra contraseñas, JWT ni claves.

El Resumen cuenta identidades sin duplicarlas por compañía y separa memberships activos/inactivos. El agrupamiento por plan cuenta suscripciones `active|trial` dentro de su período en compañías activas.

`400`: validación. `404`: objetivo inexistente o excluido. `409`: versión desactualizada, duplicado o protección del último administrador. Ante conflicto, la UI ofrece recargar; los formularios de edición conservan el borrador cuando corresponde. Cambio y auditoría se guardan en una transacción.

## Primer operador en producción

El acceso usa una cuenta personal, creada con el comando administrativo del backend. No hay un correo o contraseña de producción predeterminado. Este comando funciona sin cargar datos demo ni usar las variables `LOCAL_BOOTSTRAP_*`.

1. Configurar el entorno del backend desplegado: `APP_ENV=production`, `DATABASE_URL` y `JWT_SECRET_KEY` del despliegue. Aplicar las migraciones existentes con `python -m alembic upgrade head`.
2. Desde una terminal administrativa del backend, ejecutar sustituyendo el correo y el nombre:

```bash
python -m app.scripts.create_platform_operator --email "tu-correo@tuempresa.com" --name "Tu nombre"
```

3. Comprobar el entorno, servidor y nombre de base que muestra el comando. Introducir dos veces la contraseña cuando la pida; no se muestra en pantalla ni se incluye como argumento del comando.
4. Abrir el login habitual del ERP e iniciar sesión con esos datos. La cuenta abre el Backoffice automáticamente.

En Windows se puede sustituir `python` por `.venv/Scripts/python.exe`; en Linux, por `.venv/bin/python`. El comando requiere acceso administrativo al entorno y a la base; no se ejecuta desde el navegador ni en cada arranque de la aplicación.

El alta crea el workspace interno si falta y una cuenta de operador con su membership de login. La autorización de Backoffice se basa en `is_platform_operator`, por lo que no necesita roles ni datos de clientes. No asigna al operador a compañías de clientes.

Repetirlo para un operador activo devuelve «ya existe» y conserva credenciales y perfil. Rechaza correos de clientes, operadores deshabilitados o accesos internos inconsistentes: no convierte identidades ni restablece contraseñas automáticamente. El alta queda registrada como `platform_operator.create`, con origen «Comando administrativo», en el historial global.

Para automatización existe `--password-stdin`: recibe una línea de un gestor de secretos por entrada estándar. No admite `--password` ni utiliza una contraseña fija del repositorio. La política de contraseña es la misma que la del resto del ERP.

## Puesta en marcha local

Requiere las migraciones existentes hasta `20260912_0031`. Esta ampliación no agrega tablas ni migraciones. En una base local, configurar `APP_ENV=development`, `DATABASE_URL`, `JWT_SECRET_KEY` y `LOCAL_BOOTSTRAP_ADMIN_PASSWORD`; opcionalmente `LOCAL_BOOTSTRAP_BACKOFFICE_PASSWORD` para una contraseña de operador distinta.

Desde `backend`, con su entorno virtual:

```powershell
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m app.scripts.bootstrap_local
.venv/Scripts/python.exe -m uvicorn app.main:app --reload
```

El bootstrap prepara también el workspace base y crea `backoffice@erp.dev`. Usa la contraseña de Backoffice configurada o, en su ausencia, la de administrador local. Solo funciona en desarrollo/test; volver a ejecutarlo puede actualizar esas credenciales locales. Desde `frontend`, ejecutar `npm run dev` y entrar con el operador.

Integración requiere `APP_ENV=test` y una base desechable `erp_test`. `frontend/e2e/full-stack/backoffice.spec.js` usa PostgreSQL local 5434, backend 8200 y frontend 3200. **El runner full-stack reinicia el esquema de erp_test**; no apuntarlo a datos de trabajo.
