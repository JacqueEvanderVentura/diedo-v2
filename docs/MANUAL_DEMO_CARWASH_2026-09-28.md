# Manual de demostración y pruebas — Carwash

Fecha de preparación: 28 de septiembre de 2026  
Workspace: **Local ERP Workspace**  
Sucursal preparada: **Sede Principal**

## Estado preparado para la demostración

El módulo Carwash está activo y visible para la cuenta administradora del workspace.

### Servicios configurados

| Servicio | Precio sin impuestos | ITBIS | Comisión lavador | Comisión encargado |
|---|---:|---:|---:|---:|
| Lavado Básico Demo | RD$500.00 | 18% | 20% | 5% |
| Lavado Premium Demo | RD$900.00 | 18% | 22% | 6% |
| Limpieza Interior Demo | RD$650.00 | 18% | 20% | 5% |
| Lavado de Motor Demo | RD$750.00 | 18% | 25% | 7% |

### Casos creados

1. **Cliente Demo Carwash Uno**
   - Vehículo: `DEMO-A01`, Toyota Corolla 2023, blanco.
   - Servicios: Lavado Premium Demo y Limpieza Interior Demo.
   - Estado: **Completado**.
   - Factura: `VTA-00000046`.
   - Pago: efectivo, cobrado.
   - Total: **RD$1,829.00**.
   - Lavador: Leonedis Hamburgo.
   - Encargado: Especialista Cosmetologa.

2. **Cliente Demo Carwash Dos**
   - Vehículo: `DEMO-B02`, Jeep Grand Cherokee 2022, negro.
   - Servicios: Lavado Básico Demo y Lavado de Motor Demo.
   - Estado: **En espera**.
   - Pago previsto: cuenta por cobrar.
   - Total estimado: **RD$1,475.00**.
   - Lavador: QA Agenda 20260916000001.
   - Encargado: Leonedis Hamburgo.

### Indicadores verificados

- 1 lavado completado durante el día.
- RD$1,829.00 facturados.
- RD$414.50 de comisiones pendientes.
- Caja de Sede Principal abierta con fondo inicial RD$0.00.
- Caja con 1 venta y efectivo esperado de RD$1,829.00.
- Reportes con dos servicios realizados y ranking de dos empleados.

## Guion recomendado para grabar el video

### 1. Presentación del módulo

1. Inicia sesión con la cuenta administradora de Local ERP Workspace.
2. Abre **Carwash** desde el menú lateral.
3. Explica los cuatro bloques principales:
   - Control Operativo.
   - Comisiones Lavador / Encargado.
   - Gráficos & Reportes.
   - Configuración Rápida.
4. Muestra los indicadores superiores de operación, ventas y comisiones.

### 2. Configuración de servicios

1. Entra en **Configuración Rápida**.
2. Muestra los cuatro servicios demo, sus precios, ITBIS y porcentajes de comisión.
3. Abre la edición de uno de ellos para enseñar los campos disponibles, pero cancela si no deseas alterar la data preparada.
4. Explica que los cambios de comisión no recalculan lavados históricos.

### 3. Recepción de un vehículo

1. Regresa a **Control Operativo**.
2. Pulsa **Nuevo Servicio**.
3. Selecciona un cliente existente o usa **Crear cliente rápido**.
4. Introduce placa, marca/modelo y color.
5. Añade uno o varios servicios.
6. Selecciona lavador, encargado y método de pago previsto.
7. Registra el lavado.

Este paso solamente crea la recepción: no genera venta ni cobro.

### 4. Flujo operativo

1. Localiza el vehículo con el buscador o filtro de estado.
2. Muestra **Ver detalle** y **Editar**.
3. Pulsa **Iniciar** para moverlo de `En espera` a `Lavando`.
4. Explica que un lavado no puede completarse antes de iniciarse.
5. Usa el caso `DEMO-B02` si deseas continuar el flujo preparado.

### 5. Completar y facturar

1. Verifica que la caja de Sede Principal esté abierta.
2. En el lavado iniciado, pulsa **Completar**.
3. Revisa los precios autorizados, impuestos y descuento.
4. Selecciona el método de pago.
5. Confirma **Completar y facturar**.
6. Muestra el número de factura, el total y el cambio de estado a `Completado`.

Para demostrar una cuenta por cobrar, selecciona **Cuenta por cobrar** como pago final. Esto genera la venta, deja el importe pendiente y mantiene las comisiones devengadas.

### 6. Comisiones

1. Abre **Comisiones Lavador / Encargado**.
2. Filtra por empleado, rol, estado y fechas.
3. Muestra que cada servicio genera una comisión para el lavador y otra para el encargado.
4. En la factura `VTA-00000046` se generaron:
   - Leonedis Hamburgo: RD$198.00 + RD$130.00.
   - Especialista Cosmetologa: RD$54.00 + RD$32.50.
5. Selecciona comisiones pendientes para mostrar la acción **Liquidar selección**.

La liquidación y su reverso cambian el estado financiero de las comisiones. Para una grabación repetible, realiza estas acciones únicamente si deseas dejar ese historial como parte de la demo.

### 7. Reportes

1. Abre **Gráficos & Reportes**.
2. Selecciona el mes actual.
3. Muestra:
   - Historial de ventas frente a comisiones.
   - Servicios más solicitados.
   - Ranking de empleados por comisiones.
4. Expande **Ver detalle diario** y **Ver importes por empleado**.
5. Prueba un intervalo personalizado y luego restaura **Mes actual**.

### 8. Caja y trazabilidad

1. Abre **Terminal POS > Caja**.
2. Selecciona Sede Principal.
3. Muestra la venta de Cliente Demo Carwash Uno por RD$1,829.00.
4. Explica la distribución por método de pago y el efectivo esperado.
5. No cierres la caja durante la grabación si todavía crearás más ventas.

### 9. Anulación coordinada

Desde un lavado completado puede probarse **Anular**. El sistema debe coordinar la anulación del lavado y la venta asociada para no dejar estados inconsistentes.

Esta acción modifica la factura y las comisiones. Para conservar el escenario preparado, úsala al final de la grabación o crea antes un lavado adicional exclusivamente para anular.

## Lista rápida de validación

- Carwash aparece en el menú y abre sin redirecciones.
- El cambio de sucursal refresca la información.
- Los servicios muestran precio, impuesto y comisiones correctos.
- Es posible crear y seleccionar clientes rápidamente.
- Una placa y sus datos aparecen en el listado.
- Se pueden añadir varios servicios al mismo lavado.
- Los responsables se guardan correctamente.
- `En espera` solo permite iniciar, editar o cancelar.
- `Lavando` permite completar.
- Completar genera factura y actualiza la caja.
- Cuenta por cobrar deja saldo pendiente.
- Las comisiones se separan por empleado y rol.
- Los reportes respetan el período seleccionado.
- Los filtros y paginación conservan resultados coherentes.
- El diseño sigue siendo usable en móvil o ventana estrecha.

## Recomendación para repetir la demo

Usa nombres, placas y correos con el prefijo `Demo` para distinguirlos de información real. Antes de cada nueva grabación, conserva al menos un caso `En espera`, uno `Lavando` y uno `Completado`; así puedes enseñar el flujo completo sin reconstruir todo desde cero.
