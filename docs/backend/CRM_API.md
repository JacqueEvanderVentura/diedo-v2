# CRM API

El módulo CRM implementa el ciclo comercial completo sobre datos compartidos de Foundation,
Catálogo y Sales. Todos los endpoints requieren Bearer token, el entitlement `crm` y alcance de
sucursal. Las lecturas usan `crm.read`; las mutaciones usan `crm.manage`. Cotizaciones y ventas
también exigen sus permisos equivalentes de Sales para no abrir una vía lateral de acceso.

## Modelo y propiedad de los datos

- `crm_leads` conserva el prospecto, su procedencia, responsable, scoring y trazabilidad de
  conversión.
- `crm_opportunities` representa el pipeline y puede vincularse a un lead, un cliente compartido o
  ambos.
- `crm_activities` registra llamadas, correos, reuniones, notas y tareas vinculables a lead,
  oportunidad o cliente.
- `customer_crm_profiles` extiende al cliente maestro con ciclo de vida, puntos y notas. No duplica
  identidad, correo, teléfono ni asignaciones de sucursal.
- El cliente maestro distingue `person` (Consumidor/B2C) y `business` (Empresa/B2B), y se relaciona
  con una o más sucursales mediante `customer_branch_assignments`. El formulario CRM crea y edita
  esos campos a través de `/api/v1/customers`.
- `sales_quotes` sigue siendo la única fuente de cotizaciones. Las originadas en CRM llevan
  `origin=crm`, estado comercial y vínculo opcional a oportunidad.
- `sales` sigue siendo la única fuente de ventas y compras históricas por cliente.
- `crm_settings` guarda la configuración versionada de scoring por workspace.

Así, una conversión crea un `Customer` real y su perfil CRM dentro de la misma transacción. Una
cotización CRM utiliza precios, impuestos y descuentos del servicio POS/Sales; una compra aparece
al completar una venta vinculada al mismo cliente.

## Estados

| Recurso | Valores |
|---|---|
| Lead | `nuevo`, `contactado`, `calificado`, `descartado`, `convertido` |
| Oportunidad | `nuevo`, `contactado`, `propuesta`, `negociacion`, `cerrado`, `perdido` |
| Actividad | pendiente cuando `completedAt=null`; completada en otro caso |
| Cliente CRM | `activo`, `prospecto`, `inactivo` |
| Cotización CRM | `borrador`, `enviada`, `aceptada`, `rechazada`, `vencida` |

Cerrar una oportunidad establece `closedAt`; perderla exige `lostReason`. Convertir un lead lo deja
inmutable como `convertido`, enlaza el cliente creado y conserva la oportunidad existente. Las
cotizaciones enviadas que superan `validUntil` se exponen como `vencida`.

## Endpoints

Todos parten de `/api/v1/crm`.

| Método y ruta | Resultado |
|---|---|
| `GET /discovery/capabilities` | Informa si el proveedor SERP está disponible y sus límites previstos. |
| `POST /discovery/search` | Contrato futuro de búsqueda; actualmente responde `503` sin hacer llamadas externas. |
| `GET/PATCH /settings/scoring` | Consulta o actualiza pesos de scoring. |
| `GET/POST /leads` | Lista o crea leads. |
| `POST /leads/import` | Importa de 1 a 100 leads en una operación. |
| `GET/PATCH /leads/{id}` | Consulta o actualiza un lead. |
| `POST /leads/{id}/opportunity` | Crea la oportunidad única del lead. |
| `POST /leads/{id}/convert` | Convierte el lead en cliente maestro. |
| `GET/POST /opportunities` | Lista o crea oportunidades. |
| `GET/PATCH /opportunities/{id}` | Consulta o mueve una oportunidad en el pipeline. |
| `GET/POST /activities` | Lista o crea seguimientos. |
| `GET/PATCH /activities/{id}` | Consulta o actualiza un seguimiento. |
| `POST /activities/{id}/complete` | Completa el seguimiento. |
| `POST /activities/{id}/reopen` | Reabre el seguimiento. |
| `GET /customers` | Lista clientes con perfil y agregados de compras. |
| `GET /customers/{id}` | Consulta un cliente CRM. |
| `PATCH /customers/{id}/profile` | Actualiza estado, puntos o notas CRM. |
| `GET /customers/{id}/purchases` | Devuelve sus ventas completadas o anuladas. |
| `GET/POST /quotes` | Lista o crea cotizaciones de origen CRM. |
| `GET/PATCH /quotes/{id}` | Consulta o actualiza una cotización CRM. |
| `POST /quotes/{id}/cancel` | Cancela una cotización con motivo. |
| `GET /sales` | Lista ventas visibles, con filtros de cliente, estado y fecha. |
| `GET /sales/{id}` | Consulta el detalle unificado de venta. |
| `GET /state` | Snapshot agregado disponible para compatibilidad y diagnóstico. |
| `GET /overview` | Agrega KPIs de todas las fuentes anteriores. |

Las listas aceptan `branchId`, `page` y `pageSize` según corresponda. Leads permiten `status`,
`source` y `search`; oportunidades `stage`, `customerId` y `search`; actividades `type`,
`completed`, `overdue`, `opportunityId` y `customerId`; clientes `status` y `search`; cotizaciones
`customerId` y `status`; ventas `customerId`, `status`, `dateFrom` y `dateTo`.

## Concurrencia, reintentos y alcance

- Toda actualización recibe `version`; una versión obsoleta responde `409`.
- Creación de leads, oportunidades, actividades y cotizaciones, importación y conversión requieren
  `Idempotency-Key`. Repetir una solicitud idéntica devuelve el mismo resultado; reutilizar la clave
  con otro cuerpo responde `409`.
- El responsable debe ser una membresía activa del mismo workspace.
- Referencias de sucursal, lead, oportunidad, cliente, ítem y cotización se validan dentro del mismo
  workspace y del alcance efectivo del usuario.
- Los recursos fuera del alcance responden `404`, evitando revelar su existencia.
- Las respuestas operativas llevan `Cache-Control: no-store`.

## Overview

`GET /overview` fue construido como read model final, no como fuente paralela. Calcula leads totales
y calificados, conversiones del mes, oportunidades abiertas y valor del pipeline, seguimientos
pendientes/vencidos, cotizaciones CRM/aceptadas, clientes con compras y ventas/importe del mes. El
mes y la marca `generatedAt` se calculan con la zona horaria del workspace.

## Integración frontend y futura búsqueda SERP

El frontend hidrata cada ruta con su recurso específico: Leads usa `/leads`, Pipeline usa
`/opportunities`, Seguimientos usa `/activities`, Clientes usa `/customers`, Cotizaciones usa
`/quotes`, Compras y Ventas usan `/sales`, y Overview usa exclusivamente `/overview`. Las pantallas
relacionadas cargan en paralelo sus catálogos auxiliares.

La búsqueda externa mantiene la integración existente del frontend: `leadSearch` usa SerpAPI como
proveedor principal y Serper como respaldo, con selección según cuota. Las llamadas pasan por los
proxies `/api/serp` y `/api/serper` de Vite; el servidor de desarrollo agrega las credenciales y
elimina la cookie de sesión antes de salir al proveedor. Los resultados seleccionados se importan al
backend CRM asociados a una sucursal.

`CrmDiscoveryService` y los endpoints `/discovery/*` permanecen como base para una migración futura
de esa búsqueda al backend, pero no sustituyen el flujo SERP activo del frontend.

## Datos demo

La semilla `v1` agrega cinco perfiles, ocho leads, seis oportunidades y ocho seguimientos, además de
dos cotizaciones de origen CRM. Incluye dos recorridos legibles: un lead convertido con oportunidad
cerrada, cotización aceptada y venta; y otro convertido con oportunidad en propuesta y cotización
vencida. Los IDs son estables, el manifiesto valida checksums y la carga es idempotente.

La migración `20260901_0015` instala tablas, restricciones, índices, permisos, entitlement y el
backfill de perfiles para clientes existentes.
