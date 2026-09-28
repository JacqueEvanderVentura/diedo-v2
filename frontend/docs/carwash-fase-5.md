# Carwash — fase 5: indicadores, gráficos y reportes

## Entrega

Los cuatro indicadores consultan datos reales de la sucursal. La pestaña Reportes conserva
los tres paneles de la referencia: evolución diaria de facturación y comisiones por rol con
líneas, distribución de servicios con dona y ranking de empleados con barras horizontales
apiladas por rol. Recharts reutiliza los componentes y estilos de Helios. Los detalles diarios
y por empleado se pueden desplegar como tablas en escritorio o tarjetas `ResponsiveList` en móvil.

El período compartido comienza en el mes calendario actual de la sucursal. Se conserva en
`dateFrom`/`dateTo` de la URL junto a `tab=reportes` y `branchId`. Editar las fechas no consulta
hasta pulsar «Aplicar período»; «Mes actual» solicita nuevamente el período local al backend.
El período de los gráficos no cambia los indicadores de hoy ni el saldo pendiente histórico.

## Contrato

Base `/api/v1/carwash`; ambas consultas son de solo lectura y devuelven `Cache-Control: no-store`.
JSON camelCase, dinero como strings decimales con dos posiciones; el backend calcula todos los
importes. El frontend convierte a número únicamente las coordenadas de los gráficos.

| Recurso | Parámetros / respuesta |
| --- | --- |
| `GET /indicators` | `branchId` obligatorio. `branchId`, `currency`, `timezone`, `today`, `generatedAt`, `activeWashes`, `completedToday`, `billedToday`, `pendingCommissions`. |
| `GET /reports` | `branchId` obligatorio; `dateFrom`/`dateTo` opcionales, fechas ISO inclusivas. Por defecto primer/último día del mes local actual. Rango máximo 366 días. Devuelve metadatos y `totals`, `daily`, `services`, `employees`. |

`totals`: `washes`, `billed`, `washerCommissions`, `supervisorCommissions`, `commissions`,
`serviceCount`, `employeeCount`. `daily` contiene cada día del período, incluidos días sin
actividad: `date`, `washes`, `billed`, `washerCommissions`, `supervisorCommissions`.

`services`: `itemId`, nombre capturado más reciente y `count`. Devuelve los nueve servicios
más solicitados y «Otros servicios» (`itemId=null`) para el resto, conservando el total de
servicios realizados. Cuenta líneas de lavados completados, también gratuitas, una vez por
servicio y lavado. No cuenta una segunda vez por el rol de quien recibe la comisión.

`employees`: los diez primeros por importe descendente, con `employeeId`, nombre capturado más
reciente, `washes` únicos, comisiones de cada rol y `commissions` total. Los empates se resuelven
por ID. Los resúmenes generales incluyen todos los empleados, aunque el ranking muestre diez.

## Cálculos y permisos

- Activos: lavados `waiting` o `washing`, sin límite de fecha.
- Completados hoy y Facturado hoy: lavados vigentes `completed`, por `completedAt` en el día
  local de la sucursal. Facturación final después de descuentos y con impuestos; incluye CxC
  pendiente. No representa ingresos cobrados de Finanzas.
- Comisiones pendientes: importe de devengos `pending` de lavados completados, de todo el historial.
- Gráficos: lavados completados dentro del período local; comisiones devengadas `pending` y
  `settled`, por fecha de finalización, después de descuentos y sin impuestos. Liquidar o
  revertir una liquidación no cambia el devengo histórico; anular el lavado lo excluye.
- Cada consulta agregada usa una sentencia SQL para obtener una instantánea consistente.
  Ventas, líneas y comisiones se agregan independientemente, evitando multiplicar ventas al
  cruzar varios servicios o ambos roles. Los totales usan `Decimal` y redondeo POS.
- Las fechas filtran desde medianoche local inclusiva hasta medianoche siguiente exclusiva;
  incluyen correctamente días de 23/25 horas donde aplica horario de verano.
- Indicadores requieren `carwash.read`; el importe pendiente solo se revela con
  `carwash.commissions.read` o `carwash.reports.read` en esa misma sucursal. En otro caso es
  `null` y la interfaz muestra «Sin permiso». Reportes requieren `carwash.read` y
  `carwash.reports.read`. Módulo, workspace, sucursal activa y alcance se verifican en backend.
- Fechas inválidas/rango invertido o excesivo: 400; sesión ausente: 401; permisos insuficientes:
  403; sucursal inexistente, inactiva o ajena al workspace: 404, sujeto al alcance del usuario.

## Actualización, migración y operación local

Actualización cada 15 segundos mientras la página está visible y al recuperar visibilidad.
Las acciones operativas y de liquidación también refrescan los indicadores inmediatamente.
Los errores de red mantienen la última consulta con su período original y aviso de datos
desactualizados; 401/403/404 eliminan la copia. Nunca se sustituyen errores con datos demo.
La demo utiliza únicamente fixtures sintéticos separados de la API.

No hay migración nueva: se consulta el esquema de fase 4, Alembic `20260928_0053`.
No se activan módulos ni workspaces. El entorno local usa `erp_carwash_local` y los controles
automatizados usan exclusivamente `erp_test`; los procesos que recrean esta última base se
ejecutan secuencialmente.

## Verificación y evidencia

- Backend: `tests/test_carwash_reports.py` cubre varios servicios/ambos roles, descuentos,
  facturación igual en varios lavados, liquidación/reverso/anulación, crédito pendiente,
  gratuitos, permisos, sucursales, fechas locales, año bisiesto, horario de verano,
  límites del ranking y agrupación de servicios. Control completo: `npm run prepush`.
- Frontend: `tests/carwashReports.test.jsx` cubre período en URL, restablecer el mes,
  corrección de filtros inválidos, pérdida de conexión/permisos, indicadores y demo aislada.
  Ejecutar Vitest y build.
- Playwright: `e2e/carwash.spec.js` comprueba demo/protecciones en escritorio/móvil;
  `e2e/full-stack/carwash.spec.js` concilia reportes reales después de completar, anular,
  liquidar y revertir, prueba período vacío, recarga, recuperación y gráficos móviles.
- Logs locales: `backend/.local/carwash-phase5-prepush.log` y
  `output/playwright/carwash-phase5-{vitest,build,ui,fullstack}.log`.
- Capturas locales: `output/playwright/carwash-phase5-reports-desktop.png` y
  `output/playwright/carwash-phase5-reports-mobile.png`, con capturas adicionales
  `carwash-phase5-ranking-desktop.png`, `carwash-phase5-services-mobile.png` y
  `carwash-phase5-ranking-mobile.png` para los paneles fuera del primer viewport.

Los fixtures de reportes limpian exclusivamente sus lavados/liquidaciones sintéticos antes
de los casos de downgrade. El caso HTTP de CRM crea una sucursal propia para abrir caja sin
depender de qué sucursal activa devuelva primero PostgreSQL en la base compartida de pruebas.

Resultado final (2026-09-28): `npm run prepush` backend aprobado, 441 pruebas y 89,80 % de
cobertura, sin exclusiones nuevas; 489 pruebas Vitest, build, 8 casos Playwright de interfaz
y 1 recorrido full-stack aprobados. Capturas de los tres paneles revisadas en escritorio y
móvil, incluidos campos de fecha legibles a 390 px. Localhost conserva `erp_carwash_local`,
con frontend en 3000, API en 8000 y estado de base/esquema `ready`.

## Entrada para fase 6

Comparar las cuatro pestañas con las capturas de Diedo y recorrer estados completos con
fixtures. Ampliar regresiones POS, Caja, CxC, clientes, empleados y Finanzas; comprobar alcance
de todos los perfiles antes de activar un workspace piloto mediante módulos/suscripciones.
Deshabilitar acceso debe conservar historial. La activación piloto queda para esa fase.
