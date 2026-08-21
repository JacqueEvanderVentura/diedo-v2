---
title: Coverage Matrix
status: active
tags: [evidence, coverage]
---

# Coverage matrix

Audit date: 2026-08-20. The matrix records route behavior under the provided manager account. An
`Observed` route was rendered and read without submitting actions. `Redirected` means the requested
route returned to the dashboard. `Empty` rendered no usable domain content. `Unverified` was found
in the client bundle but not opened because it required an identifier, public token, elevated role,
or represented an unsafe account flow.

Coverage summary: **77 direct route checks** (`50 Observed`, `23 Redirected`, `4 Empty`), **10 blank
forms inspected without submission**, and **28 additional bundle-only routes classified as
Unverified**.

## Observed

| Domain | Routes |
|---|---|
| Authentication/dashboard | `/login`, `/` |
| POS | `/pos`, `/pos/caja`, `/pos/cuentas-por-cobrar` |
| CRM | `/crm`, `/crm/clientes`, `/crm/pipeline`, `/crm/oportunidades-seguimiento`, `/crm/cotizaciones`, `/crm/compras-cliente`, `/crm/ventas`, `/crm/reporte-consolidado`, `/crm/vendedores` |
| Appointments | `/agenda`, `/agenda/gestion`, `/configuracion/agenda` |
| HR | `/rrhh`, `/rrhh/directorio`, `/rrhh/solicitudes`, `/rrhh/cuentas-por-cobrar`, `/rrhh/documentos`, `/configuracion/nomina` |
| Finance | `/finanzas`, `/finanzas/gastos`, `/finanzas/gastos-fijos`, `/finanzas/pasivos`, `/finanzas/cuentas`, `/finanzas/ingresos`, `/configuracion/presupuestos`, `/configuracion/metodos-pago` |
| Catalog/inventory | `/inventarios`, `/configuracion/items`, `/configuracion/categorias` |
| Incidents/commissions | `/incidencias`, `/comisiones`, `/comisiones/config` |
| Reports | `/reportes/generales`, `/reportes/membresias`, `/reportes/agenda`, `/reportes/inventario`, `/reportes/saas` |
| Carwash | `/carwash` |
| Administration | `/configuracion`, `/configuracion/usuarios`, `/configuracion/sucursales`, `/configuracion/permisos`, `/configuracion/documentos-crm`, `/configuracion/region`, `/configuracion/seguridad`, `/configuracion/templates`, `/configuracion/whatsapp` |

Blank forms were inspected without submission for quotes, employees, incidents, fixed expenses,
financial accounts, manual income, catalog items, users, branches, and carwash work orders.

## Redirected

| Domain | Routes |
|---|---|
| HR | `/rrhh/nomina`, `/rrhh/performance` |
| Finance/reports | `/finanzas/presupuestos`, `/finanzas/reportes`, `/reportes/dividendos`, `/reportes/personal` |
| Work management | `/compras`, `/proyectos`, `/proyectos/tareas`, `/doway`, `/okr` |
| Optional verticals | `/contabilidad`, `/restaurant`, `/estetica-clinica`, `/vehiculos`, `/vehiculos/inventario`, `/vehiculos/cotizaciones`, `/personalizacion` |
| Documents/payments | `/documentos-plantillas`, `/payments`, `/payments/settings`, `/payments/subscriptions`, `/payments/transactions` |

## Empty

| Domain | Routes |
|---|---|
| HR/reports | `/rrhh/incidentes`, `/reportes` |
| Configuration/subscription | `/configuracion/facturacion`, `/subscriptions` |

## Unverified bundle routes

| Domain | Routes |
|---|---|
| Public/account | `/register`, `/forgot-password`, `/legal`, `/evaluacion-publica/:token`, `/pay/:subscriptionId` |
| CRM compatibility | `/customers` |
| Project detail | `/proyectos/detalle/:id` |
| Accounting | `/contabilidad/asientos`, `/contabilidad/asientos/nuevo`, `/contabilidad/auditoria`, `/contabilidad/cierre-fiscal`, `/contabilidad/conciliacion`, `/contabilidad/config`, `/contabilidad/cuentas-por-cobrar`, `/contabilidad/cuentas-por-pagar`, `/contabilidad/diarios`, `/contabilidad/impuestos`, `/contabilidad/periodos`, `/contabilidad/plan-contable`, `/contabilidad/reportes` |
| Aesthetics | `/estetica-clinica/config-formularios`, `/estetica-clinica/evaluacion/:pacienteId/:formularioId`, `/estetica-clinica/paciente/:id` |
| Vehicle sales | `/vehiculos/cotizaciones/:id` |
| Templates | `/templates/fill/:id`, `/configuracion/templates/fill/:id` |
| Platform administration | `/super-admin`, `/super-admin/tenants/:tenantId` |

Firebase Identity Toolkit paths found in the bundle are external authentication APIs, not product UI
routes, and are outside this functional matrix.
