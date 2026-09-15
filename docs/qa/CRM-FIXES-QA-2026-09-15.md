# CRM — implementación de fixes y constancia QA

**Fecha:** 15/09/2026. **Estado:** fixes implementados y regresiones locales verificadas; sin despliegue.
**Base:** rama `full-stack`, commit inicial `540e6cf`. Los cambios están en el árbol de trabajo, sin commit automático.

## Trazabilidad

Se conserva sin reescribir la [auditoría original](C:/Users/jeanp/Code/erp-back/docs/qa/CRM-AUDIT-2026-09-15.md) y el [plan original](C:/Users/jeanp/Code/erp-back/docs/qa/CRM-FIX-PLAN-2026-09-15.md). Sus conclusiones describen el estado **anterior** a estos cambios. Este documento registra implementación, regresiones y límites posteriores a la autorización del usuario.

Los artefactos iniciales y los nuevos logs/capturas están en [crm-audit](C:/Users/jeanp/Code/erp-back/output/playwright/crm-audit). Los archivos nuevos de verificación usan prefijo `fix-`; las regresiones mantenibles están en los directorios de tests del repositorio.

## Resultado por hallazgo

| ID original | Cambio implementado | Verificación posterior |
| --- | --- | --- |
| CRM-01 · scoring global | Backend exige `crm.manage` con grant de workspace antes de tocar settings/leads. UI limita edición global. | Vendedor recibe 403; test verifica rechazo antes de consultas/escrituras; E2E comprueba botón deshabilitado. |
| CRM-02 · roles provisionados | Plantillas compartidas agregan lectura de clientes, catálogo, inventario, sucursales y workspace. Roles con gestión CRM reciben gestión de cliente para conversión. Capacidades comerciales existentes se conservan. | Provisión real en integración; cinco roles locales revisados; vendedor nuevo convierte con 200. |
| CRM-03 · descuento perdido | Factura copia tipo/valor del descuento y notas. Repetición con misma clave de idempotencia recupera la venta original. | Caso exacto RD$ 955.80 → RD$ 955.80; replay 201 con mismo ID. Tests de descuento porcentual y fijo. |
| CRM-04 · versión obsoleta | Crear oportunidad refresca el lead desde API, incluida su versión y estado. Lecturas de leads/pipeline ya no crean oportunidades automáticamente. | E2E crea lead por UI y lo convierte inmediatamente sin recargar; test del store verifica versión actualizada. |
| CRM-05 · historial parcial | Clientes carga ventas, cotizaciones, oportunidades y tareas; pipeline carga cotizaciones y métodos de pago. Se cargan sus dependencias de catálogo. | Ficha directa en contexto limpio coincide con gasto persistido; cierre directo encuentra cotización. |
| CRM-06 · límite 200 | Se recorren todas las páginas del contrato API, conservando filtros de alcance y deduplicando IDs. Clientes maestros utiliza su máximo permitido de 100 por página. | Tests con 0/1/200/201/206/1,000 registros; E2E busca el primer lead de un lote de 205, fuera de la primera página. |
| CRM-07 · día anterior | Fechas YYYY-MM-DD se formatean como calendario, sin conversión UTC. | Casos de fechas en zonas negativas/positivas; cita existente muestra **15 sep 2026 · 14:00** en navegador. |
| CRM-08 · doble intento de facturar al cerrar | Pipeline prioriza factura vinculada, la recupera y cierra la oportunidad. Primera emisión usa el mismo flujo CRM de facturación, sin consultar cajas por permiso de lectura. | E2E cierra una oportunidad facturada y verifica que no hubo POST de factura/checkout; backend rechaza duplicación con clave diferente. |
| CRM-09 · acciones sin permiso / vacíos | Se declara permiso CRM de rutas; botones/formularios comerciales consultan capacidades. Carga de sección expone error/reintento y no representa un fallo como lista vacía operativa. | E2E supervisor sin creación de cotización; cajero mantiene denegación API; controles de scoring/lead/actividad/pipeline/ficha revisados. |
| CRM-10 · éxito falso | Guardado de scoring espera respuesta, propaga error y no cambia pesos locales ante rechazo. Toast solo después de éxito. | Regresión del store con rechazo y E2E de permiso global. |
| CRM-11 · “Total” sin impuesto | Se etiqueta **Subtotal** y explica que impuestos/descuentos se calculan al guardar. | Código/formulario y build verificados; no se presenta ese subtotal como importe final. |
| CRM-12 · enlace directo perdido | El parámetro del cliente se conserva mientras carga; se resuelve con datos disponibles y se informa ausencia/acceso. Ficha sigue la entidad actualizada. | E2E abre directamente `?customerId=...` y comprueba nombre e importe. |
| CRM-13 · cargas inaplicables | Cajas se consulta con `pos.cash.read`. Sesión incluye ID del empleado propio; RRHH personal se carga únicamente cuando existe ese vínculo. | E2E vendedor sin 403 de cajas ni 404 de solicitudes personales en el recorrido probado. |

### Correcciones relacionadas surgidas durante la regresión

- **Ventas anuladas:** al comparar ficha con API se detectó que se incluían en el gasto frontend. Ahora se excluyen de total/contador y permanecen identificadas como “Anulada” en historial. Las versiones de ventas CRM prevalecen sobre copias anteriores del store POS.
- **Cita desde cliente:** se pasa su sucursal al formulario para mantener contexto.
- **Sesión y carga:** una respuesta de sección CRM pendiente se descarta si se limpió el contexto de sesión durante la petición.
- **Fixtures IAM:** se corrigió el campo esperado `categoryKind: "product"`. Categorías y correos de prueba ahora usan nombres únicos para poder repetir la suite sin colisionar con registros de ejecuciones anteriores.

## Resultados finales de pruebas

| Batería | Resultado | Evidencia |
| --- | --- | --- |
| Frontend Vitest | **87 archivos / 329 tests aprobados** | [Log](C:/Users/jeanp/Code/erp-back/output/playwright/crm-audit/fix-frontend-final.log) |
| Backend seleccionado | **46 tests aprobados**, base de pruebas limpia | [Log](C:/Users/jeanp/Code/erp-back/output/playwright/crm-audit/fix-backend-final.log) |
| CRM E2E | **6 casos aprobados** | [Ejecución CRM + IAM](C:/Users/jeanp/Code/erp-back/output/playwright/crm-audit/fix-e2e-final.log) |
| IAM E2E | **3 casos aprobados** en su última ejecución | [Log final IAM](C:/Users/jeanp/Code/erp-back/output/playwright/crm-audit/fix-iam-final.log) |
| Roles demo API | **168 comprobaciones**, 8 usuarios; cero filas fuera del alcance en listados comprobados | [Matriz](C:/Users/jeanp/Code/erp-back/output/playwright/crm-audit/fix-role-api-matrix.json) |
| Roles nuevos | Dependencias devuelven 200 para los cinco roles; cajero conserva 403 de CRM | [Matriz final](C:/Users/jeanp/Code/erp-back/output/playwright/crm-audit/fix-new-role-final.json) |
| Conversión vendedor nuevo | 200 tras conciliación | [Primera revisión de roles](C:/Users/jeanp/Code/erp-back/output/playwright/crm-audit/fix-new-role-matrix.json) |
| Importe / replay exacto | Cotización y factura RD$ 955.80; misma venta en replay | [JSON](C:/Users/jeanp/Code/erp-back/output/playwright/crm-audit/fix-pricing-and-replay.json) |
| Fecha en navegador | 15/09/2026, 14:00, consistente con cita almacenada | [Captura](C:/Users/jeanp/Code/erp-back/output/playwright/crm-audit/fix-appointment-date.png), [snapshot](C:/Users/jeanp/Code/erp-back/output/playwright/crm-audit/fix-appointment-date.log) |
| Type checking Python | Sin errores en 158 archivos | [Mypy](C:/Users/jeanp/Code/erp-back/output/playwright/crm-audit/fix-mypy.log) |
| Compilación frontend | Build aprobado | [Build](C:/Users/jeanp/Code/erp-back/output/playwright/crm-audit/fix-build-final.log) |

Ruff pasó sobre los archivos Python modificados. `git diff --check` no detectó errores de espacios.

**Lectura de logs intermedios:** la ejecución combinada registró los seis CRM y el caso batch IAM aprobados, pero dos IAM fallaron por colisiones de fixtures existentes. Se hicieron únicos y la última ejecución IAM pasó 3/3. No se presenta ese log combinado como una ejecución única de 9/9. La primera repetición backend falló por datos de `erp_test` de corridas anteriores; se reconstruyó esa base descartable y el resultado final fue 46/46.

El build mantiene la advertencia de bundle grande. No es un fallo de compilación; no se realizó optimización de bundles dentro de estos fixes.

## Archivos principales y regresiones mantenibles

- [Servicio CRM](C:/Users/jeanp/Code/erp-back/backend/app/services/crm.py).
- [Plantillas de roles](C:/Users/jeanp/Code/erp-back/backend/app/services/role_templates.py) y [conciliación](C:/Users/jeanp/Code/erp-back/backend/app/scripts/reconcile_crm_roles.py).
- [Store CRM](C:/Users/jeanp/Code/erp-back/frontend/src/stores/crmStore.js), [paginación](C:/Users/jeanp/Code/erp-back/frontend/src/services/pagination.js) y [capacidades UI](C:/Users/jeanp/Code/erp-back/frontend/src/modules/crm/hooks/useCrmCapabilities.js).
- [Regresiones frontend](C:/Users/jeanp/Code/erp-back/frontend/tests/crmAuditRegression.test.js) y [flujo del store](C:/Users/jeanp/Code/erp-back/frontend/tests/crmStoreFlow.test.js).
- [CRM E2E](C:/Users/jeanp/Code/erp-back/frontend/e2e/full-stack/crm-audit.spec.js).
- [Tests backend CRM](C:/Users/jeanp/Code/erp-back/backend/tests/test_crm.py) y [provisión/conciliación](C:/Users/jeanp/Code/erp-back/backend/tests/test_workspace_provisioning.py).

## Conciliación de roles existentes

No se requiere una nueva migración de esquema. La provisión de empresas nuevas usa las plantillas corregidas.

Para una empresa existente se agregó una herramienta con preview por defecto:

```powershell
# Desde backend, con DATABASE_URL del entorno que corresponda:
.venv/Scripts/python.exe -m app.scripts.reconcile_crm_roles --workspace-id <UUID>
# Aplicar el diff de roles estándar:
.venv/Scripts/python.exe -m app.scripts.reconcile_crm_roles --workspace-id <UUID> --apply
```

Comportamiento:

1. Compara cada rol de sistema con la plantilla anterior y la nueva, incluyendo capacidades comerciales vigentes del gerente.
2. Un rol con diferencias de personalización se marca `customized-skipped` y queda intacto.
3. Agrega únicamente permisos faltantes de roles estándar, incrementa versión y registra entrada de auditoría.
4. Repetir sobre un rol conciliado no agrega permisos otra vez.

La protección de roles personalizados y la idempotencia tienen cobertura de integración. **No se ejecutó en producción.** En la empresa local creada para QA se conciliaron los roles y se comprobó la matriz final. El diff inicial está en [fix-role-reconciliation.json](C:/Users/jeanp/Code/erp-back/output/playwright/crm-audit/fix-role-reconciliation.json); durante la validación se añadió también `inventory.read` a esos roles locales y la matriz final refleja el resultado completo.

Antes de una salida, ejecutar el preview sobre la empresa de destino y revisar los casos personalizados con su matriz comercial. Para reversión, conservar ese diff y retirar únicamente los permisos agregados por esta operación, sin eliminar otras personalizaciones ni registros comerciales.

## Decisiones conservadas y alcance de la solución

- **Vendedor:** conserva visibilidad de todos los registros de sus sucursales, aunque estén asignados a otra persona.
- **Scoring:** global, administrable con permiso CRM global; no se creó una semántica de scoring diferente por sucursal.
- **Cierre comercial:** sigue siendo manual. Se puede cerrar con factura existente sin emitir otra.
- **Roles:** se conservaron sus capacidades comerciales previas; no se concedió cotización al supervisor por el solo hecho de que su pantalla la ofreciera.
- **Fechas:** se corrigió el tratamiento de fechas de calendario. No se cambió la política completa de zonas horarias del producto.
- **Paginación:** la solución actual consume todas las páginas y conserva filtros/orden locales. Esto elimina la omisión funcional; **no implementa todavía listas virtualizadas ni búsqueda remota por cada interacción**. Con grandes volúmenes conviene evolucionar a consultas paginadas por pantalla para limitar memoria y tiempo inicial.
- **Relaciones:** se cargan explícitamente al entrar a Cliente/Pipeline; no se introdujo un nuevo endpoint agregado de customer 360.
- Transición automática prospecto→cliente, cierre automático al facturar, nueva política de asignación de tareas y valoración de oportunidad siguen siendo decisiones funcionales separadas; no se alteraron sin una regla comercial definida.

## Entorno, efectos locales y límites

- Pruebas locales sobre frontend 3200, backend 8200 y PostgreSQL 5434.
- `crm_audit_20260915` conserva datos sintéticos y evidencia de antes/después; `erp_test` se reconstruyó para la batería descartable.
- Se crearon leads, categorías, usuarios, facturas y pagos sintéticos. Los tests IAM cambian permisos de fixtures demo; no son una certificación de la configuración personalizada del cliente.
- Los registros comerciales originales de la auditoría conservan sus IDs. Los nuevos casos añaden registros QA; las cantidades de distintos logs corresponden a momentos distintos.
- Se conservan los documentos originales como registro histórico. El archivo de resultados del primer ensayo E2E se reutilizó durante la regresión; los logs y capturas de la auditoría original enlazados en su informe siguen disponibles.
- No se enviaron correos/WhatsApp ni se ejecutaron cobros en un proveedor externo. No hubo deploy ni cambios de base productiva.
- No se certifican carga sostenida, todos los navegadores, accesibilidad completa, revisión exhaustiva de PDFs ni integraciones externas. El alcance comprobado es el de las regresiones y recorridos descritos.
- Los fixes resuelven los fallos reproducidos dentro de esta validación local. La autorización de producción requiere revisar la configuración real de roles, la conciliación aplicable y las decisiones comerciales pendientes.

## Reproducción de pruebas

Desde `frontend`: `npm test`, `npm run build`.

CRM/IAM con configuración full-stack del repositorio:

```powershell
npm run test:e2e:full-stack -- crm-audit.spec.js iam.spec.js
```

Esa configuración prepara el entorno de pruebas local. En esta auditoría se utilizó [fix.config.mjs](C:/Users/jeanp/Code/erp-back/output/playwright/crm-audit/fix.config.mjs) para apuntar a los servidores de auditoría ya levantados y a Microsoft Edge.

Desde `backend`, con `APP_ENV=test` y `DATABASE_URL` de la base **descartable** `erp_test`:

```powershell
.venv/Scripts/python.exe -m pytest tests/test_crm.py tests/test_workspace_provisioning.py tests/test_iam_api.py tests/test_phase2_master_data.py tests/test_inventory.py tests/test_pos.py tests/test_pos_quote_expiration.py tests/test_pos_quote_payment_contract.py -q
```

Los tests de integración existentes requieren aislamiento de datos; no ejecutar reconstrucción ni pruebas de mutación sobre una base operativa.

