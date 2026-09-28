# Carwash — entrega de fase 0

Registro histórico de fase 0, cerrada con los controles siguientes aprobados. La configuración
conectada se incorpora en [fase 1](carwash-fase-1.md); no se ha activado Carwash en clientes reales.

## Qué se entrega

Ruta `/carwash` dentro de Helios con cuatro pestañas, selección de sucursal, indicadores,
tablas/filtros, paneles de reportes y formularios de vista previa. Conserva la composición
inspeccionada en Diedo. Se utilizan `Card`, `Button`, `Input`, `Select`, `Modal` y
`ResponsiveList`, sin añadir dependencias ni otro framework de UI.

El alcance es **visual y de acceso**. Configuración persistente, recepción, cobro, comisiones
y gráficos con datos reales pertenecen a las fases 1–5. No hay llamadas a una API Carwash
inexistente ni botones que simulen guardar. El modo conectado muestra «Carwash está en
preparación» e indicadores `—`, diferenciados de un cero real.

## Activación y permisos

Carwash se registra como módulo opcional con dependencias directas `pos` y `hr`; POS mantiene
sus propias dependencias. No se habilita en planes ni workspaces por defecto. Ruta, navegación
y pestañas requieren módulo/permisos efectivos de la sesión. Una URL con sucursal no visible
se normaliza a una autorizada; una pestaña sin permiso vuelve a Operativo. Esto no sustituye
la autorización backend que se incorporará a cada endpoint posterior.

Los administradores reciben los nuevos permisos según el patrón existente, pero necesitan
activación del módulo para entrar. La migración es `20260928_0049_carwash_foundation.py`.
Detalles: [contrato del backend](../../docs/backend/CARWASH_API.md).

## URL y demo

| Parámetro | Uso |
| --- | --- |
| `tab` | `operativo`, `comisiones`, `reportes`, `configuracion` |
| `branchId` | Sucursal autorizada, sincronizada con el alcance activo |
| `search` | Búsqueda de placa, cliente o servicio |
| `washStatus` | `waiting`, `washing`, `completed`, `cancelled`; omitido significa todos |
| `employeeId` | Responsable en Operativo o beneficiario en Comisiones |
| `commissionStatus` | `pending`, `paid`; omitido significa todos |
| `dateFrom`, `dateTo` | Fechas compartidas entre Comisiones y Reportes |
| `example=empty` | Solo demo: escenario vacío |

Pestaña/filtros sobreviven recarga y navegación atrás/adelante. El campo de búsqueda usa
replace para no llenar el historial con cada tecla. Cambiar sucursal limpia el empleado.

Los fixtures se encuentran en `src/modules/carwash/data/preview.js`, con IDs `cw-demo-*`,
clientes/placas ficticios y fecha fija 2026-09-28 anunciada en pantalla. Solo se devuelven cuando
la sesión es explícitamente `demo`, el escenario tiene ejemplos y la sucursal es `charm-dn`.
No se escriben en stores compartidos, catálogo, clientes, empleados ni PostgreSQL. No son
fuente financiera: los cálculos numéricos del navegador solo dibujan ejemplos en DOP.

Con `VITE_DEMO_SEED_ENABLED=true`, el modo demo usa la política existente del proyecto cuando
la API no está disponible. Para reproducción determinista usar `e2e/carwash.spec.js`, que
habilita ese entorno y aísla la API. No habilitar demo en entornos operativos.

El ejemplo completado tiene dos servicios y la misma persona en ambos roles. Se muestran
cuatro entradas de comisión, pero un solo lavado y RD$944 de facturación. El historial no se
persiste todavía. Los modales son de lectura, con guardar deshabilitado y restauración del foco.

## Evidencia visual

`npx playwright test e2e/carwash.spec.js` regenera las capturas bajo `output/playwright` en la
raíz del repositorio (directorio ignorado por Git). Se comprueban las cuatro pestañas a 1440 ×
1000 y 390 × 844, ausencia de desbordamiento de la página, permisos y pie accesible del modal.

| Pantalla | Escritorio | Móvil |
| --- | --- | --- |
| Operativo | `carwash-phase0-operativo-1440.png` | `carwash-phase0-operativo-390.png`, `carwash-phase0-operativo-mobile-content.png` |
| Comisiones | `carwash-phase0-comisiones-1440.png` | `carwash-phase0-comisiones-390.png`, `carwash-phase0-comisiones-mobile-content.png` |
| Reportes | `carwash-phase0-reportes-1440.png` | `carwash-phase0-reportes-390.png`, `carwash-phase0-reportes-mobile-content.png` |
| Configuración | `carwash-phase0-configuracion-1440.png` | `carwash-phase0-configuracion-390.png`, `carwash-phase0-configuracion-mobile-content.png` |
| Registro visual | `carwash-phase0-modal-1440.png` | `carwash-phase0-modal-390.png` |

Las capturas de referencia originales tienen prefijo `carwash-` sin `phase0`. Los contenedores
de reportes conservan los estados vacíos, porque no había datos gráficos en la referencia.
En móvil se usan tarjetas y pestañas desplazables; el contenido del modal tiene scroll propio
y las acciones permanecen visibles. Playwright espera a que termine la animación del modal.

## Validación de esta entrega

- `npm test`: 121 archivos, 465 pruebas aprobadas.
- `npm run build`: aprobado; permanecen avisos existentes de chunks/importaciones y atributos
  `disabled` duplicados en `PipelinePage.jsx`, fuera de Carwash.
- `npx playwright test e2e/carwash.spec.js`: 8 casos aprobados; demo, URL, móvil/escritorio,
  acceso por módulo/dependencias/permisos, pestañas y modo conectado sin escrituras.
- `pytest tests/test_carwash_foundation.py -q`: 3 casos aprobados en PostgreSQL 18.6 real.
- `npm run prepush` desde `backend/`: aprobado, 383 pruebas y cobertura global de 89,23 % (mínimo 80 %),
  Ruff, formato, mypy, `alembic upgrade head` y `alembic check` satisfactorios. Se actualizaron
  los conteos de IAM de 63 a 72 por los nueve permisos nuevos, sin excluir código de cobertura.
- `npm run test:e2e:full-stack -- carwash.spec.js`: 1 caso aprobado con FastAPI/PostgreSQL reales.
  Crea una compañía de prueba, verifica el acceso bloqueado inicialmente, activa desde
  Backoffice, recorre las pestañas con el propietario y revoca el acceso. No simula respuestas
  de API ni genera operaciones Carwash/POS.

Docker Desktop presentó un error de arranque local. Las pruebas backend utilizan un cluster
PostgreSQL 18.6 temporal en `backend/.local/carwash-pg18`, escuchando únicamente en localhost,
con base desechable `erp_test`: puerto 55434 para prepush y después 5434 para respetar el guard
del harness full-stack. No se modifica la instalación PostgreSQL habitual ni bases operativas.
Prepush y full-stack se ejecutan secuencialmente porque recrean el esquema.
El cluster temporal se detiene al concluir. Logs locales ignorados por Git:
`backend/.local/carwash-prepush-final.log`, `carwash-ui-e2e.log` y `carwash-full-stack.log`.

## Siguiente entrega

Continuar con **fase 1: configuración rápida funcional**, únicamente cuando se cierre el gate
de fase 0. Revisar [el plan](../../docs/CARWASH_IMPLEMENTATION_PLAN.md), el contrato Carwash y el
catálogo existente. Reemplazar configuración demo con API/modelo por sucursal, validar tasas,
usar precio/impuesto comercial y añadir creación múltiple en un modal. Las otras pestañas
permanecen pendientes. No implementar checkout ni liquidaciones en esa tarea.
