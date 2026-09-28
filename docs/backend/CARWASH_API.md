# Carwash: contrato por fases

## Estado actual — fase 2

La configuración rápida funciona con API real bajo `/api/v1/carwash` y la tabla
`carwash_service_configs` (migración `20260928_0050`). La recepción y el control operativo usan
`carwash_washes` y `carwash_wash_lines` (migración `20260928_0051`). Completar, anular,
comisiones, liquidaciones e indicadores siguen siendo contrato futuro.
La demo conserva sus fixtures de solo lectura; la interfaz conectada nunca los utiliza.

La migración `20260928_0049` registra `carwash` como módulo `optional`, `available`, dependiente
directamente de `pos` y `hr`. El resolutor existente aplica también dependencias transitivas de
POS y vigencia de suscripción. La migración inserta entitlements deshabilitados para workspaces
existentes, conserva activaciones explícitas preexistentes y no agrega Carwash a planes ni al
bootstrap de módulos habilitados. Un workspace nuevo no tiene acceso sin activación explícita.

Los nueve permisos se registran también en bootstrap y se otorgan a administradores de workspace
según el patrón existente; eso no habilita el módulo. Otros roles requieren asignación expresa.
El Backoffice existente permite marcar Carwash en «Plan y módulos» de un workspace y guardar
la configuración con sus dependencias. Esta entrega no activa clientes ni cambia planes.

| Permiso | Operaciones previstas | Fase |
| --- | --- | --- |
| `carwash.read` | Entrada al módulo, listado/detalle de lavados | 0/2 |
| `carwash.settings.manage` | Configuración por sucursal | 0/1 |
| `carwash.wash.manage` | Registrar, editar, iniciar y cancelar antes de completar | 2 |
| `carwash.wash.complete` | Finalizar con permisos POS adicionales | 3 |
| `carwash.wash.void` | Anular coordinadamente con POS | 3 |
| `carwash.commissions.read` | Consulta de devengos y liquidaciones | 0/4 |
| `carwash.commissions.settle` | Pagar en caja autorizada | 4 |
| `carwash.commissions.reverse` | Reversar liquidación en caja autorizada | 4 |
| `carwash.reports.read` | Indicadores y reportes | 0/5 |

La fase 0 tiene pruebas de registro, dependencias, revocación y upgrade/downgrade. Downgrade
retira permisos/asignaciones y deshabilita entitlements; conserva la definición como `planned`.
Reaplicar no activa workspaces. No modifica POS ni genera ventas, comisiones o movimientos.

## Convenciones a mantener

Seguir [GLOBAL.md](GLOBAL.md): JSON camelCase, montos como strings decimales, paginación acotada,
versiones, errores `{message, parameter?}` con 400/401/403/404/409. Persistencia UTC y filtros por
día local de sucursal. Autoridad del cálculo en backend, con `Decimal` y redondeo POS.

Usar las dependencias IAM/módulos existentes y validar alcance de sucursal en cada consulta y
mutación; no confiar en IDs del navegador. Claves foráneas deben incluir workspace y, cuando
corresponda, sucursal. Idempotencia y control de versión siguen el contrato POS, con conflicto
si se reutiliza una clave para otro payload. El servicio posee la transacción; repositorio hace
flush, no commit. Sin estados financieros editables por un PATCH genérico.

## Configuración implementada

Todos los endpoints requieren módulo efectivo, `carwash.read` y `carwash.settings.manage`
con alcance sobre la sucursal activa. Crear servicios comerciales requiere además
`inventory.manage` en esa sucursal; habilitar un servicio existente no requiere ese permiso.
Un UUID de otro workspace no revela su existencia. No hay borrado de configuraciones.

| Método y ruta relativa | Contrato |
| --- | --- |
| `GET /services` | `branchId` obligatorio; `search` por nombre (máximo 100 caracteres), `enabled` opcional, `page` ≥1 y `pageSize` 1–100 (20 inicial). Incluye deshabilitados y fuentes inactivas para poder administrarlas. |
| `GET /services/{id}` | Configuración y proyección comercial actual de su sucursal. |
| `GET /service-options` | Misma paginación y búsqueda, sin `enabled`. Solo servicios activos asignados a esa sucursal, con categoría/unidad activas y precio comercial, todavía sin configuración Carwash. |
| `GET /form-options?branchId=…` | `canCreateServices`, categorías/unidades activas cuando puede crear; `employeeCount` solo con `employee.read` en esa sucursal, de lo contrario `null`. |
| `POST /services/batch` | Entre 1 y 20 líneas; `Idempotency-Key` obligatorio (8–128 caracteres). Alta comercial y configuración se confirman juntas. Retorna 201 y `{items:[…]}`. |
| `PATCH /services/{id}` | `version`, `enabled`, `washerRate`, `supervisorRate` obligatorios. Bloqueo de fila, conflicto 409 si la versión cambió. Retorna la nueva versión. |

Ejemplo de creación mixta (sustituir UUID por identificadores reales):

```json
{
  "branchId": "UUID",
  "services": [
    {"itemId": "UUID", "washerRate": "20.00", "supervisorRate": "5.00"},
    {
      "newService": {
        "name": "Lavado premium",
        "categoryId": "UUID",
        "unitOfMeasureId": "UUID",
        "salePrice": "850.50",
        "taxRate": "18.00"
      },
      "washerRate": "25.00",
      "supervisorRate": "5.00"
    }
  ]
}
```

Cada línea contiene exactamente uno de `itemId` o `newService`. Tasas omitidas en creación
usan 20.00/5.00; rango 0–100, dos decimales y suma máxima 100.00. Cero es válido para precio,
impuesto y tasas. No se generan ventas ni movimientos monetarios en esta fase.

La respuesta de cada configuración contiene `id`, `branchId`, `itemId`, `name`, `categoryId`,
`categoryName`, `salePrice`, `taxRate`, `catalogVersion`, `enabled`, `available`,
`unavailableReason`, `washerRate`, `supervisorRate`, `version`, `createdAt`, `updatedAt`.
Montos/tasas son strings decimales; precio/impuesto pueden ser `null` si falta el perfil
comercial. `available` refleja la fuente comercial; un servicio habilitado con fuente inactiva
se muestra «No disponible». Rehabilitarlo exige corregir primero esa fuente.

Los listados devuelven `{items,page,pageSize,totalItems,totalPages}`. `service-options` devuelve
la proyección comercial sin campos de configuración. Un servicio ya configurado se edita,
no se vuelve a agregar, incluso cuando está deshabilitado.

La única fuente de nombre/precio/impuesto sigue siendo `Item`/`InventoryItemProfile`; Carwash
solo guarda vínculos, habilitación y porcentajes. El modal enlaza a Inventarios en otra pestaña
y permite recargar la fuente sin cerrar el contexto. Los cambios comerciales se reflejan en
configuración; las líneas de lavado capturan sus propios snapshots al registrarse.

La migración crea unicidad workspace/sucursal/servicio, FK compuesta hacia la asignación del
catálogo, restricciones de porcentajes y metadata inmutable del lote. Una clave repetida con
el mismo payload retorna las configuraciones actuales; con otro payload da 409. Un error en
cualquier línea revierte también los servicios comerciales creados en ese lote. Se reutiliza
`InventoryService.create_item_in_transaction`; su método público mantiene el commit existente.
Las creaciones y cambios emiten `carwash.service.create` / `carwash.service.update` en auditoría.

## Recepción y control operativo implementados

Las consultas exigen módulo efectivo, `carwash.read` y alcance sobre la sucursal. Registrar,
editar, iniciar y cancelar exigen además `carwash.wash.manage` en esa misma sucursal.
No requieren permisos de configuración ni de POS. El alta rápida utiliza el endpoint compartido
de clientes y su permiso `customer.manage`; crear servicios conserva los permisos de fase 1.

| Método y ruta relativa | Contrato |
| --- | --- |
| `GET /operation-context?branchId=…` | Capacidades de esa sucursal: `canManage`, `canCreateCustomer`, `canConfigureServices`, `canManageEmployees`, `currency`, `timezone`. |
| `GET /wash-options` | `branchId`, `kind=services\|customers\|employees\|paymentMethods`, `search`, `page`, `pageSize`. Proyecciones mínimas de datos maestros activos; los servicios requieren configuración habilitada y fuente disponible. `employees` admite lectores para filtrar; las demás opciones requieren gestionar lavados. |
| `GET /washes` | `branchId` obligatorio; `search` literal por placa/cliente/servicio capturados, `status=waiting\|washing\|cancelled`, `employeeId` en cualquiera de los dos roles, `page` 1–1.000.000 y `pageSize` 1–100 (20 por defecto). Orden por fecha de registro descendente e ID. Sin duplicar lavados por roles o líneas. |
| `GET /washes/{id}` | Cabecera y líneas capturadas. UUID ajeno al workspace retorna 404. |
| `POST /washes` | Petición inferior + `branchId`, cabecera `Idempotency-Key` de 8–128 caracteres; retorna 201. |
| `PATCH /washes/{id}` | Reemplazo de datos operativos con `version` y todos los campos obligatorios; solo `waiting`/`washing`, conflicto 409 si cambió. |
| `POST /washes/{id}/start` | `{version}`, `Idempotency-Key`; únicamente `waiting → washing`. Valida nuevamente cliente, empleados y pago previsto activos. |
| `POST /washes/{id}/cancel` | `{version,reason}`, motivo de 3–500 caracteres no vacíos, `Idempotency-Key`; `waiting`/`washing → cancelled`. No requiere reactivar maestros para poder cancelar. |

Campos operativos de creación/edición:

```json
{
  "customerId": "UUID",
  "plate": "ABC-123",
  "vehicleModel": "Toyota Corolla",
  "vehicleColor": "Azul",
  "serviceIds": ["UUID de configuración Carwash"],
  "washerId": "UUID de empleado",
  "supervisorId": "UUID de empleado",
  "paymentMethodId": null
}
```

Placa obligatoria (máximo 32 caracteres, espacios normalizados y mayúsculas); modelo/color
opcionales de 120/60 caracteres. Entre 1 y 20 servicios diferentes, cantidad uno por servicio.
Cliente y ambos empleados deben estar activos y asignados activamente a la sucursal.
Una persona puede ocupar ambos roles. El método previsto es opcional y debe estar activo en
el workspace; aún no implica cobro, evidencia, deuda ni requisito de caja abierta.

La cabecera responde con IDs/nombres capturados de cliente, responsables y método previsto,
vehículo, estado, versión, moneda/zona horaria capturadas, `subtotal`, `taxAmount`, `total`,
`createdAt`, `updatedAt`, `startedAt`, `cancelledAt`, `cancelReason` y `lines`.
Las líneas incluyen `id`, `serviceConfigId`, `itemId`, `name`, `unitPrice`, `taxRate`,
`taxAmount`, `total`, `washerRate`, `supervisorRate`, `configVersion`, `catalogVersion`.
Montos y tasas son strings decimales; timestamps se serializan en UTC. Los listados y opciones
usan `{items,page,pageSize,totalItems,totalPages}` y búsqueda de máximo 100 caracteres.

El cálculo reutiliza `pos_money.price_document` con `Decimal` y redondeo comercial, sin descuentos
en esta fase. Campos extra como `status`, precio o total en peticiones son rechazados (400).
Al editar, las líneas conservadas retienen precio, impuestos y porcentajes originales, incluso
si su configuración cambió o fue deshabilitada. Las nuevas líneas toman la fuente vigente;
retirar una línea queda registrado en la auditoría. Un lavado cancelado no se puede editar.

La creación y cada acción tienen clave/fingerprint propios, únicos por workspace y tipo de
operación. Repetir exactamente una solicitud devuelve el estado actual del mismo lavado;
reutilizar la clave con otro contenido devuelve 409. La edición utiliza bloqueo y versión:
dos ediciones con la misma versión producen un éxito y un conflicto. No hay PATCH idempotente;
si se pierde su respuesta, recargar permite revisar si se aplicó antes de volver a editar.
Auditoría `carwash.wash.create|update|start|cancel` conserva antes/después con las líneas, en la
misma transacción. Las FK compuestas validan workspace/sucursal de maestros, líneas y configuración.

No existen endpoints `/complete` o `/void` todavía. Ninguna operación de esta fase escribe en
ventas, caja, cuentas por cobrar ni comisiones. La migración no activa módulos ni borra datos.
Desactivar Carwash conserva todo; el downgrade de 0051 elimina tablas y no debe usarse para desactivar.

## Recursos por fase

Base: `/api/v1/carwash`. Concretar esquemas de petición/respuesta y nombres finales al iniciar
cada fase, sin cambiar el contrato público POS.

| Recurso | Lectura | Mutaciones explícitas | Fase |
| --- | --- | --- | --- |
| `/services` | Configuración de servicios por branchId | Crear configuración; editar tasas/habilitación con versión; alta comercial usa catálogo | 1 |
| `/washes` | Listado paginado/buscable/filtrado y `/{id}` | Crear, editar datos no financieros antes de completar; `/{id}/start`, `/{id}/cancel` con motivo | 2 |
| `/washes/{id}` | Venta vinculada y snapshots | `/complete`, `/void` con idempotencia/versión y reglas POS | 3 |
| `/commissions` | Filtros empleado/rol/estado/fechas, resumen deduplicado | Ninguna escritura directa de importe/estado | 4 |
| `/settlements` | Liquidaciones y detalle | Crear por empleado/caja/comisiones seleccionadas; `/{id}/reverse` con motivo | 4 |
| `/indicators`, `/reports` | Indicadores, evolución, servicios y empleados | Ninguna | 5 |

## Persistencia implementada y prevista

| Entidad | Relaciones e invariantes |
| --- | --- |
| Configuración de servicios | Única por workspace/sucursal/servicio del catálogo; habilitada, porcentajes [0,100], suma ≤100, versión; precio/impuesto no duplicados |
| Lavado | Workspace/sucursal, cliente, vehículo, estado, responsables, método previsto, versión, venta única opcional, timestamps, auditoría |
| Líneas del lavado | Servicio y snapshot de nombre/precio/impuesto/descuento/porcentajes/responsables; cambios de catálogo no recalculan historial |
| Comisiones | Lavado/línea/empleado/rol; base neta sin impuestos, tasa e importe capturados; única por línea/rol; dos roles pueden compartir empleado |
| Liquidación | Workspace/sucursal/empleado/caja, total, movimiento de egreso, estado, idempotencia, auditoría/motivo/reverso |
| Detalle de liquidación | Vínculo a comisión; no admitir dos liquidaciones vigentes de una comisión; resolver con restricción y bloqueo transaccional |

Completar exige caja abierta y permisos de venta. Devenga incluso con CxC pendiente, usando
snapshots del lavado. Adjuntos siguen POS con reintento independiente. Anular desde cualquier
módulo revierte coherentemente venta/devengos; liquidaciones vigentes bloquean hasta reverso.
Liquidar crea un único egreso que Finanzas ya reconoce; no generar un gasto adicional.

## Fronteras de pruebas

Fase 0 verifica acceso/registro sin negocio. Fases 1–2 añaden contratos y persistencia/aislamiento.
Fases 3–4 deben inyectar fallos y verificar rollback; dos conexiones concurrentes deben demostrar
unicidad de venta y liquidación. Fase 5 debe reconciliar listados/ventas/devengos incluyendo
límites de día local y anulaciones. Fase 6 cubre el recorrido completo y regresiones financieras.

El [plan de implementación](../CARWASH_IMPLEMENTATION_PLAN.md) contiene reglas y criterios de cierre.


## Fase 3 implementada: completar, facturar y anular

Migración `20260928_0052`: vínculo único a venta, CxC opcional, importes finales, metadatos de
finalización/anulación y devengos `carwash_commissions` por servicio/rol. Se conservan las líneas
originales del lavado. `completed` y `voided` se incorporan al filtro de estados.

Bajo `/api/v1/carwash/washes/{id}` se añaden `GET checkout-context`, `POST preview`,
`POST complete`, `POST void` y `GET billing`. Completar exige `carwash.wash.complete` + `pos.sell`;
anular exige `carwash.wash.void` + `sales.invoice.void`; todas las acciones conservan `carwash.read`
y alcance de sucursal. Precios manuales y descuentos requieren `pos.discount.override`.

`complete` acepta versión, caja, método, referencia y descuentos/precios por línea, nunca totales.
Las acciones financieras requieren `Idempotency-Key`. El bloqueo y la transacción única abarcan
lavado, POS/caja/CxC y comisiones. POS usa el snapshot capturado como precio autorizado.
`void` coordina ambos módulos incluso cuando se inicia desde POS; una liquidación vigente o cobros
aplicados a CxC bloquean hasta su reverso. Los adjuntos siguen el endpoint POS después de confirmar,
con reintento independiente. La consulta y liquidación se incorporan en la fase 4 siguiente.

Contrato detallado, pruebas, migración y entrada de fase 4:
[Carwash fase 3](../../frontend/docs/carwash-fase-3.md).

## Fase 4 implementada: consulta, liquidación y reverso

Migración `20260928_0053`: liquidaciones y detalles auditables, vínculos al egreso y reverso POS,
claves únicas y asignación única por comisión mientras la liquidación esté vigente.

Bajo `/api/v1/carwash` se añaden `GET commission-context`, `GET commissions`, `GET/POST settlements`,
`GET settlements/{id}` y `POST settlements/{id}/reverse`. La consulta requiere
`carwash.commissions.read`; las acciones exigen además `carwash.commissions.settle` o
`carwash.commissions.reverse` junto a `pos.cash.manage`, siempre con lectura Carwash y sucursal.

Una liquidación recibe hasta 100 comisiones de un empleado con sus versiones, caja, sucursal,
método de efectivo e `Idempotency-Key`. El backend calcula el total y confirma egreso, detalles,
estados y auditoría conjuntamente. El reverso exige versión, motivo y clave, y registra el
movimiento inverso; Finanzas reconoce los movimientos existentes sin gastos adicionales.
Los resúmenes de comisiones cuentan cada lavado/factura una vez, aun con múltiples roles.

Contrato completo, reglas de caja, concurrencia y pruebas:
[Carwash fase 4](../../frontend/docs/carwash-fase-4.md).

## Fase 5 implementada: indicadores y reportes

`GET /indicators?branchId=` y `GET /reports?branchId=&dateFrom=&dateTo=` consultan agregaciones
reales por sucursal; no hay migración nueva. Los reportes requieren `carwash.reports.read` más
lectura Carwash. El indicador de pendientes se oculta sin permiso de comisiones o reportes.
Mes actual de la sucursal por defecto, hasta 366 días inclusivos; se excluyen anulaciones.
Facturación incluye CxC pendiente y se cuenta una vez por lavado. Liquidaciones/reversos no
alteran el devengo del gráfico. Cada respuesta se calcula en una instantánea SQL consistente.

Contrato, topes visuales, pruebas y evidencia:
[Carwash fase 5](../../frontend/docs/carwash-fase-5.md).

## Fase 6: validación y activación

Se conserva este contrato y Alembic `20260928_0053`. El retiro del módulo mediante Backoffice
impide consultas y acciones sin eliminar configuración, lavados, ventas, devengos ni pagos.
La reactivación recupera el historial con los mismos IDs, versiones e importes. Un propietario
de otra compañía con Carwash activo tampoco puede leer ni revertir esas operaciones.

La aceptación y el piloto local están documentados en
[Carwash fase 6](../../frontend/docs/carwash-fase-6.md).

## Protección de operaciones mutables

Las rutas que crean o cambian servicios, lavados y liquidaciones aplican un límite por
workspace y membresía autenticada. En `staging` y `production` se habilita por defecto con
120 operaciones por minuto, configurable mediante
`CARWASH_MUTATION_RATE_LIMIT_PER_MINUTE`. Al excederlo, la API responde `429` con el contrato
de error público y la cabecera `Retry-After`. El control local protege cada proceso; un
despliegue con varias réplicas debe conservar además el límite distribuido del gateway.
