# Carwash — fase 3: facturación y devengo

## Entrega

El Control Operativo permite completar lavados en estado `washing`, facturarlos y anularlos.
Completar exige los permisos `carwash.read`, `carwash.wash.complete` y `pos.sell` en la sucursal,
y una caja abierta con la misma moneda. El modal conserva el estilo y los componentes de Helios:
servicios, precios registrados, descuentos autorizados, métodos POS, comprobante y total calculado
por el backend. Los botones permanecen visibles en móvil mediante un pie fijo.

Se pueden consultar los importes originales del lavado y la facturación final, con saldo real de
CxC. El detalle permite adjuntar un comprobante más tarde. Los listados distinguen pago previsto,
venta cobrada, pago en CxC y factura anulada. La liquidación de comisiones y los indicadores siguen
pendientes de las fases 4–5; la demo sigue siendo de solo lectura.

## Contrato y transacciones

- `GET /api/v1/carwash/washes/{id}/checkout-context`: versión actual, caja abierta, métodos activos
  y permisos para descuentos/comprobantes.
- `POST /washes/{id}/preview`: `version`, `discountType`/`discountValue` opcionales y
  `priceOverrides: [{washLineId, unitPrice}]`. Devuelve subtotal, descuento, impuestos y total.
- `POST /washes/{id}/complete`: mismo precio solicitado, `registerId`, `paymentMethodId`, `reference`
  opcional y cabecera `Idempotency-Key`. Devuelve el lavado y su vínculo único a venta/CxC.
- `POST /washes/{id}/void`: `version`, `reason` de 3–1000 caracteres e `Idempotency-Key`.
- `GET /washes/{id}/billing`: factura, importes finales y saldo actual de CxC; requiere lectura de
  Carwash en la sucursal. Adjuntar comprobantes conserva `pos.receivables.collect` y la API POS.

Los errores mantienen `400/401/403/404/409`. El estado financiero no puede editarse mediante PATCH.
Los decimales se envían como strings. El cliente muestra la previsualización del servidor; los
totales no se aceptan desde el navegador.

`PosService.checkout_in_transaction` y `void_sale_in_transaction` no confirman ni revierten
transacciones. Sus métodos públicos conservan el contrato y son quienes hacen commit para POS.
Carwash bloquea el lavado, valida versión y bloquea la caja antes que cliente, empleados y método
de pago, conservando el orden de POS y sus bloqueos implícitos de claves foráneas. Ejecuta POS con precios autorizados
capturados, crea las comisiones y confirma todo junto. Ante error se revierten todos los cambios.
El precio de catálogo actual y sus porcentajes no sustituyen los registrados. Un descuento o
precio manual requiere `pos.discount.override`, aunque lo solicite alguien con permiso de completar.

Cada servicio genera dos devengos, incluso si ambos roles pertenecen al mismo empleado o el importe
es cero. La base es el importe de la línea después del descuento, sin impuestos; el cálculo y la
distribución de descuentos reutilizan `pos_money` (`Decimal`, `ROUND_HALF_UP`). Un servicio gratuito
genera factura y devengos de cero, pero ningún movimiento monetario ni CxC de cero.

Los reintentos reutilizan clave y contenido, aun si cambió la versión tras el primer resultado.
Otra clave para un lavado completado produce conflicto. La clave de finalización es única dentro
del workspace; una clave usada para otro lavado produce rollback. Los comprobantes se suben
después del commit usando el endpoint POS, que deduplica por checksum. Un fallo de adjunto permite
reintentar solo el archivo; cerrar el modal no pierde la venta.

## Anulación

Ambos puntos de entrada, Carwash y POS, bloquean primero el lavado y usan
`CarwashSaleLifecycle`. Una factura de Carwash exige además `carwash.wash.void` y `sales.invoice.void`.
Se conserva la auditoría y se anulan venta, deuda pendiente o cobro en caja, lavado y devengos en
la misma transacción. Una comisión en estado `settled` bloquea hasta revertir su liquidación.
CxC parcial/pagada exige revertir previamente sus cobros mediante el flujo existente. La caja de
reverso sigue las reglas POS: original abierta o caja actual abierta de la misma sucursal.
Deshabilitar Carwash conserva todos los datos y bloquea sus operaciones, incluida la anulación
de facturas vinculadas, hasta su reactivación.

## Persistencia y migración

Migración `20260928_0052_carwash_checkout.py`, posterior a `20260928_0051`:

- Columnas de venta/CxC, finalización, importes finales, anulación e idempotencia en `carwash_washes`.
- Nuevas restricciones de estados, totales, consistencia, venta única y claves foráneas compuestas.
- `carwash_commissions`: sucursal, lavado/línea, línea de venta, empleado y nombre, rol, moneda,
  base, porcentaje, importe, devengo, estado y motivo/fecha de anulación; única por línea y rol.
- Los importes y líneas originales del lavado permanecen intactos; los descuentos finales viven
  en la factura y los devengos, con el resumen final en la cabecera del lavado.

El downgrade se rechaza si hay lavados facturados o anulados para conservar el historial. El
servidor full-stack reutiliza el reseteador existente del schema desechable, con guardas de host,
entorno y nombre de base, en vez de usar downgrade para borrar fixtures financieros.

## Verificación y evidencia

- `backend/tests/test_carwash_checkout.py`: snapshots, tasas modificadas, descuentos, impuestos,
  redondeo, persona en ambos roles, servicios gratuitos, permisos y sucursal, caja cerrada,
  referencias inactivas, claves repetidas, concurrencia entre lavados y con un checkout POS del mismo cliente/caja,
  fallo atómico, anulación por ambos puntos,
  liquidación bloqueante, CxC pendiente/parcial/pagada y reverso de cobros.
- `frontend/tests/carwashCheckout.test.jsx`: caja cerrada, descuento sin permiso, versión obsoleta,
  resultado ambiguo con clave estable y reintento independiente de comprobante.
- `frontend/e2e/full-stack/carwash.spec.js`: recorrido real desde configuración y recepción hasta
  facturación, comprobante, detalle y anulación; respuesta perdida tanto al completar como al
  adjuntar; una venta por lavado. Conserva las verificaciones de fases anteriores.
- Evidencia: `output/playwright/carwash-phase3-checkout-desktop.png`,
  `carwash-phase3-checkout-mobile.png`, `carwash-phase3-billing-mobile.png`.

Los controles de backend deben ejecutarse con `backend/.venv` activado para usar las versiones
instaladas por el proyecto, incluido el SDK de correo. `npm run prepush` comprueba Ruff, formato,
mypy, migraciones y pytest con cobertura mínima de 80 %. Ejecutar después, de forma secuencial,
`npm run test:e2e:full-stack -- carwash.spec.js` desde `frontend/`. Vitest y build no recrean la base.

## Entrada para fase 4

Consultar `CarwashCommission` con filtros por workspace/sucursal/empleado/rol/estado/fechas.
Crear liquidaciones y sus detalles con egreso de caja dentro de una transacción, extrayendo el
movimiento manual POS antes de reutilizarlo: su API pública todavía hace commit. No crear gastos
adicionales en Finanzas. Coordinar el bloqueo del lavado con la liquidación y su reverso para
evitar carreras con `CarwashSaleLifecycle`; la liquidación debe volver a validar `pending` después
del bloqueo. Contar facturas/lavados una sola vez y conservar las entradas por rol.


## Entorno local

La base persistente `erp_carwash_local` se migró a `20260928_0052` y el API se reinició con el
código actualizado. Se guardó una copia previa en
`backend/.local/carwash-local-before-phase3.dump`. Frontend en `http://localhost:3000/carwash`;
API en `http://127.0.0.1:8000`, salud `/health/ready`. Las pruebas destructivas usan exclusivamente
la base desechable; no se agregaron ventas de prueba a la base local persistente.


## Resultados de controles

- Backend: `npm run prepush` aprobado; 426 pruebas, cobertura 89,64 %, Ruff, formato, mypy y
  validación de migraciones aprobados. Sin exclusiones nuevas ni reducción del umbral de cobertura.
- Frontend: 478 pruebas Vitest en 124 archivos, build aprobado y 8 casos Playwright de navegación,
  permisos y presentación aprobados.
- Full-stack: 1 recorrido completo aprobado en escritorio y móvil; reintentos, comprobantes,
  anulación y dos ventas únicas para dos lavados facturados.
- Logs locales: `backend/.local/carwash-phase3-prepush.log` y
  `output/playwright/carwash-phase3-{vitest,build,ui,fullstack}.log`.
