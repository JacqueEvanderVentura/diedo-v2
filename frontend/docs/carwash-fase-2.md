# Carwash — fase 2: recepción y control operativo

La página `/carwash?tab=operativo&branchId=…` trabaja con API y PostgreSQL reales. Permite
registrar vehículos con cliente, placa, varios servicios, lavador, encargado y método de pago
previsto. Se puede editar, iniciar o cancelar con motivo. Completar permanece deshabilitado
hasta fase 3. Los cuatro indicadores y reportes conectados esperan la fase 5 y muestran «—».

## Interfaz y alcance

- Tabla de referencia en escritorio y tarjetas `ResponsiveList` en móvil: fecha/hora local,
  cliente/vehículo, servicios, responsables, importe/pago previsto, estado y acciones.
- Búsqueda por placa/cliente/servicio, estado y cualquiera de los dos roles; paginación de 20.
  `search`, `washStatus`, `employeeId`, `washPage`, `branchId` y `tab` permanecen en la URL.
- Opciones consultadas con búsqueda y paginación en servidor; no se descarga todo el directorio.
  Solo ofrece clientes/empleados activos asignados a la sucursal y servicios expresamente habilitados.
- Alta rápida reutiliza `CustomerFormModal` y el directorio real, respetando `customer.manage`.
  Volver al lavado conserva placa, vehículo, servicios y responsables. Configuración y empleados
  abren otra pestaña; «Actualizar» recarga opciones sin cerrar el formulario.
- El pie del formulario permanece visible y el contenido se desplaza en pantallas pequeñas.
  El mismo empleado puede ocupar ambos roles; pago previsto no es cobro.
- Se consulta cada 15 segundos y al volver a la pestaña visible. No se consulta periódicamente
  mientras el documento está oculto ni cuando otra pestaña del módulo desmontó Control Operativo.
  Respuestas tardías de otra sucursal/identidad se descartan.
- Un fallo de API conserva la última copia en solo lectura. Una denegación elimina los datos.
  Reintentos de creación/inicio/cancelación conservan clave y payload tras respuesta ambigua.
  La edición tiene versión; ante conflicto permite recargar y revisar el registro vigente.
- Demo conserva sus fixtures de solo lectura; no se mezclan con API ni simulan guardados.

## Persistencia y reglas

La migración `20260928_0051` añade `carwash_washes` y `carwash_wash_lines`. No cambia activación
de módulos. Se aplica con `alembic upgrade head`; desactivar el módulo conserva sus registros.
El downgrade elimina estas tablas y no es una forma de desactivación.

Cabecera captura responsables, cliente, método previsto, moneda y zona horaria; líneas capturan
nombre, precio, impuesto, porcentajes y versiones de catálogo/configuración. Editar metadatos
conserva los valores de las líneas existentes; añadir servicios captura la configuración actual.
Todo importe se calcula en backend con Decimal y redondeo POS. No hay descuentos en esta fase.
Auditoría antes/después preserva el historial de ediciones y cancelaciones.

Contrato completo y permisos: [CARWASH_API.md](../../docs/backend/CARWASH_API.md).
Código principal: `ConnectedOperationsPanel`, `WashFormModal`, `WashActionModal`, `WashLookup`
y los módulos backend `carwash_operations` de router/schema/repository/service/model.

## Validación y evidencia

Pruebas API: `backend/tests/test_carwash_operations.py`. Cubren idempotencia/concurrencia,
versiones, precios históricos, impuestos/redondeo, servicios gratis, ambos roles en una persona,
maestros inactivos/ajenos a sucursal, permisos, rollback, auditoría y ausencia de efectos financieros.
Pruebas frontend: `frontend/tests/carwashOperations.test.jsx`, incluyendo polling visible,
respuestas tardías, solo lectura y reintentos con la misma solicitud.

El recorrido `frontend/e2e/full-stack/carwash.spec.js` amplía fase 1: cliente rápido, varios
servicios, respuesta de creación perdida seguida de reintento, persistencia tras recarga,
edición, inicio, cancelación, detalle y fallo de lectura. Verifica escritorio y móvil.
Evidencias reproducibles ignoradas por Git en `output/playwright/`:

- `carwash-phase2-reception-desktop.png`
- `carwash-phase2-operational-desktop.png`
- `carwash-phase2-reception-mobile.png`
- `carwash-phase2-operational-mobile.png`

Las suites que recrean `erp_test` se ejecutan secuencialmente. La base local de prueba manual
`erp_carwash_local` es independiente y no se reinicia para ejecutar pruebas.

Resultados del 27 de septiembre de 2026:

| Control | Resultado |
| --- | --- |
| Backend `npm run prepush` | Ruff, formato, mypy, upgrade/check y reset descartable aprobados; **415 pruebas**, **89,50 %** de cobertura, umbral 80 % sin exclusiones nuevas. |
| Frontend `npm test` | **474 pruebas** en 123 archivos; los 5 casos operativos se repitieron tras los últimos ajustes. |
| Frontend `npm run build` | Aprobado; mantiene advertencias previas de CRM/imports mixtos y tamaño de bundle. |
| UI `carwash.spec.js` | **8 casos** aprobados: demo, permisos, errores, escritorio y móvil. |
| Full-stack `carwash.spec.js` | **1 recorrido** aprobado con navegador/API/PostgreSQL reales, configuración y recepción completas. |
| Localhost | Login, permisos, formulario, acceso a configuración y `/health/ready` verificados contra `erp_carwash_local`, revisión 0051. |

Logs: `backend/.local/carwash-phase2-prepush.log`, `output/playwright/carwash-phase2-*.log`.
El servicio operativo alcanzó 96 % en la corrida completa. Se reforzaron después dos casos:
una barrera fuerza ambas lecturas previas a la creación concurrente; un fallo de restricción
inyectado verifica rollback/409, además del error inesperado/500 y la longitud de placa normalizada.
El resultado de esa comprobación adicional queda en `backend/.local/carwash-phase2-concurrency.log`.
Ambos casos aprobaron; la cobertura acumulada quedó en **89,53 %**.

## Prueba manual local

Frontend: `http://localhost:3000/carwash?tab=operativo`; API: `http://127.0.0.1:8000`.
La base local conserva los datos previos y se migró a `20260928_0051`; respaldo previo en
`backend/.local/carwash-local-before-phase2.dump` (ignorado por Git). API y frontend siguen
ejecutándose con los lanzadores locales existentes. El endpoint `/health/ready` confirma
esquema compatible. En Sede Principal inicialmente no hay servicios habilitados para Carwash:

1. En Configuración Rápida, habilitar un servicio del catálogo o crear uno con precio y tasas.
2. Volver a Control Operativo, pulsar Nuevo Servicio y seleccionar o crear el cliente.
3. Completar placa, servicios, lavador y encargado; registrar, editar e iniciar.
4. Cancelar con un motivo y consultar el detalle conservado. Completar está deshabilitado.

## Punto de entrada para fase 3

Extraer checkout POS a una operación interna sin commit y mantener el contrato público actual.
Ampliar estados/checks de `carwash_washes` para `completed`/`voided`, vínculo único a venta y
devengos por línea/rol. Exigir caja/permisos POS al completar, respetar los precios capturados
como fuente autorizada y confirmar venta/caja o CxC/lavado/devengos en una única transacción.
Los roles están capturados en cabecera y cada servicio aporta ambos porcentajes; no duplicar
facturación si una persona ocupa los dos roles. Implementar descuentos, idempotencia de
finalización y anulación coordinada desde ambos módulos; no habilitar el botón antes de ello.
