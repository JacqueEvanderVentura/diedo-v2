# Entrega: ampliación del Backoffice existente

**Fecha:** 15 de septiembre de 2026.  
**Base:** rama `full-stack`, HEAD `159520977214271a5132fc069ba59814b6b648b8`, más los cambios locales de esta entrega.  
**Alcance:** backend, frontend y pruebas del Backoffice actual. Sin push ni despliegue.

## Cambios entregados

- Filtros compatibles con `workspaceId`/`pageSize`, paginación real de usuarios y miembros, filtros conservados en URL y conteos de identidades separados de accesos.
- Alta con cuenta nueva o existente; preservación de credenciales y rechazo de operadores como usuarios finales/owners.
- Gestión por membership de estado y roles con alcance explícito; cuenta global separada; revocación de sesiones y protección del último administrador, incluyendo concurrencia.
- Cambio de plan con sus módulos correctos, restauración de catálogo y selección coherente con dependencias. Editar un pack conserva las configuraciones existentes.
- Vigencia de suscripción con versión propia, fechas y notas. Bloqueo efectivo de APIs de negocio con tokens ya emitidos, recuperación tras renovación y aviso en el ERP.
- Auditoría consultable desde Resumen y ficha, con operador o integración, cambios antes/después, filtros y `requestId`.
- Reutilización de IAM, identidad, aprovisionamiento y tablas existentes. No hay migración adicional.

La lectura y las nuevas asignaciones de Básico incorporan RRHH como requisito de Agenda. Esta resolución de dependencias no modifica los entitlements de compañías existentes. Pro y Completo conservan el catálogo del seed.

## Verificación local

Entorno: Windows, Python 3.14.7, Node 22.14.0 y PostgreSQL 18. La base desechable `erp_test` se creó en `127.0.0.1:5434`; no se usó la base de desarrollo configurada en 5433. Dependencias de Python según `backend/requirements.txt`.

| Comprobación | Resultado |
|---|---|
| Backend: Backoffice, provisioning, planes, suscripción y fase 0/1 | 49 pruebas aprobadas, sin integración omitida. |
| Backend: IAM, usuarios, cookies, seguridad y repetición de Backoffice tras ajustar validación compartida | 31 pruebas aprobadas; 7 también pertenecen al grupo anterior. |
| Frontend completo | 306 pruebas aprobadas en 84 archivos. |
| Frontend focalizado tras formato final | 24 pruebas aprobadas. |
| Playwright full-stack | 2 recorridos aprobados; inspección visual de ficha. |
| Build de frontend | Correcto; conserva advertencia de tamaño de bundles. |
| Ruff sobre archivos Python modificados | Correcto, incluyendo formato. |
| Mypy sobre 13 archivos de aplicación modificados | Correcto. |

Se comprobaron 507 miembros con paginación, alias contradictorios, identidad compartida entre compañías, suspensión local frente a global, acceso con sesiones abiertas, último administrador y operaciones concurrentes, scopes ajenos, versión desactualizada, módulos desconocidos, cambio de catálogo sin propagación, períodos inválidos y límites exactos de vigencia. Los recorridos de navegador cubren alta con owner nuevo/existente, cambio de plan, alta y estados de usuario, auditoría, cancelación/renovación de suscripción y suspensión de compañía.

Backoffice y planes se retiraron de `coverage.run.omit`; no se redujeron umbrales. Cobertura combinada de líneas y ramas de los recorridos focalizados: servicio Backoffice 84%, planes 87%, cálculo de vigencia 100%, router Backoffice 95%. Estos porcentajes no representan la cobertura global del ERP.

### Límites de los checks generales

La revisión general del repositorio conserva errores previos fuera de esta entrega: Ruff informa 5 problemas en `app/services/email.py` y `tests/test_email_service.py`; Mypy global informa 17 errores en `app/services/email.py`. Esos archivos no se modificaron. No se declara CI general aprobado ni se ejecutó un despliegue.

## Comandos de referencia

### Ampliación posterior: primer operador de producción

Se agregó `python -m app.scripts.create_platform_operator --email "tu-correo@tuempresa.com" --name "Tu nombre"`. Pide contraseña oculta con confirmación, crea únicamente la cuenta y el acceso interno necesarios, admite automatización mediante stdin y conserva credenciales al repetir un alta. Rechaza la promoción de cuentas de clientes y la reactivación implícita de operadores deshabilitados. El evento aparece en la auditoría global. No agrega migraciones ni modifica las cuentas locales de prueba.

La prueba del comando usa `APP_ENV=production` con una base desechable local `erp_test`; no se creó ninguna cuenta en una base real de producción. Instrucciones: [primer operador en producción](./backend/BACKOFFICE_API.md#primer-operador-en-producción).

### Validación de la ampliación original

Desde `backend`, configurar `APP_ENV=test` y `DATABASE_URL` apuntando a una base desechable llamada `erp_test`:

```powershell
.venv/Scripts/python.exe -m pytest tests/test_backoffice_management.py tests/test_backoffice_access.py tests/test_workspace_provisioning.py tests/test_subscription_plans.py tests/test_subscription_access.py tests/test_phase0_units.py tests/test_phase0_phase1.py -q
.venv/Scripts/python.exe -m pytest tests/test_users_service.py tests/test_iam_api.py tests/test_auth_cookie_policy.py tests/test_security.py tests/test_backoffice_management.py -q
```

Desde `frontend`:

```powershell
npm test
npm run build
npm run test:e2e:full-stack -- backoffice.spec.js
```

El runner E2E acepta `FULL_STACK_DATABASE_URL` y `FULL_STACK_ADMIN_PASSWORD` y reinicia el esquema de `erp_test`; debe ejecutarse separado de las otras pruebas de integración. Los servicios temporales de esta validación quedaron apagados.

Contrato y puesta en marcha: [BACKOFFICE_API.md](./backend/BACKOFFICE_API.md). Lista de trabajo completada: [BACKOFFICE_EXTENSION_PLAN.md](./BACKOFFICE_EXTENSION_PLAN.md).
