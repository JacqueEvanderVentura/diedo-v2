# Carwash — fase 6: validación y piloto local

## Alcance de la entrega

Se conserva la composición de Diedo dentro del layout de Helios: cabecera y sucursal,
cuatro indicadores, pestañas desplazables y paneles de operación, comisiones, reportes
y configuración. Se retiró el aviso de avance de implementación del modo conectado;
la demo mantiene su identificación explícita y no permite guardar operaciones.

Los ajustes finales incluyen título compacto en la barra de navegación, fechas apiladas
por debajo de 380 px y paginación del catálogo que puede ocupar varias filas. Las tablas
amplias conservan `ResponsiveList`: tarjetas por debajo de 1100 px y tablas en escritorio.
Los campos de los modales se desplazan independientemente de las acciones inferiores.
El selector POS reutilizado admite dos columnas en el checkout Carwash por debajo de 380 px
y ajusta los nombres largos. El importe del reverso se separa de su etiqueta y puede ocupar
otra fila en pantallas pequeñas.

Configuración ahora consulta cada 15 segundos mientras la página está visible y al volver
a ella. Una pérdida de conexión conserva el borrador, bloquea sus campos y su guardado y
permite recuperarlo al reconectar. Un 401/403/404 elimina datos y cierra el formulario.
Las consultas descartan también la fecha de sincronización después de una denegación,
evitando presentar una supuesta copia anterior cuando ya se eliminó.

Si una creación de servicios recibe una respuesta incierta, se impide cerrar por botón,
Escape o fondo hasta recuperar el resultado con el mismo payload y clave de idempotencia.
No se comunica un guardado exitoso sin confirmación de la API.

## Comparación visual y evidencia

Las referencias originales están en `output/playwright/`. Solo contienen estados vacíos
para lavados, comisiones y reportes; no se atribuyen a Diedo reglas financieras inferidas.

| Pantalla | Referencia | Evidencia final | Criterios |
| --- | --- | --- | --- |
| Control Operativo | `carwash-operativo.png` | `carwash-phase6-connected-operativo-{ancho}.png` | Indicadores, filtros, cliente/vehículo, responsables, pago, estados y acciones. |
| Comisiones | `carwash-comisiones.png` | `carwash-phase6-connected-comisiones-{ancho}.png` | Filtros, cuatro resúmenes, roles separados, selección y liquidaciones/reversos. |
| Reportes | `carwash-reportes.png` | `carwash-phase6-connected-reportes-{ancho}.png` | Dos paneles superiores y ranking inferior; gráficos reales y estados vacíos. |
| Configuración | `carwash-configuracion-desktop.png` | `carwash-phase6-connected-configuracion-{ancho}.png` | Catálogo, precio/impuesto, porcentajes, estado y modal de varios servicios. |

El recorrido conectado captura 1440, 390 y 320 px; el recorrido de interfaz añade 768 px.
Los archivos con sufijo `-content.png` muestran contenido desplazado. Los archivos
`carwash-phase6-service-modal-{ancho}.png` verifican acciones visibles a 640 px de alto.
Los fixtures demo tienen capturas `carwash-phase6-{pestaña}-{ancho}.png` y los estados
financieros intermedios conservan las capturas `carwash-phase3-*` y `carwash-phase4-*`.

El piloto vacío, conectado a la API persistente, tiene capturas
`carwash-phase6-pilot-{pestaña}-{ancho}.png` a 1440 y 320 px. Se revisaron junto a las
cuatro referencias originales: se mantienen el orden, los colores de indicadores/comisiones
y las columnas principales. Las diferencias deliberadas son el layout de Helios, moneda
del workspace, «Facturado hoy», impuestos explícitos, estado de sincronización y acciones
de liquidación/reverso. La cabecera y las fechas ya no se recortan en 320 px.

## Matriz de aceptación

| Área | Pruebas |
| --- | --- |
| Configuración y recepción | `test_carwash_settings.py`, `test_carwash_operations.py`: catálogo/sucursal, cliente rápido, empleados existentes, estados y snapshots. |
| Facturación y CxC | `test_carwash_checkout.py`: descuentos/impuestos/redondeo, gratuitos, caja/métodos/permisos, pagos parciales/completos, comprobantes, reintentos y anulación coordinada. |
| Liquidaciones y Finanzas | `test_carwash_commissions.py`: ambos roles, selección/versiones, concurrencia, rollback, egreso único, reverso y conciliación sin gasto duplicado. |
| Reportes | `test_carwash_reports.py`: totales sin doble conteo, anulaciones, zonas horarias, períodos vacíos y agregaciones. |
| Activación y aislamiento | `test_carwash_acceptance.py`: desactivar/reactivar mediante Backoffice conserva configuración, lavados, ventas, comisiones y liquidaciones; otro propietario con Carwash activo no puede leer ni modificar esos recursos. |
| Interfaz | Vitest y `e2e/carwash.spec.js`: filtros/URL, permisos, estados vacíos/error, ausencia de escrituras demo y visualización a 320/390/768/1440 px. |
| Flujo integrado | `e2e/full-stack/carwash.spec.js`: configuración → cliente/empleado → recepción → POS/CxC → liquidación → reverso → reportes → desactivación/reactivación, con comparación del historial completo. |

El escenario integrado usa una compañía sintética en `erp_test`. No introduce lavados
ficticios en la base persistente del piloto. Las pruebas de migración conservan el rechazo
del downgrade con operaciones financieras registradas.

## Contrato y migraciones

No se añade una migración de datos. Se mantiene Alembic
`20260928_0053`, la API documentada en `docs/backend/CARWASH_API.md`, los permisos
`carwash.*`, las dependencias `pos` y `hr` y las autorizaciones compartidas de datos maestros.
Los montos siguen siendo strings decimales calculados por backend. Las mutaciones quedan
protegidas por un límite por membresía y devuelven `429` con `Retry-After` cuando se excede.

## Piloto y reversibilidad

Destino autorizado: `Local ERP Workspace`, slug `local-erp`, ID
`01a0e5dc-de1b-7041-9e1b-ed1048ccc044`. Frontend: `http://localhost:3000/carwash`;
API: `http://127.0.0.1:8000`; PostgreSQL local 5434, base `erp_carwash_local`.
El respaldo previo es `backend/.local/carwash-local-phase6-pilot.dump` y el estado
verificado se registra en `backend/.local/carwash-phase6-pilot.json`.

Para probar desde cero, abrir Configuración Rápida, habilitar o crear servicios en la
sucursal elegida y comprobar sus empleados en RRHH. Abrir Caja, registrar cliente/vehículo
desde Control Operativo, iniciar y completar el lavado. Después consultar/liquidar las
comisiones y revisar el mismo período en Reportes. El piloto no recibe los fixtures
financieros de las pruebas automatizadas.

La activación utiliza la compañía de Backoffice y sus módulos/suscripción existentes.
Aplicación local realizada el 2026-09-28 a las 08:59 (America/La_Paz): el workspace pasó de
versión 1 sin suscripción a versión 2 con plan local `completo` y suscripción `active`.
Se conservaron exactamente sus 16 módulos configurados, incluido Carwash. La operación usó
`PATCH /api/v1/backoffice/workspaces/{id}` con versión y lista explícita de módulos; no hubo
escrituras SQL directas. Health confirma base `ok` y esquema `20260928_0053` compatible.
No se cambian planes globales ni otras compañías. Para retirar el piloto, editar su
lista de módulos en Backoffice y desmarcar únicamente Carwash. Esto deniega sus rutas y
API y conserva el historial; volver a habilitarlo recupera las operaciones. No ejecutar
downgrades ni borrar tablas como mecanismo de desactivación. Para anular una venta
vinculada a Carwash es necesario habilitarlo y seguir su reverso coordinado.

## Controles reproducibles

Desde `backend/`, ejecutar
`npm run prepush` usando únicamente `erp_test` en `127.0.0.1:5434`. Incluye Ruff, formato,
mypy, validación de migraciones y pytest con cobertura mínima 80 % sin exclusiones nuevas.
El script detecta automáticamente `.venv`; `ERP_PYTHON` permite indicar otro intérprete.

Desde `frontend/`, ejecutar `npm test`, `npm run build`,
`npx playwright test e2e/carwash.spec.js` y `npm run test:e2e:full-stack`.
Las suites que recrean `erp_test` se ejecutan secuencialmente. Los puertos full-stack
3200/8200 están separados de localhost 3000/8000.

Logs: `backend/.local/carwash-phase6-prepush.log` y
`output/playwright/carwash-phase6-{vitest,build,ui,fullstack}.log`.

Resultados verificados el 2026-09-28: backend completo, **447 pruebas y 89,83 % de cobertura**;
Ruff, formato, mypy y migraciones aprobados. Frontend: **490 pruebas en 126 archivos**, build
aprobado y **10 casos Playwright de interfaz**. Carwash se carga bajo demanda en un chunk
separado; la advertencia de atributos `disabled` duplicados del pipeline CRM fue corregida.

La regresión amplia detectó dos esperas faltantes en pruebas existentes: la búsqueda con
debounce de CRM debe terminar antes de elegir «Convertir», y POS debe cerrar «Factura generada»
y navegar mediante el enlace Caja (el botón superior abre/cierra el turno). Se actualizaron
esos recorridos conservando sus aserciones de
conversión, venta, importes y movimientos; no se modificaron sus reglas de negocio.

**Full-stack: 19 escenarios únicos verificados.** La última ejecución conjunta aprobó
18 de 19; POS todavía ejecutó la versión de la prueba cargada antes del ajuste de navegación
(confirmado en su trace). Se repitió únicamente ese archivo desde una base limpia con
`npx playwright test --config playwright.full-stack.config.js e2e/full-stack/pos.spec.js`:
**1 de 1 aprobado**, incluida venta, Caja y CxC. Su log final es
`output/playwright/carwash-phase6-fullstack-pos.log`. Carwash y las regresiones de CRM,
RRHH, IAM, Backoffice, suscripciones, Agenda, reservas y sesión pasaron en la ejecución conjunta.

El recorrido local posterior a la activación verifica acceso del propietario y Carwash
habilitado en Backoffice; capturas `carwash-phase6-pilot-ready.png` y
`carwash-phase6-pilot-activation.png`. Se cierra la fase 6 con el piloto disponible y el
historial protegido; la siguiente operación es configurar los servicios del negocio y
dar seguimiento al uso del piloto antes de ampliar su activación.

La validación final de producción repitió el escenario full-stack exclusivo de Carwash desde
una base limpia: **1 de 1 aprobado en 2 minutos**, incluyendo configuración, recepción,
POS/CxC, comprobante, comisiones, liquidación/reverso, reportes, aislamiento y reactivación.

## Límites que se conservan

No incluye reservas, membresías, nómina, pago bancario de comisiones, portal del lavador
ni consumo automático de insumos. La expansión a otras compañías requiere su activación
explícita; el módulo continúa siendo opcional para nuevas compañías.
