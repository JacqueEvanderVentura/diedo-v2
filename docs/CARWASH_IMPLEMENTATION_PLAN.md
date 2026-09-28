# Carwash para Helios 360

## Alcance y secuencia

La entrega actual corresponde a la **fase 6**, validación completa y piloto local. Integra
las fases 0–5: configuración, recepción, facturación POS/CxC, comisiones, liquidaciones,
reversos e indicadores. El estado vigente y la evidencia se documentan en
[la entrega de fase 6](../frontend/docs/carwash-fase-6.md).

Fase 0 validada: 383 pruebas backend (89,23 % de cobertura), 465 frontend, build, 8 casos de UI
y 1 recorrido full-stack de activación/revocación aprobados. La evidencia actual y el punto de
entrada para fase 2 están en [la entrega de fase 1](../frontend/docs/carwash-fase-1.md).
Fase 1 validada: 398 pruebas backend (89,35 %), 469 frontend, build, 8 casos de UI y
1 recorrido full-stack aprobados. El módulo conserva activación explícita por workspace.
La entrega y el punto de entrada a fase 3 están en [fase 2](../frontend/docs/carwash-fase-2.md).
Fase 2 validada: 415 pruebas backend (89,50 %), 474 frontend, build, 8 casos de UI y
1 recorrido full-stack aprobados. La base local fue migrada sin reiniciar sus datos.

Referencia visual: [Diedo Carwash](https://app.diedoapp.com/carwash). La inspección cubrió las
cuatro pestañas, alta de lavado, cliente rápido, alta/edición de servicio y móvil. La referencia
no tenía lavados ni comisiones; sus reglas financieras no pudieron verificarse. Las reglas de
este documento son decisiones aprobadas para Helios. Se conserva la composición de Diedo
dentro del layout de Helios, con sus componentes, tipografía, colores y navegación.

Capturas originales locales, ignoradas por Git: `output/playwright/carwash-operativo.png`,
`carwash-comisiones.png`, `carwash-reportes.png`, `carwash-configuracion-desktop.png`.
La evidencia reproducible y el resultado de los controles están en
[la entrega de fase 0](../frontend/docs/carwash-fase-0.md).

## Matriz de pantallas y acciones

Todas requieren el módulo efectivo `carwash`, sus dependencias y `carwash.read`. La sucursal
debe pertenecer al workspace y estar dentro del alcance del usuario, también en el backend.

| Pantalla | Composición conservada | Acciones y permisos adicionales | Estado actual |
| --- | --- | --- | --- |
| Control Operativo | Sucursal, cuatro indicadores, búsqueda, estado, empleado, tabla | Recepción/edición/inicio/cancelación: `carwash.wash.manage`; completar: `carwash.wash.complete` + POS; anular: `carwash.wash.void` + POS | API real: recepción, edición, inicio, cancelación, finalización POS y anulación coordinada; filtros/paginación URL; indicadores reales por sucursal |
| Comisiones | Empleado/estado/fechas, cuatro resúmenes, detalle por servicio y rol | Consultar: `carwash.commissions.read`; pagar: `carwash.commissions.settle` + Caja; revertir: `carwash.commissions.reverse` + Caja | Consulta real, liquidación en Caja y reverso auditado |
| Gráficos y Reportes | Ventas/comisiones, servicios populares y ranking | `carwash.reports.read` | Agregaciones backend por período local, líneas, dona y ranking; detalles y estados vacíos |
| Configuración Rápida | Servicio, categoría, precio, porcentajes, estado y edición modal | `carwash.settings.manage`; crear en catálogo exige `inventory.manage` | API real, alta múltiple, habilitación y edición; demo de solo lectura |

| Estado futuro de lavado | Acciones admitidas | Efecto financiero |
| --- | --- | --- |
| `waiting` / En espera | Editar, iniciar, cancelar con motivo | Ninguno; pago es solo previsión |
| `washing` / Lavando | Editar, completar, cancelar con motivo | Ninguno hasta completar |
| `completed` / Completado | Consultar, anular coordinadamente | Venta, cobro o CxC, comisiones devengadas |
| `cancelled` / Cancelado | Consultar historial | Ninguno |
| `voided` / Anulado | Consultar auditoría | Venta y comisiones revertidas; antes revertir liquidaciones vigentes |

## Reglas aprobadas

- Cliente registrado obligatorio, alta rápida en el directorio compartido. Placa obligatoria;
  marca/modelo y color opcionales, propios del lavado en esta versión.
- Uno o varios servicios del catálogo, habilitados expresamente para Carwash por sucursal.
  No crear un catálogo ni un precio paralelo. Impuestos, precio comercial y disponibilidad
  vienen de las fuentes actuales de Helios.
- Lavador y encargado son empleados existentes de la sucursal. Una persona puede ocupar ambos
  roles; cada servicio devenga dos entradas independientes de comisión.
- Capturar precio, impuesto, porcentajes y responsables al registrar/editar el lavado. Cambiar
  el catálogo/configuración no recalcula lavados existentes. Completar usa ese snapshot; una
  sustitución manual sigue exigiendo el permiso correspondiente de POS.
- Devengar al completar aunque exista saldo en CxC. Base por servicio: importe después de
  descuentos y antes de impuestos. `Decimal` y redondeo comercial del POS; autoridad backend.
- Una transacción confirma lavado, venta única, caja/CxC y comisiones. Idempotencia, bloqueo y
  versión protegen doble clic, reintento y edición concurrente. Adjuntos reintentables sin
  repetir la venta.
- Liquidar pendientes de un empleado mediante un egreso en una caja abierta de la misma
  sucursal. Finanzas proyecta ese movimiento existente, sin crear un segundo gasto.
- Liquidación, detalles y egreso son atómicos. Su reverso exige motivo y movimiento inverso,
  según reglas vigentes de Caja. No borrar historial ni pagar una comisión dos veces.
- Anular desde Carwash o POS coordina venta y comisiones. Si hay liquidaciones vigentes,
  revertirlas primero. No permitir saltarse el flujo con `PATCH status`.
- Moneda del workspace, fechas según zona horaria de la sucursal, persistencia UTC. Resúmenes
  cuentan una sola vez cada lavado/venta y excluyen anulaciones vigentes.

## Entregas independientes

| Fase | Implementación | Criterio de cierre |
| --- | --- | --- |
| 0 — Base visual y contrato | `/carwash`, cuatro pestañas, URL, permisos, navegación, módulo opcional, fixtures locales; operaciones conectadas no disponibles | Escritorio/móvil y protección comprobados; ninguna activación automática; controles del repositorio satisfactorios |
| 1 — Configuración | Modelo/API por servicio y sucursal, habilitar/deshabilitar, edición y alta múltiple en modal; 20 %/5 % iniciales, cada tasa 0–100 y suma ≤100; accesos a datos faltantes con retorno al contexto | Persistencia y aislamiento reales; cambios no alteran historial |
| 2 — Recepción | Lavados/líneas, cliente y vehículo, servicios y responsables; cliente rápido, tabla/filtros/paginación, edición, inicio y cancelación; polling solo con pestaña visible | API real y aislamiento; sin finanzas y completar deshabilitado |
| 3 — Finalización | Modal POS, descuentos autorizados, caja abierta, cobro/evidencia o CxC; extraer operación interna POS sin commit propio; mantener contrato público; finalizar/anular atómicamente | Doble ejecución produce una venta y comisiones únicas; rollback completo ante fallo |
| 4 — Comisiones | Consulta y cuatro resúmenes, liquidación seleccionada por empleado, egreso único, reverso auditado | Comisión/caja/Finanzas concilian con reintentos y reversos; sin duplicación |
| 5 — Reportes | Indicadores reales, mes actual inicial, período compartido, agregación backend; líneas temporales, dona de servicios, barras horizontales por empleado | Totales coinciden con ventas/listados; fechas locales, sucursal, permisos, cero registros |
| 6 — Validación/piloto | Comparación visual, fixtures completos, móvil, regresiones POS/Caja/CxC/directorios/Finanzas; piloto con módulos/suscripciones existentes | Recorrido completo sin duplicaciones; desactivar conserva datos |

Las formas de gráficos son decisiones de Helios porque Diedo solo mostraba estados vacíos.
Se usa «Facturado hoy» para distinguir ventas de ingresos reconocidos en Finanzas.

## Integración y punto de entrada siguiente

Frontend: React/Vite JS/JSX, Zustand, Tailwind/SCSS, UI existente y Recharts. No añadir framework
de UI. Tablas de escritorio y `ResponsiveList` en móvil; pestañas desplazables y pie del modal
visible. La carpeta del módulo es `frontend/src/modules/carwash`.

Backend: FastAPI, SQLAlchemy, PostgreSQL y Alembic. La fase 0 registra permisos/módulo en
`local_bootstrap.py` y migración `20260928_0049`. No crea tablas ni rutas financieras nuevas.
Contrato previsto: [CARWASH_API.md](backend/CARWASH_API.md).

La fase 1 incorpora `CarwashServiceConfig`, migración `20260928_0050`, router/servicio/repositorio
y configuración conectada. La siguiente tarea es la fase 2: crear lavados y líneas con snapshots
de precio, impuesto y tasas, utilizando solamente servicios habilitados cuya fuente comercial
esté disponible. La consulta operativa necesitará `carwash.wash.manage`, sin exigir el permiso
de configuración a recepcionistas. Completar debe seguir deshabilitado hasta fase 3.

La fase 3 extrajo `PosService.checkout_in_transaction` y `void_sale_in_transaction`;
los métodos públicos conservan sus commits. Para fase 4 revisar `PosService.create_manual_movement`:
no envolver métodos con commit en una transacción externa suponiendo que son atómicos.

## Controles por fase

- Backend: `npm run prepush`, cobertura mínima 80 % sin exclusiones nuevas; PostgreSQL real.
- Frontend: Vitest, build, Playwright escritorio/móvil y full-stack pertinente.
- Suites que recrean `erp_test` se ejecutan secuencialmente.
- Casos financieros para fases 3–6: varios servicios, persona en ambos roles, descuentos,
  impuestos/redondeo, cambios posteriores de precio/tasa, servicios gratuitos sin movimientos
  de cero, caja cerrada, método deshabilitado, fuera de sucursal, permisos insuficientes,
  doble clic/reintento/concurrencia/fallo transaccional, CxC pendiente/parcial/pagada y reversos.
- No mostrar ejemplos ni simular escrituras exitosas ante fallo de API. En fases conectadas con
  consulta implementada, conservar datos anteriores solo en lectura y mostrar error/reintento.

Fuera de la primera versión: reservas, membresías, pagos bancarios de comisiones, nómina,
portal del lavador y consumo automático de insumos. No activar workspaces reales en fases 0–1.


## Entrega de fase 3

Implementada la finalización atómica con POS, cobro/CxC, devengos por línea/rol y anulación
coordinada desde Carwash y POS. La recepción conserva los snapshots y la facturación los usa
como origen autorizado. Se extrajeron las operaciones internas de checkout y anulación sin
commit, manteniendo el contrato público. La siguiente entrega es fase 4: consulta y liquidación.
Véase [contrato, evidencia y handoff](../frontend/docs/carwash-fase-3.md).

## Entrega de fase 5

Implementados indicadores reales y reportes agregados por sucursal y período local, con líneas,
dona y ranking por empleado. La fase 4 de consulta/liquidación/reverso está integrada; los
gráficos concilian devengos aunque se liquiden o reviertan, sin duplicar ventas y excluyendo
anulaciones. No hay migración adicional ni activación automática. La siguiente tarea es la
fase 6, validación completa y activación piloto.
Véase [contrato, evidencia y handoff](../frontend/docs/carwash-fase-5.md).

## Entrega de fase 6

Validación de las cuatro pestañas y modales en escritorio y móvil, recuperación de conexión,
protección de formularios y conservación del historial al retirar el acceso. El recorrido
full-stack incorpora comparación de lavados, ventas, comisiones, liquidaciones y reportes
antes y después de desactivar/reactivar. La prueba de aceptación añade acceso cruzado entre
dos compañías con Carwash habilitado, incluidas acciones de liquidación y reverso.
No se añade migración: esquema `20260928_0053`. Piloto únicamente en el workspace local
seleccionado por el usuario; expansión a otras compañías mediante activación explícita.
Véase [resultados, capturas y operación del piloto](../frontend/docs/carwash-fase-6.md).
