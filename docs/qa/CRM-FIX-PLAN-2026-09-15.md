# Plan de corrección de CRM — para revisión

**Estado: propuesto, sin implementación.** Basado en la [auditoría local del 15/09/2026](C:/Users/jeanp/Code/erp-back/docs/qa/CRM-AUDIT-2026-09-15.md), commit `540e6cf`.

## Objetivo de salida

Un usuario debe poder completar su trabajo autorizado de CRM desde una sesión nueva, con datos completos, importes consistentes y dependencias disponibles. Las acciones fuera de alcance deben rechazarse en servidor y explicarse correctamente en interfaz.

**Regla ya acordada:** vendedor ve todos los clientes y oportunidades de sus sucursales; la asignación personal no limita esa visibilidad.

Se propone implementar los siguientes bloques en orden. La estimación de esfuerzo se hará al aprobar las decisiones de alcance; no se fija una fecha de producción con bloqueos aún abiertos.

## A. Autorización y roles de empresas nuevas

**Hallazgos:** CRM-01, CRM-02; parte de CRM-09/13.

### Cambios propuestos

- Definir permiso global explícito para administrar scoring, o aprobar un diseño de reglas por sucursal. La propuesta inicial es conservar scoring global y restringir su administración a un grant global.
- Aplicar verificación de alcance antes de recalcular y registrar auditoría de cambios.
- Inventariar cada acción CRM con sus permisos de CRM, clientes, catálogo, sucursales, agenda y venta.
- Consolidar plantillas de roles de provisión y fixtures. Otorgar únicamente dependencias requeridas por las capacidades comerciales aprobadas.
- Preparar migración o conciliación para empresas ya creadas: diferenciar roles estándar sin personalizar de roles personalizados; producir un diff de permisos para revisión.
- Revisar que múltiples roles/scopes no amplíen un permiso de forma accidental.
- Evitar cargas de módulos para los que no existe permiso o vínculo de empleado.

**No asumir:** que gerente/supervisor deben tener todas las capacidades de facturación, anulación o cobro. La matriz comercial final debe indicar esas excepciones.

### Aceptación

- [ ] Vendedor de Este obtiene todos los registros de Este, incluidos los asignados a otra persona, y ninguno de Centro/Norte/Sede Principal.
- [ ] Vendedor Centro+Este ve ambas sucursales sin necesidad de cambiar de usuario.
- [ ] Filtro, ID directo, altas y modificaciones fuera de alcance se rechazan sin cambios persistidos.
- [ ] Cambiar scoring con alcance de sucursal no altera registros ni versiones fuera de alcance.
- [ ] Cada rol recién provisionado completa sus recorridos autorizados con permisos de dependencias presentes.
- [ ] Usuario suspendido no inicia sesión; un permiso revocado deja de permitir la acción conforme al contrato de sesión.
- [ ] Empresa A no accede a datos de B por IDs o relaciones cruzadas.
- [ ] Roles personalizados conservan sus decisiones explícitas tras la conciliación.

**Pruebas:** integración API de scopes y provisión, más navegador real con usuarios recién creados. Repetir matriz de roles después de cualquier cambio de permisos.

## B. Integridad de cotización, factura y cierre comercial

**Hallazgos:** CRM-03, CRM-08, CRM-11.

### Cambios propuestos

- Centralizar el cálculo monetario autorizado en backend: líneas, descuentos, impuesto, redondeo y total.
- Preservar condiciones de cotización al facturar; si un cambio de precio requiere confirmación, mostrarlo antes de emitir.
- Alinear formulario y PDF con subtotal, descuentos, impuestos y total final.
- Separar primera facturación de cierre de una oportunidad con factura existente.
- Modelar la asociación oportunidad → cotización → venta y recuperar esa relación antes de habilitar acciones.
- Definir una transición consistente para reintentos, doble clic y errores entre emisión de venta y actualización de oportunidad.
- Resolver el requisito de caja del cierre con vendedor: evitar depender de lectura de cajas si el contrato comercial permite facturar sin ese permiso.

### Aceptación

- [ ] Servicio RD$ 900 con descuento 10 % e impuesto 18 % mantiene total **RD$ 955.80** en cotización, factura y saldo.
- [ ] Descuento fijo, múltiples líneas, cantidades fraccionarias y centavos conservan importes.
- [ ] Un total mostrado como final incluye los impuestos aplicables.
- [ ] Stock insuficiente impide emitir y no deja efectos parciales.
- [ ] Factura a crédito crea una sola cuenta por cobrar del importe correcto.
- [ ] Cobros parcial y completo conservan saldo; sobrepago se rechaza.
- [ ] Arrastrar a Cerrado una oportunidad ya facturada reutiliza su venta; no intenta facturar otra vez.
- [ ] Doble clic/reintento no duplica venta, movimiento de inventario ni cuenta por cobrar.
- [ ] Recuperación tras fallo de red no deja un usuario obligado a adivinar si la factura se emitió.
- [ ] Facturar desde Cotizaciones y desde Pipeline cumple el mismo contrato de permisos e importes.
- [ ] PDF descargado e impresión previa muestran documento, cliente, sucursal, líneas e importes correctos.

**Pruebas:** API transaccional e idempotencia, flujo real UI de producto con stock y servicio, factura directa y por pipeline, lectura posterior de inventario/CxC.

## C. Consistencia de estado y recorridos entre submódulos

**Hallazgos:** CRM-04, CRM-05, CRM-12.

### Cambios propuestos

- Tras crear oportunidad desde lead, actualizar estado y versión del lead desde respuesta autoritativa.
- Eliminar efectos de escritura repetidos de las hidrataciones, o hacer explícito e idempotente el proceso automático aprobado.
- Cargar resumen y relaciones por cliente/oportunidad de forma independiente del historial de navegación.
- Diferenciar “cargando”, “sin datos”, “sin permiso” y “falló la carga”.
- Mantener enlaces directos hasta resolver entidad y permisos; soportar registros fuera de la primera página.
- Actualizar o invalidar datos relacionados después de convertir, vender, cobrar, crear tarea y agendar.

### Aceptación

- [ ] Nuevo lead → Convertir funciona inmediatamente, sin recargar y sin 409 causado por el propio flujo.
- [ ] Dos pestañas y carga concurrente no crean oportunidades duplicadas ni ocultan conflictos.
- [ ] Cliente con una compra de RD$ 2,100.40 muestra ese total al abrir directamente su ficha.
- [ ] Historial de compras, cotizaciones, oportunidades, tareas y citas coincide al entrar directamente o después de visitar otros módulos.
- [ ] Pipeline encuentra la cotización vinculada desde una sesión nueva.
- [ ] `/crm/clientes?customerId=...` abre el registro o explica ausencia/denegación; no descarta silenciosamente el parámetro.
- [ ] Regresar con botón Atrás, recargar y abrir en otra pestaña conserva resultados persistidos.
- [ ] Una sesión nueva no depende de datos residuales de otra cuenta.

**Pruebas:** navegador con contextos limpios, recorrido inverso entre módulos, revalidación por API y conflictos de versión deliberados.

## D. Volumen y fechas

**Hallazgos:** CRM-06, CRM-07.

### Cambios propuestos

- Introducir paginación/búsqueda/filtros/orden de servidor en listas CRM.
- Evitar que indicadores del overview o ficha se calculen sobre una página parcial.
- Consultar detalles por ID y selectores con búsqueda remota donde corresponda.
- Normalizar fechas de calendario y timestamps como tipos con semántica diferente.
- Definir zona horaria para citas y presentación de instantes; mantener la fecha de calendario sin conversión UTC.

### Aceptación

- [ ] Con 206 leads, la UI permite acceder a los 206 y buscar el registro fuera de la primera página.
- [ ] Casos 0, 1, 200, 201 y 1,000 en leads; superar el límite también en oportunidades, actividades, clientes, cotizaciones y ventas.
- [ ] Filtro por sucursal, búsqueda y orden se aplican al conjunto completo autorizado.
- [ ] Métricas mantienen el mismo total al cambiar tamaño/página del listado.
- [ ] Cita `2026-09-15` a las 14:00 se muestra el 15 en agenda y ficha CRM.
- [ ] Fechas cercanas a medianoche y cambio de mes/año conservan la regla de calendario.
- [ ] Validación en zonas UTC negativas y positivas.

**Pruebas:** fixtures voluminosos locales, API paginada, navegador y casos de fechas. Separar esta regresión funcional de una futura prueba de carga sostenida.

## E. Interfaz por rol y manejo de errores

**Hallazgos:** CRM-09, CRM-10, CRM-13; observaciones de contexto.

### Cambios propuestos

- Declarar permisos por ruta y acción, compartidos por menú, botones y formularios.
- Presentar 403 como acceso denegado, no como listado vacío.
- Deshabilitar o no mostrar acciones no autorizadas antes de que el usuario complete formularios.
- Esperar resultado de guardado; notificar éxito solo después de confirmación.
- Revertir cambios optimistas ante error y mantener los datos introducidos cuando sea posible.
- Conservar sucursal/cliente/oportunidad al abrir modales entre submódulos.
- Preparar estados de disponibilidad de agenda que expliquen ausencia de horarios.

### Aceptación

- [ ] Cajero sin CRM no recibe una pantalla que simula CRM vacío con botones funcionales.
- [ ] Supervisor sin permiso para cotizar entiende la restricción antes de llenar el formulario.
- [ ] Guardar criterios con 403/409/500 o red interrumpida nunca muestra éxito falso.
- [ ] Cambiar pesos correctamente actualiza scores y confirma el resultado real.
- [ ] Peticiones de cajas o RRHH solo ocurren cuando aplican al usuario.
- [ ] Modales conservan el contexto comercial y no seleccionan una sucursal incompatible por defecto.
- [ ] Revisión visual de escritorio y móvil de los recorridos modificados.

## F. Regresión final y autorización de salida

### Suite mínima por recorrido

| Recorrido | Perfiles / variantes | Evidencia requerida |
| --- | --- | --- |
| Login y sesión | Admin, gerente, supervisor, cajero, vendedor, suspendido | Inicio, rechazo, recarga, cierre/cambio de sesión |
| Visibilidad | Una sucursal, varias, otro asignado, otra empresa | Lista, búsqueda, ID directo y mutación |
| Alta CRM | Lead manual/importado, duplicado, conversión, conflicto | UI + estado/versiones persistidos |
| Pipeline | Crear, mover, perder, cerrar; con/sin factura existente | Transición, venta única, motivo/fecha |
| Cotización | Borrador, enviada, aceptada, rechazada, vencida | Permisos, stock, importes, PDF |
| Venta y cobro | Servicio/producto, tarjeta/local, crédito, parcial/completo | Venta, inventario, CxC y saldos |
| Cliente 360 | Entrada directa y tras otros módulos | Historial completo y métricas |
| Seguimiento | Independiente y vinculado, completar/reabrir | Asociación, responsable, fecha |
| Agenda | Horarios válidos/no disponibles, cambio de sucursal | Cita almacenada y presentación idéntica |
| IAM | Empresa nueva y roles personalizados | Asignaciones persistentes, dependencia correcta |
| Volumen y móvil | Más de 200 registros; pantallas pequeñas | Búsqueda completa y controles utilizables |

### Trabajo de tests

- Convertir los fallos reproducidos en regresiones que fallen antes del fix y pasen después.
- Añadir una suite CRM E2E que recorra navegador → API → persistencia con fixtures aislados.
- Corregir la expectativa desactualizada `categoryKind` del test IAM y repetir sus tres casos.
- Repetir los 316 tests frontend y los 35 backend seleccionados, ampliando solo donde los cambios lo requieran.
- Repetir permisos tanto con seed como con empresa recién provisionada.
- Guardar capturas, trazas y respuestas relevantes sin credenciales reales.

### Criterios para proponer producción

- [ ] Los ocho hallazgos P1 están corregidos y su regresión pasa.
- [ ] P2 resueltos o aceptados expresamente con alcance y mitigación.
- [ ] Matriz final de roles aprobada y aplicada sin afectar personalizaciones.
- [ ] Recorridos en sesión limpia pasan para cada perfil autorizado.
- [ ] Totales cotización/factura/inventario/CxC concilian.
- [ ] No hay errores HTTP inesperados ni éxitos falsos en recorridos críticos.
- [ ] Se revisaron PDF y rutas móviles que utilizará el cliente.
- [ ] Se documentaron migración, verificación posterior y reversión de los cambios.
- [ ] Se validaron en un entorno apropiado las integraciones externas necesarias; esta auditoría local no las certifica.
- [ ] El usuario revisa evidencias y decide la salida.

## Decisiones pendientes para la revisión del plan

1. **Scoring global:** propuesta de edición solo por permiso global explícito; vendedores y roles de sucursal mantienen lectura.
2. **Cierre comercial:** decidir si facturar cierra automáticamente o habilita cierre manual vinculado a la venta existente.
3. **Ciclo de cliente:** definir en qué evento prospecto pasa a cliente.
4. **Supervisor y gerente:** confirmar capacidades de cotizar, facturar, cobrar y anular, además de lectura CRM.
5. **Tareas:** definir quién puede asignar a otro usuario y con qué alcance.
6. **Valor de oportunidad:** confirmar si se estima por score, se introduce manualmente o se deriva de cotizaciones.
7. **Contexto de cita:** propuesta de preferir la sucursal del cliente cuando sea única y permitir selección cuando haya varias.

La visibilidad del vendedor por sucursales ya está resuelta y no requiere nueva confirmación. La implementación de este plan queda pendiente de la revisión solicitada por el usuario.

