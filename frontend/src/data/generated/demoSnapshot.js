// Generated from demo-data/v1; do not edit.
export const DEMO_SNAPSHOT = Object.freeze({
  "seedVersion": "v1",
  "schemaVersion": "20260901_0016",
  "workspaceSlug": "local-erp",
  "foundation": {
    "branches": [
      {
        "seedKey": "north",
        "code": "NORTH",
        "name": "Sucursal Norte",
        "timezone": "America/Santo_Domingo"
      },
      {
        "seedKey": "downtown",
        "code": "DOWNTOWN",
        "name": "Sucursal Centro",
        "timezone": "America/Santo_Domingo"
      },
      {
        "seedKey": "east",
        "code": "EAST",
        "name": "Sucursal Este",
        "timezone": "America/Santo_Domingo"
      }
    ]
  },
  "agenda": {
    "items": [
      {
        "seedKey": "hq-maria-morning",
        "branchCode": "HQ",
        "resourceCode": "cab1",
        "customerSeedKey": "c1",
        "serviceSeedKey": "underarm-session",
        "date": "2026-09-01",
        "time": "09:30",
        "durationMinutes": 30,
        "status": "confirmed",
        "createdAt": "2026-09-01T11:45:00Z"
      },
      {
        "seedKey": "hq-luis-noon",
        "branchCode": "HQ",
        "resourceCode": "cab2",
        "customerSeedKey": "c4",
        "serviceSeedKey": "full-body-vip-package-12",
        "date": "2026-09-01",
        "time": "12:30",
        "durationMinutes": 60,
        "status": "pending",
        "createdAt": "2026-09-01T11:55:00Z"
      },
      {
        "seedKey": "north-ana-facial",
        "branchCode": "NORTH",
        "resourceCode": "cab1",
        "customerSeedKey": "c3",
        "employeeSeedKey": "emp-4",
        "serviceSeedKey": "hydrating-facial",
        "date": "2026-09-01",
        "time": "10:00",
        "durationMinutes": 60,
        "status": "confirmed",
        "createdAt": "2026-09-01T12:10:00Z"
      },
      {
        "seedKey": "north-maria-legs",
        "branchCode": "NORTH",
        "resourceCode": "cab2",
        "customerSeedKey": "c1",
        "serviceSeedKey": "full-legs-session",
        "date": "2026-09-01",
        "time": "15:00",
        "durationMinutes": 45,
        "status": "delayed",
        "createdAt": "2026-09-01T12:20:00Z"
      },
      {
        "seedKey": "downtown-jose-followup",
        "branchCode": "DOWNTOWN",
        "resourceCode": "cab1",
        "customerSeedKey": "c2",
        "employeeSeedKey": "emp-3",
        "serviceSeedKey": "underarm-session",
        "date": "2026-09-01",
        "time": "11:00",
        "durationMinutes": 30,
        "status": "confirmed",
        "createdAt": "2026-09-01T12:30:00Z"
      },
      {
        "seedKey": "downtown-luis-vip",
        "branchCode": "DOWNTOWN",
        "resourceCode": "cab2",
        "customerSeedKey": "c4",
        "employeeSeedKey": "emp-13",
        "serviceSeedKey": "full-body-vip-package-12",
        "date": "2026-09-01",
        "time": "17:00",
        "durationMinutes": 60,
        "status": "pending",
        "createdAt": "2026-09-01T12:40:00Z"
      },
      {
        "seedKey": "east-carla-face",
        "branchCode": "EAST",
        "resourceCode": "cab1",
        "customerSeedKey": "c5",
        "employeeSeedKey": "emp-9",
        "serviceSeedKey": "face-session",
        "date": "2026-09-01",
        "time": "13:30",
        "durationMinutes": 45,
        "status": "confirmed",
        "createdAt": "2026-09-01T12:50:00Z"
      },
      {
        "seedKey": "east-luis-lip",
        "branchCode": "EAST",
        "resourceCode": "cab2",
        "customerSeedKey": "c4",
        "employeeSeedKey": "emp-6",
        "serviceSeedKey": "upper-lip-session",
        "date": "2026-09-01",
        "time": "16:00",
        "durationMinutes": 30,
        "status": "rescheduled",
        "createdAt": "2026-09-01T13:00:00Z"
      },
      {
        "seedKey": "north-ana-tomorrow",
        "branchCode": "NORTH",
        "resourceCode": "cab1",
        "customerSeedKey": "c3",
        "employeeSeedKey": "emp-4",
        "serviceSeedKey": "full-legs-session",
        "date": "2026-09-02",
        "time": "10:00",
        "durationMinutes": 60,
        "status": "confirmed",
        "createdAt": "2026-09-01T13:10:00Z"
      }
    ]
  },
  "dashboard": {
    "tasks": [
      {
        "seedKey": "hq-confirm-supplies",
        "branchCode": "HQ",
        "title": "Confirmar reposición de insumos",
        "description": "Validar cantidades recibidas contra la solicitud de compra.",
        "status": "open",
        "priority": "high",
        "dueAt": "2026-09-01T15:00:00Z",
        "assignedToName": "Paz Demo",
        "source": "operations",
        "sourceRoute": "/compras",
        "createdAt": "2026-09-01T12:05:00Z"
      },
      {
        "seedKey": "north-call-vip",
        "branchCode": "NORTH",
        "title": "Confirmar cita de cliente VIP",
        "description": "Llamar a la cliente antes de su cita de la tarde.",
        "status": "in_progress",
        "priority": "medium",
        "dueAt": "2026-09-01T17:00:00Z",
        "assignedToName": "Mar Demo",
        "source": "agenda",
        "sourceRoute": "/agenda/calendario",
        "createdAt": "2026-09-01T12:15:00Z"
      },
      {
        "seedKey": "downtown-review-leak",
        "branchCode": "DOWNTOWN",
        "title": "Dar seguimiento a fuga de agua",
        "description": "Confirmar la visita del técnico y documentar el resultado.",
        "status": "open",
        "priority": "critical",
        "dueAt": "2026-09-01T19:00:00Z",
        "assignedToName": "Sol Demo",
        "source": "operations",
        "sourceRoute": "/incidencias",
        "createdAt": "2026-09-01T12:25:00Z"
      },
      {
        "seedKey": "east-count-serum",
        "branchCode": "EAST",
        "title": "Recontar inventario de serum",
        "description": "Verificar el balance físico antes del cierre.",
        "status": "open",
        "priority": "medium",
        "dueAt": "2026-09-01T21:00:00Z",
        "assignedToName": "Rio Demo",
        "source": "inventory",
        "sourceRoute": "/inventarios",
        "createdAt": "2026-09-01T12:35:00Z"
      },
      {
        "seedKey": "hq-reconcile-transfer",
        "branchCode": "HQ",
        "title": "Conciliar transferencia pendiente",
        "status": "open",
        "priority": "high",
        "dueAt": "2026-09-02T16:00:00Z",
        "assignedToName": "Paz Demo",
        "source": "sales",
        "sourceRoute": "/pos/cuentas-por-cobrar",
        "createdAt": "2026-08-31T19:00:00Z"
      },
      {
        "seedKey": "north-order-red-bull",
        "branchCode": "NORTH",
        "title": "Solicitar reposición de Red Bull",
        "status": "open",
        "priority": "medium",
        "dueAt": "2026-09-03T14:00:00Z",
        "assignedToName": "Mar Demo",
        "source": "inventory",
        "sourceRoute": "/compras",
        "createdAt": "2026-08-31T16:00:00Z"
      },
      {
        "seedKey": "downtown-close-request",
        "branchCode": "DOWNTOWN",
        "title": "Cerrar solicitud de mantenimiento",
        "status": "in_progress",
        "priority": "medium",
        "dueAt": "2026-09-04T18:00:00Z",
        "assignedToName": "Sol Demo",
        "source": "operations",
        "sourceRoute": "/incidencias",
        "createdAt": "2026-08-30T15:00:00Z"
      },
      {
        "seedKey": "east-review-schedule",
        "branchCode": "EAST",
        "title": "Revisar agenda del fin de semana",
        "status": "open",
        "priority": "low",
        "dueAt": "2026-09-05T15:00:00Z",
        "assignedToName": "Rio Demo",
        "source": "agenda",
        "sourceRoute": "/agenda/calendario",
        "createdAt": "2026-08-29T15:00:00Z"
      },
      {
        "seedKey": "hq-monthly-stock",
        "branchCode": "HQ",
        "title": "Preparar conteo mensual de stock",
        "status": "open",
        "priority": "medium",
        "dueAt": "2026-09-12T14:00:00Z",
        "assignedToName": "Paz Demo",
        "source": "inventory",
        "sourceRoute": "/inventarios",
        "createdAt": "2026-08-28T14:00:00Z"
      },
      {
        "seedKey": "north-review-receivables",
        "branchCode": "NORTH",
        "title": "Revisar cuentas por cobrar vencidas",
        "status": "open",
        "priority": "high",
        "dueAt": "2026-09-16T16:00:00Z",
        "assignedToName": "Mar Demo",
        "source": "sales",
        "sourceRoute": "/pos/cuentas-por-cobrar",
        "createdAt": "2026-08-27T14:00:00Z"
      },
      {
        "seedKey": "downtown-train-reception",
        "branchCode": "DOWNTOWN",
        "title": "Capacitar recepción en cierres de caja",
        "status": "open",
        "priority": "medium",
        "dueAt": "2026-09-21T17:00:00Z",
        "assignedToName": "Sol Demo",
        "source": "operations",
        "sourceRoute": "/pos/caja",
        "createdAt": "2026-08-25T14:00:00Z"
      },
      {
        "seedKey": "east-update-minimums",
        "branchCode": "EAST",
        "title": "Actualizar mínimos de inventario",
        "status": "in_progress",
        "priority": "medium",
        "dueAt": "2026-09-28T15:00:00Z",
        "assignedToName": "Rio Demo",
        "source": "inventory",
        "sourceRoute": "/inventarios",
        "createdAt": "2026-08-24T14:00:00Z"
      },
      {
        "seedKey": "hq-august-kpis",
        "branchCode": "HQ",
        "title": "Validar indicadores de agosto",
        "status": "open",
        "priority": "low",
        "dueAt": "2026-08-31T20:00:00Z",
        "assignedToName": "Alex Demo",
        "source": "operations",
        "sourceRoute": "/dashboard",
        "createdAt": "2026-08-20T14:00:00Z"
      },
      {
        "seedKey": "north-audit-assets",
        "branchCode": "NORTH",
        "title": "Auditar activos en reparación",
        "status": "open",
        "priority": "high",
        "dueAt": "2026-08-20T18:00:00Z",
        "assignedToName": "Mar Demo",
        "source": "operations",
        "sourceRoute": "/inventarios/activos",
        "createdAt": "2026-08-10T14:00:00Z"
      },
      {
        "seedKey": "downtown-july-report",
        "branchCode": "DOWNTOWN",
        "title": "Revisar reporte de ventas de julio",
        "status": "open",
        "priority": "low",
        "dueAt": "2026-07-25T16:00:00Z",
        "assignedToName": "Sol Demo",
        "source": "sales",
        "sourceRoute": "/reportes/generales",
        "createdAt": "2026-07-10T14:00:00Z"
      },
      {
        "seedKey": "east-supplier-review",
        "branchCode": "EAST",
        "title": "Evaluar proveedor alterno de insumos",
        "status": "open",
        "priority": "medium",
        "dueAt": "2026-07-15T15:00:00Z",
        "assignedToName": "Rio Demo",
        "source": "operations",
        "sourceRoute": "/compras",
        "createdAt": "2026-07-01T14:00:00Z"
      },
      {
        "seedKey": "hq-completed-opening",
        "branchCode": "HQ",
        "title": "Confirmar apertura de caja",
        "status": "completed",
        "priority": "medium",
        "dueAt": "2026-09-01T12:00:00Z",
        "completedAt": "2026-09-01T12:02:00Z",
        "assignedToName": "Paz Demo",
        "source": "operations",
        "sourceRoute": "/pos/caja",
        "createdAt": "2026-09-01T11:55:00Z"
      },
      {
        "seedKey": "north-cancelled-order",
        "branchCode": "NORTH",
        "title": "Pedido duplicado de bebidas",
        "status": "cancelled",
        "priority": "low",
        "dueAt": "2026-09-02T12:00:00Z",
        "assignedToName": "Mar Demo",
        "source": "inventory",
        "sourceRoute": "/compras",
        "createdAt": "2026-08-31T12:00:00Z"
      }
    ]
  },
  "iam": {
    "rolePermissions": {
      "manager": [
        "dashboard.read",
        "workspace.read",
        "workspace.update",
        "legal_entity.read",
        "legal_entity.manage",
        "branch.read",
        "branch.manage",
        "membership.read",
        "membership.manage",
        "role.read",
        "catalog.read",
        "catalog.manage",
        "sales.read",
        "sales.quote.manage",
        "pos.read",
        "pos.sell",
        "pos.discount.override",
        "pos.register.manage",
        "pos.cash.read",
        "pos.cash.manage",
        "pos.receivables.read",
        "pos.receivables.collect",
        "pos.receivables.manage",
        "pos.void",
        "inventory.read",
        "inventory.manage",
        "inventory.move",
        "purchasing.read",
        "purchasing.suppliers.manage",
        "purchasing.requests.create",
        "purchasing.requests.review",
        "purchasing.settings.manage",
        "incidents.read",
        "incidents.create",
        "incidents.manage",
        "customer.read",
        "customer.manage",
        "crm.read",
        "crm.manage",
        "finance.read",
        "finance.manage",
        "employee.read",
        "employee.manage",
        "employee.schedule.manage",
        "hr.overview.read",
        "hr.profile.read",
        "hr.profile.manage",
        "hr.leave.request",
        "hr.leave.review",
        "hr.debt.read",
        "hr.debt.manage",
        "hr.document.read",
        "hr.document.manage",
        "appointment.read",
        "appointment.manage"
      ],
      "supervisor": [
        "dashboard.read",
        "workspace.read",
        "legal_entity.read",
        "branch.read",
        "membership.read",
        "catalog.read",
        "sales.read",
        "pos.read",
        "pos.cash.read",
        "pos.receivables.read",
        "pos.receivables.collect",
        "pos.void",
        "inventory.read",
        "inventory.move",
        "purchasing.read",
        "purchasing.requests.create",
        "incidents.read",
        "incidents.create",
        "incidents.manage",
        "customer.read",
        "customer.manage",
        "crm.read",
        "crm.manage",
        "finance.read",
        "employee.read",
        "employee.schedule.manage",
        "hr.overview.read",
        "hr.leave.request",
        "hr.leave.review",
        "appointment.read",
        "appointment.manage"
      ],
      "cashier": [
        "dashboard.read",
        "workspace.read",
        "branch.read",
        "catalog.read",
        "sales.read",
        "pos.read",
        "pos.sell",
        "pos.register.manage",
        "pos.cash.read",
        "pos.cash.manage",
        "pos.receivables.read",
        "pos.receivables.collect",
        "inventory.read",
        "purchasing.read",
        "purchasing.requests.create",
        "incidents.read",
        "incidents.create",
        "customer.read",
        "customer.manage",
        "employee.read",
        "hr.leave.request",
        "appointment.read",
        "appointment.manage"
      ],
      "seller": [
        "dashboard.read",
        "workspace.read",
        "branch.read",
        "catalog.read",
        "sales.read",
        "sales.quote.manage",
        "pos.read",
        "pos.sell",
        "inventory.read",
        "purchasing.read",
        "purchasing.requests.create",
        "incidents.read",
        "incidents.create",
        "customer.read",
        "customer.manage",
        "crm.read",
        "crm.manage",
        "employee.read",
        "hr.leave.request",
        "appointment.read",
        "appointment.manage"
      ]
    },
    "users": [
      {
        "seedKey": "admin",
        "displayName": "Alex Demo",
        "email": "demo.alex.admin@example.com",
        "roleCode": "workspace_admin",
        "branchCodes": [],
        "workspaceWide": true,
        "status": "active"
      },
      {
        "seedKey": "manager-north",
        "displayName": "Mar Demo",
        "email": "demo.mar.manager@example.com",
        "roleCode": "manager",
        "branchCodes": [
          "HQ",
          "NORTH"
        ],
        "workspaceWide": false,
        "status": "active"
      },
      {
        "seedKey": "manager-center",
        "displayName": "Sol Demo",
        "email": "demo.sol.manager@example.com",
        "roleCode": "manager",
        "branchCodes": [
          "DOWNTOWN"
        ],
        "workspaceWide": false,
        "status": "active"
      },
      {
        "seedKey": "supervisor",
        "displayName": "Luz Demo",
        "email": "demo.luz.supervisor@example.com",
        "roleCode": "supervisor",
        "branchCodes": [
          "NORTH"
        ],
        "workspaceWide": false,
        "status": "active"
      },
      {
        "seedKey": "cashier",
        "displayName": "Paz Demo",
        "email": "demo.paz.cashier@example.com",
        "roleCode": "cashier",
        "branchCodes": [
          "HQ"
        ],
        "workspaceWide": false,
        "status": "active"
      },
      {
        "seedKey": "seller-east",
        "displayName": "Rio Demo",
        "email": "demo.rio.seller@example.com",
        "roleCode": "seller",
        "branchCodes": [
          "EAST"
        ],
        "workspaceWide": false,
        "status": "active"
      },
      {
        "seedKey": "seller-center",
        "displayName": "Cielo Demo",
        "email": "demo.cielo.seller@example.com",
        "roleCode": "seller",
        "branchCodes": [
          "DOWNTOWN",
          "EAST"
        ],
        "workspaceWide": false,
        "status": "active"
      },
      {
        "seedKey": "suspended",
        "displayName": "Nube Demo",
        "email": "demo.nube.suspended@example.com",
        "roleCode": "supervisor",
        "branchCodes": [
          "EAST"
        ],
        "workspaceWide": false,
        "status": "suspended"
      }
    ]
  },
  "configuration": {
    "workspace": {
      "businessName": "Diedo Demo",
      "taxDefaultRate": 18,
      "locale": "es-DO",
      "currency": "DOP"
    },
    "paymentMethods": [
      {
        "seedKey": "cash",
        "code": "cash",
        "name": "Efectivo",
        "icon": "Banknote",
        "enabled": true,
        "system": true,
        "channel": "cash",
        "settlementPolicy": "immediate",
        "affectsCashDrawer": true,
        "requiresEvidence": false
      },
      {
        "seedKey": "card",
        "code": "card",
        "name": "Tarjeta",
        "icon": "CreditCard",
        "enabled": true,
        "system": true,
        "channel": "card",
        "settlementPolicy": "immediate",
        "affectsCashDrawer": false,
        "requiresEvidence": false
      },
      {
        "seedKey": "transfer",
        "code": "transfer",
        "name": "Transferencia",
        "icon": "Landmark",
        "enabled": true,
        "system": true,
        "channel": "bank_transfer",
        "settlementPolicy": "pending_confirmation",
        "affectsCashDrawer": false,
        "requiresEvidence": true
      },
      {
        "seedKey": "payment-link",
        "code": "payment_link",
        "name": "Link de pago",
        "icon": "Link2",
        "enabled": true,
        "system": true,
        "channel": "payment_link",
        "settlementPolicy": "pending_confirmation",
        "affectsCashDrawer": false,
        "requiresEvidence": true
      },
      {
        "seedKey": "credit",
        "code": "credit",
        "name": "Cuenta por cobrar",
        "icon": "Clock",
        "enabled": true,
        "system": true,
        "channel": "credit",
        "settlementPolicy": "receivable",
        "affectsCashDrawer": false,
        "requiresEvidence": false
      }
    ]
  },
  "catalog": {
    "categories": [
      {
        "seedKey": "depto-laser",
        "name": "Depto laser",
        "description": "Paquetes y ciclos de depilación láser.",
        "status": "active"
      },
      {
        "seedKey": "laser",
        "name": "Laser",
        "description": "Sesiones individuales de depilación láser.",
        "status": "active"
      },
      {
        "seedKey": "otros",
        "name": "Otros",
        "description": "Servicios complementarios y membresías.",
        "status": "active"
      },
      {
        "seedKey": "ventas",
        "name": "Ventas",
        "description": "Promociones y servicios comerciales.",
        "status": "active"
      },
      {
        "seedKey": "productos",
        "name": "Productos",
        "description": "Productos disponibles para venta en sucursal.",
        "status": "active"
      },
      {
        "seedKey": "insumos",
        "name": "Insumos",
        "description": "Materiales de consumo interno y cabina.",
        "status": "active"
      }
    ],
    "items": [
      {
        "seedKey": "remaining-cycle-half",
        "sku": "10",
        "name": "50% Restante de Ciclo",
        "description": "Pago del saldo restante de un ciclo de sesiones.",
        "itemType": "service",
        "categorySeedKey": "depto-laser",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "DOWNTOWN"
        ],
        "status": "active"
      },
      {
        "seedKey": "underarm-session",
        "sku": "8",
        "name": "1 sesión axilas",
        "description": "Sesión individual de depilación láser para axilas.",
        "itemType": "service",
        "categorySeedKey": "laser",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "DOWNTOWN"
        ],
        "status": "active"
      },
      {
        "seedKey": "charm-membership",
        "sku": null,
        "name": "Membresía Charm",
        "description": "Membresía comercial disponible en toda la red.",
        "itemType": "membership",
        "categorySeedKey": "otros",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "NORTH",
          "DOWNTOWN",
          "EAST"
        ],
        "status": "active"
      },
      {
        "seedKey": "full-legs-session",
        "sku": "9",
        "name": "1 sesión piernas completas",
        "description": "Sesión individual de depilación láser para piernas completas.",
        "itemType": "service",
        "categorySeedKey": "laser",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "NORTH"
        ],
        "status": "active"
      },
      {
        "seedKey": "brazilian-package-12",
        "sku": "3",
        "name": "Paq. 12 sesiones Brasileño (íntimo)",
        "description": "Paquete de doce sesiones de depilación brasileña.",
        "itemType": "service",
        "categorySeedKey": "depto-laser",
        "unitCode": "unit",
        "branchCodes": [
          "DOWNTOWN",
          "EAST"
        ],
        "status": "active"
      },
      {
        "seedKey": "full-face-package-12",
        "sku": "6",
        "name": "Paq. 12 sesiones Rostro completo",
        "description": "Paquete de doce sesiones para rostro completo.",
        "itemType": "service",
        "categorySeedKey": "depto-laser",
        "unitCode": "unit",
        "branchCodes": [
          "NORTH",
          "DOWNTOWN"
        ],
        "status": "active"
      },
      {
        "seedKey": "full-body-package-12",
        "sku": "10B",
        "name": "Paq 12 sesiones cuerpo completo",
        "description": "Paquete de doce sesiones para cuerpo completo.",
        "itemType": "service",
        "categorySeedKey": "depto-laser",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "NORTH"
        ],
        "status": "active"
      },
      {
        "seedKey": "face-session",
        "sku": "26",
        "name": "1 Sesión rostro",
        "description": "Sesión individual de depilación láser para rostro.",
        "itemType": "service",
        "categorySeedKey": "laser",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "EAST"
        ],
        "status": "active"
      },
      {
        "seedKey": "full-body-vip-package-12",
        "sku": "5",
        "name": "Paq. 12 sesiones - Cuerpo completo VIP",
        "description": "Paquete VIP de doce sesiones para cuerpo completo.",
        "itemType": "service",
        "categorySeedKey": "depto-laser",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "DOWNTOWN"
        ],
        "status": "active"
      },
      {
        "seedKey": "two-full-body-half-package",
        "sku": "25",
        "name": "50% Paquete de 2 Cuerpos Completos",
        "description": "Pago parcial de promoción para dos paquetes de cuerpo completo.",
        "itemType": "service",
        "categorySeedKey": "ventas",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "EAST"
        ],
        "status": "active"
      },
      {
        "seedKey": "hydrating-facial",
        "sku": "2",
        "name": "Facial hidratante",
        "description": "Tratamiento facial de hidratación profunda.",
        "itemType": "service",
        "categorySeedKey": "otros",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "NORTH"
        ],
        "status": "active"
      },
      {
        "seedKey": "upper-lip-session",
        "sku": "12",
        "name": "Depilación bigote",
        "description": "Sesión individual de depilación para labio superior.",
        "itemType": "service",
        "categorySeedKey": "laser",
        "unitCode": "unit",
        "branchCodes": [
          "DOWNTOWN",
          "EAST"
        ],
        "status": "active"
      },
      {
        "seedKey": "milk-cream",
        "sku": "PRD-01",
        "name": "Crema de leche",
        "description": "Crema corporal disponible para venta.",
        "itemType": "product",
        "categorySeedKey": "productos",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "NORTH",
          "DOWNTOWN",
          "EAST"
        ],
        "status": "active"
      },
      {
        "seedKey": "red-bull",
        "sku": "PRD-02",
        "name": "Red Bull",
        "description": "Bebida energizante para venta en recepción.",
        "itemType": "product",
        "categorySeedKey": "productos",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "NORTH",
          "DOWNTOWN",
          "EAST"
        ],
        "status": "active"
      },
      {
        "seedKey": "coca-cola",
        "sku": "PRD-03",
        "name": "Coca cola normal",
        "description": "Bebida gaseosa para venta en recepción.",
        "itemType": "product",
        "categorySeedKey": "productos",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "NORTH",
          "DOWNTOWN",
          "EAST"
        ],
        "status": "active"
      },
      {
        "seedKey": "hamburger",
        "sku": "PRD-04",
        "name": "Hamburguesa",
        "description": "Producto de cafetería para venta en sucursal.",
        "itemType": "product",
        "categorySeedKey": "productos",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "NORTH",
          "DOWNTOWN",
          "EAST"
        ],
        "status": "active"
      },
      {
        "seedKey": "vitamin-c-serum",
        "sku": "PRD-05",
        "name": "Serum vitamina C",
        "description": "Serum facial de vitamina C para venta minorista.",
        "itemType": "product",
        "categorySeedKey": "productos",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "NORTH",
          "DOWNTOWN",
          "EAST"
        ],
        "status": "active"
      },
      {
        "seedKey": "spf50-sunscreen",
        "sku": "PRD-06",
        "name": "Bloqueador solar SPF50",
        "description": "Protector solar SPF50 para cuidado posterior al tratamiento.",
        "itemType": "product",
        "categorySeedKey": "productos",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "NORTH",
          "DOWNTOWN",
          "EAST"
        ],
        "status": "active"
      },
      {
        "seedKey": "nitrile-gloves",
        "sku": "INS-01",
        "name": "Guantes de nitrilo (caja)",
        "description": "Caja de guantes de nitrilo para uso clínico.",
        "itemType": "supply",
        "categorySeedKey": "insumos",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "NORTH",
          "DOWNTOWN",
          "EAST"
        ],
        "status": "active"
      },
      {
        "seedKey": "laser-conductive-gel",
        "sku": "INS-02",
        "name": "Gel conductor láser",
        "description": "Gel conductor para sesiones de depilación láser.",
        "itemType": "supply",
        "categorySeedKey": "insumos",
        "unitCode": "l",
        "branchCodes": [
          "HQ",
          "NORTH",
          "DOWNTOWN",
          "EAST"
        ],
        "status": "active"
      },
      {
        "seedKey": "disposable-towels",
        "sku": "INS-03",
        "name": "Toallas desechables (paquete)",
        "description": "Paquete de toallas desechables para cabina.",
        "itemType": "supply",
        "categorySeedKey": "insumos",
        "unitCode": "unit",
        "branchCodes": [
          "HQ",
          "NORTH",
          "DOWNTOWN",
          "EAST"
        ],
        "status": "active"
      },
      {
        "seedKey": "isopropyl-alcohol",
        "sku": "INS-04",
        "name": "Alcohol isopropílico 70%",
        "description": "Alcohol isopropílico para limpieza de superficies y equipos.",
        "itemType": "supply",
        "categorySeedKey": "insumos",
        "unitCode": "l",
        "branchCodes": [
          "HQ",
          "NORTH",
          "DOWNTOWN",
          "EAST"
        ],
        "status": "active"
      }
    ]
  },
  "inventory": {
    "itemProfiles": [
      {
        "itemSeedKey": "remaining-cycle-half",
        "salePrice": 8000,
        "taxRate": 18
      },
      {
        "itemSeedKey": "underarm-session",
        "salePrice": 900,
        "taxRate": 18
      },
      {
        "itemSeedKey": "full-legs-session",
        "salePrice": 1200,
        "taxRate": 18
      },
      {
        "itemSeedKey": "brazilian-package-12",
        "salePrice": 5500,
        "taxRate": 18
      },
      {
        "itemSeedKey": "full-face-package-12",
        "salePrice": 5000,
        "taxRate": 18
      },
      {
        "itemSeedKey": "full-body-package-12",
        "salePrice": 9100,
        "taxRate": 18
      },
      {
        "itemSeedKey": "face-session",
        "salePrice": 700,
        "taxRate": 18
      },
      {
        "itemSeedKey": "full-body-vip-package-12",
        "salePrice": 23000,
        "taxRate": 18
      },
      {
        "itemSeedKey": "two-full-body-half-package",
        "salePrice": 12000,
        "taxRate": 18
      },
      {
        "itemSeedKey": "hydrating-facial",
        "salePrice": 2500,
        "taxRate": 18
      },
      {
        "itemSeedKey": "upper-lip-session",
        "salePrice": 500,
        "taxRate": 18
      },
      {
        "itemSeedKey": "milk-cream",
        "salePrice": 350,
        "unitCost": 210,
        "taxRate": 18,
        "minimumStock": 5,
        "stockByBranch": {
          "HQ": 0,
          "NORTH": 8,
          "DOWNTOWN": 14,
          "EAST": 5
        }
      },
      {
        "itemSeedKey": "red-bull",
        "salePrice": 180,
        "unitCost": 125,
        "taxRate": 18,
        "minimumStock": 8,
        "stockByBranch": {
          "HQ": 24,
          "NORTH": 18,
          "DOWNTOWN": 6,
          "EAST": 0
        }
      },
      {
        "itemSeedKey": "coca-cola",
        "salePrice": 90,
        "unitCost": 55,
        "taxRate": 18,
        "minimumStock": 10,
        "stockByBranch": {
          "HQ": 48,
          "NORTH": 30,
          "DOWNTOWN": 12,
          "EAST": 20
        }
      },
      {
        "itemSeedKey": "hamburger",
        "salePrice": 420,
        "unitCost": 260,
        "taxRate": 18,
        "minimumStock": 5,
        "stockByBranch": {
          "HQ": 6,
          "NORTH": 0,
          "DOWNTOWN": 4,
          "EAST": 8
        }
      },
      {
        "itemSeedKey": "vitamin-c-serum",
        "salePrice": 1350,
        "unitCost": 780,
        "taxRate": 18,
        "minimumStock": 4,
        "stockByBranch": {
          "HQ": 24,
          "NORTH": 16,
          "DOWNTOWN": 2,
          "EAST": 10
        }
      },
      {
        "itemSeedKey": "spf50-sunscreen",
        "salePrice": 890,
        "unitCost": 520,
        "taxRate": 18,
        "minimumStock": 4,
        "stockByBranch": {
          "HQ": 12,
          "NORTH": 8,
          "DOWNTOWN": 0,
          "EAST": 3
        }
      },
      {
        "itemSeedKey": "nitrile-gloves",
        "unitCost": 450,
        "taxRate": 0,
        "minimumStock": 20,
        "stockByBranch": {
          "HQ": 120,
          "NORTH": 90,
          "DOWNTOWN": 75,
          "EAST": 60
        }
      },
      {
        "itemSeedKey": "laser-conductive-gel",
        "unitCost": 850,
        "taxRate": 0,
        "minimumStock": 10,
        "stockByBranch": {
          "HQ": 45,
          "NORTH": 30,
          "DOWNTOWN": 8,
          "EAST": 20
        }
      },
      {
        "itemSeedKey": "disposable-towels",
        "unitCost": 320,
        "taxRate": 0,
        "minimumStock": 15,
        "stockByBranch": {
          "HQ": 80,
          "NORTH": 55,
          "DOWNTOWN": 30,
          "EAST": 12
        }
      },
      {
        "itemSeedKey": "isopropyl-alcohol",
        "unitCost": 280,
        "taxRate": 0,
        "minimumStock": 8,
        "stockByBranch": {
          "HQ": 36,
          "NORTH": 25,
          "DOWNTOWN": 6,
          "EAST": 0
        }
      }
    ],
    "assets": [
      {
        "seedKey": "hq-reception-chair",
        "name": "Silla ergonómica de recepción",
        "code": "MOB-HQ-001",
        "categoryCode": "mobiliario",
        "branchCode": "HQ",
        "acquisitionValue": 8500,
        "status": "activo",
        "location": "Recepción",
        "purchaseDate": "2024-03-12"
      },
      {
        "seedKey": "hq-admin-laptop",
        "name": "Laptop administración",
        "code": "TEC-HQ-014",
        "categoryCode": "tecnologia",
        "branchCode": "HQ",
        "acquisitionValue": 42000,
        "status": "activo",
        "location": "Oficina",
        "purchaseDate": "2023-11-05",
        "notes": "MacBook Air M2"
      },
      {
        "seedKey": "hq-old-printer",
        "name": "Impresora térmica antigua",
        "code": "TEC-HQ-002",
        "categoryCode": "tecnologia",
        "branchCode": "HQ",
        "acquisitionValue": 4200,
        "status": "baja",
        "location": "Almacén",
        "purchaseDate": "2020-02-10",
        "notes": "Reemplazada"
      },
      {
        "seedKey": "hq-air-conditioner",
        "name": "Aire acondicionado 24k BTU",
        "code": "EQP-HQ-009",
        "categoryCode": "equipos",
        "branchCode": "HQ",
        "acquisitionValue": 38000,
        "status": "activo",
        "location": "Sala principal",
        "purchaseDate": "2022-06-18"
      },
      {
        "seedKey": "north-reception-desk",
        "name": "Escritorio de recepción",
        "code": "MOB-NOR-003",
        "categoryCode": "mobiliario",
        "branchCode": "NORTH",
        "acquisitionValue": 30000,
        "status": "activo",
        "location": "Recepción",
        "purchaseDate": "2023-08-14"
      },
      {
        "seedKey": "north-laser-machine",
        "name": "Equipo láser diodo",
        "code": "EQP-NOR-001",
        "categoryCode": "equipos",
        "branchCode": "NORTH",
        "acquisitionValue": 285000,
        "status": "activo",
        "location": "Cabina 1",
        "purchaseDate": "2024-02-05"
      },
      {
        "seedKey": "north-pos-tablet",
        "name": "Tablet punto de venta",
        "code": "TEC-NOR-008",
        "categoryCode": "tecnologia",
        "branchCode": "NORTH",
        "acquisitionValue": 28000,
        "status": "reparacion",
        "location": "Oficina",
        "purchaseDate": "2023-05-10",
        "notes": "Cambio de pantalla"
      },
      {
        "seedKey": "north-tool-kit",
        "name": "Kit de herramientas técnicas",
        "code": "HER-NOR-002",
        "categoryCode": "herramientas",
        "branchCode": "NORTH",
        "acquisitionValue": 12500,
        "status": "activo",
        "location": "Almacén técnico",
        "purchaseDate": "2024-04-22"
      },
      {
        "seedKey": "downtown-treatment-bed",
        "name": "Camilla hidráulica",
        "code": "MOB-DOW-004",
        "categoryCode": "mobiliario",
        "branchCode": "DOWNTOWN",
        "acquisitionValue": 18500,
        "status": "activo",
        "location": "Cabina 2",
        "purchaseDate": "2023-10-01"
      },
      {
        "seedKey": "downtown-uv-sterilizer",
        "name": "Esterilizador UV",
        "code": "EQP-DOW-003",
        "categoryCode": "equipos",
        "branchCode": "DOWNTOWN",
        "acquisitionValue": 15600,
        "status": "reparacion",
        "location": "Sala 2",
        "purchaseDate": "2024-01-20",
        "notes": "En taller externo"
      },
      {
        "seedKey": "downtown-router",
        "name": "Router empresarial",
        "code": "TEC-DOW-011",
        "categoryCode": "tecnologia",
        "branchCode": "DOWNTOWN",
        "acquisitionValue": 6500,
        "status": "activo",
        "location": "Cuarto técnico",
        "purchaseDate": "2024-06-15"
      },
      {
        "seedKey": "downtown-motorcycle",
        "name": "Motocicleta de mensajería",
        "code": "VEH-DOW-001",
        "categoryCode": "vehiculos",
        "branchCode": "DOWNTOWN",
        "acquisitionValue": 125000,
        "status": "activo",
        "location": "Estacionamiento",
        "purchaseDate": "2022-09-30"
      },
      {
        "seedKey": "east-reception-chair",
        "name": "Silla de recepción",
        "code": "MOB-EAS-006",
        "categoryCode": "mobiliario",
        "branchCode": "EAST",
        "acquisitionValue": 9000,
        "status": "activo",
        "location": "Recepción",
        "purchaseDate": "2024-03-20"
      },
      {
        "seedKey": "east-admin-laptop",
        "name": "Laptop de sucursal",
        "code": "TEC-EAS-005",
        "categoryCode": "tecnologia",
        "branchCode": "EAST",
        "acquisitionValue": 39500,
        "status": "activo",
        "location": "Administración",
        "purchaseDate": "2023-12-11"
      },
      {
        "seedKey": "east-cooling-system",
        "name": "Sistema de enfriamiento láser",
        "code": "EQP-EAS-007",
        "categoryCode": "equipos",
        "branchCode": "EAST",
        "acquisitionValue": 68000,
        "status": "reparacion",
        "location": "Cabina 1",
        "purchaseDate": "2023-07-19",
        "notes": "Pendiente de repuesto"
      },
      {
        "seedKey": "east-old-treatment-bed",
        "name": "Camilla de tratamiento antigua",
        "code": "MOB-EAS-001",
        "categoryCode": "mobiliario",
        "branchCode": "EAST",
        "acquisitionValue": 12000,
        "status": "baja",
        "location": "Almacén",
        "purchaseDate": "2019-05-08",
        "notes": "Fuera de servicio"
      }
    ]
  },
  "purchasing": {
    "suppliers": [
      {
        "seedKey": "distribuidora-caribe",
        "name": "Distribuidora del Caribe",
        "rnc": "131-12345-6",
        "contactName": "Juan Pérez",
        "phone": "809-555-0199",
        "email": "ventas@proveedor.com",
        "address": "Calle Central #12, Santo Domingo",
        "branchCodes": [
          "HQ",
          "NORTH"
        ],
        "productCount": 24,
        "active": true
      },
      {
        "seedKey": "beauty-supply-rd",
        "name": "Beauty Supply RD",
        "rnc": "101-99887-2",
        "contactName": "María López",
        "phone": "829-555-4400",
        "email": "pedidos@beautysupply.do",
        "address": "Av. Winston Churchill, Santo Domingo",
        "branchCodes": [
          "HQ"
        ],
        "productCount": 12,
        "active": true
      }
    ],
    "requests": [
      {
        "seedKey": "reposicion-insumos-laser",
        "number": "SC-20260830-0001",
        "supplierSeedKey": "distribuidora-caribe",
        "branchCode": "HQ",
        "requesterUserSeedKey": "admin",
        "requesterName": "Leonedis Hamburgo",
        "items": [
          {
            "name": "Cera depilatoria premium",
            "qty": 10,
            "unit": "unidad",
            "price": 450
          },
          {
            "name": "Guantes desechables",
            "qty": 5,
            "unit": "caja",
            "price": 320
          }
        ],
        "status": "pendiente",
        "priority": "normal",
        "notes": "Reposición mensual de insumos láser.",
        "createdAt": "2026-08-30T14:00:00Z"
      },
      {
        "seedKey": "shampoo-profesional",
        "number": "SC-20260827-0002",
        "supplierSeedKey": "beauty-supply-rd",
        "branchCode": "HQ",
        "requesterUserSeedKey": "cashier",
        "requesterName": "María Recepción",
        "items": [
          {
            "name": "Shampoo profesional",
            "qty": 20,
            "unit": "unidad",
            "price": 280
          }
        ],
        "status": "aprobada",
        "priority": "alta",
        "notes": "Urgente para sucursal DN.",
        "quoteFileName": "cotizacion-shampoo.pdf",
        "createdAt": "2026-08-27T13:00:00Z",
        "reviewerUserSeedKey": "admin",
        "reviewedAt": "2026-08-28T15:30:00Z"
      }
    ],
    "settings": {
      "approverUserSeedKey": "admin",
      "notifyOnRequest": true
    }
  },
  "incidents": {
    "items": [
      {
        "seedKey": "laser-equipment-repair",
        "code": "INC-1193",
        "title": "Solicitud de reparación del equipo láser",
        "description": "El equipo presenta pérdida de potencia durante sesiones prolongadas.",
        "type": "activo",
        "priority": "alta",
        "status": "en_proceso",
        "branchCode": "NORTH",
        "assetSeedKey": "north-laser-machine",
        "reporterUserSeedKey": "supervisor",
        "participantUserSeedKeys": [
          "supervisor",
          "manager-north"
        ],
        "activities": [
          {
            "seedKey": "reported",
            "type": "created",
            "authorUserSeedKey": "supervisor",
            "message": "Incidencia reportada y abierta.",
            "createdAt": "2026-08-29T10:20:00Z"
          },
          {
            "seedKey": "started",
            "type": "status_changed",
            "authorUserSeedKey": "manager-north",
            "message": "Estado cambiado a en proceso.",
            "createdAt": "2026-08-30T09:05:00Z"
          }
        ],
        "attachments": [],
        "createdAt": "2026-08-29T10:20:00Z",
        "updatedAt": "2026-08-30T09:05:00Z"
      },
      {
        "seedKey": "customer-bathroom-leak",
        "code": "INC-1188",
        "title": "Fuga de agua en baño de clientes",
        "description": "Se detectó humedad en el techo del baño principal.",
        "type": "infraestructura",
        "priority": "alta",
        "status": "abierta",
        "branchCode": "DOWNTOWN",
        "assetSeedKey": null,
        "reporterUserSeedKey": "manager-center",
        "participantUserSeedKeys": [
          "manager-center",
          "seller-center"
        ],
        "activities": [
          {
            "seedKey": "reported",
            "type": "created",
            "authorUserSeedKey": "manager-center",
            "message": "Incidencia reportada y abierta.",
            "createdAt": "2026-08-31T14:10:00Z"
          },
          {
            "seedKey": "evidence-added",
            "type": "comment",
            "authorUserSeedKey": "seller-center",
            "message": "Se adjuntó evidencia visual de la fuga detectada.",
            "createdAt": "2026-08-31T14:15:00Z"
          }
        ],
        "attachments": [
          {
            "seedKey": "leak-evidence",
            "originalFilename": "evidencia-fuga-demo.png",
            "contentType": "image/png",
            "contentBase64": "iVBORw0KGgoAAAANSUhEUgAAAPAAAACgCAYAAAAy2+FlAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAfMSURBVHhe7dqxjtRGHMfxexKeIV0k2uSegAe4hv4QVRqElCYUqYGChvZeAFC6qy7VdUFIVCcKXiBCSuNovWt75jf/mV2b3eV+d19Ln+LsmfGMPT+P13Dy4OFZB8DTie4A4IMAA8YIMGCMAAPGCDBgjAADxggwYIwAA8YIMGCMAAPGCDBgjAADxu5YgN90l92W7epN9+Dh8+7tl/RvbWc6fnPxPPv78sX286zLLOmXlC36Nh0rz3HWPXhxPbW32db9j8dWtPH4XXeT1C2OF9rjKuu3y/dbdB2y/XFfi3EG16Jo4w64pwE+6x5dfN3suO6eaTvj5PjavX282qeTfvt58gm1vXw8cYfzl+1oOJ5djZXK7cu77tFYVscyma7JZts64bePaz/XYbXl90n7mp6neS2Ka+rtzgZYJ2cheYJr2XFyjBNfJ339PNPkSSdKvXxJJm4WvridaTLnkzOd5NME17EMkv1Xw+oVPNwqfdVx7f06ZO0kb1CbbRhfOub8HEl72TX1dn8DXH2N1tfnfN+2AMf1W+WVTty0TtROtG+w7ku+CupYNsYH2iq0rTZTrXL7uw43X9ahLNv52t1k50jq6Cv17PN7uMcBPgtW2uj1eUUnffs8Zbvt8rly4k4rYdBOFjxtK6JjWRv7vHmYjSto8zU66E9iX9fh8mIzxqEvw+/bq3f5QyK8d7ndxuXjzgY43uTGBje8nHQrOum3TMRhggUTN95qr5m6ogTnHT/WfE+Ag9Vyp3aD/qT2fh3WfRnu0c3Fm7zfO/RZH1Tu7neAi4mrf5fljhvgNEirMsF5d5i0OR1L/CALyxWC/qT2eB2GlfPyxdCvVFm5XztcCwJ8q22ZUIFsxQ0n8opO5vZ5ylW8XT6nZadzd1fXZTt7eIXWL7rFVp3s2tfcPq/DuOpeXa/H27cpAa7evwmv0LfanAmykdz0yyudcAOd9O3zDJOk/OgSl88FZeXfPPN2gvLal8pHuuIBUd1qD4cdzr2v66DXoB+TvjFNdfiIZWnJDSoncHnzddLXzxP/k069fCkuq/+2mR6Lz5nuT8ckY2muWssDEfepXr6kZae/p30a4PS82ue0fu2B5OfOBri6FavrmbxCRje3HuDaVp88lW3ra2Y0gcv+hVvjg1z5mpsbHxzh8e3j2ud1KP9tuQxwXi7aogeVLwK8kr6ehb+N5gQ4miCt8putMXEH6YNGj/WC/z5YrpzpWJLgh+PWj2h6vDWuueU3W+M6lA+bOMB5v5OtNkZjdyzAwP1CgAFjBBgwRoABYwQYMEaAAWMEGDBGgAFjBBgwRoABYwQYMEaAAWMEGDB28u+3/zoAnggwYIwAA8YIMGCMAAPGCDBgjAADxggwYIwAA8YIMGCMAAPGCDBgjAADxggwYIwAA8YIMGCMAAPGbn2Af/v9z51oPeA+IMCAMQIMGCPAgDECDBgjwIAxAgwYI8CAMQIMGCPAgDECDBgjwIAxAgwYI8CAMQIMGCPAgDECDBgjwIAxAgwYI8CAMQIMGCPAgDECDBgjwIAxAgwYI8CAMQIMGCPAgDECDBgjwIAxAgwYI8CAMQIMGCPAqPrpj3+qtCx+DAKMkAY2onVwfAQYBQ1qi9bFcRFgZDSgu9A2cDyWAf77l59xABrMOfS+4TgIMEYayjn0vuE4CDB6Gsgl9N7h8AgwehrGJfTe4fAIMHoaxiX03uHwCDB6GsYl9N7h8AgwehrGJfTe4fAIMHoaxiX03uHwLAMc0XqYR8O4hLaJw7v1AcZxaBiX0DZxeAQYPQ3jEtomDo8Ao6dhXELbxOERYPQ0jEtomzg8AoyehnEJbROHR4Ax0kDOoW3hOAgwRhrKObQtHAcBRkaDuQttA8dDgFHQgLZoXRwXAUZIgxrROjg+AowqDSzhvX0IMGCMAAPGCDBgjAADxggwYIwAA8YIMGCMAAPGCDBgjAADxggwYIwAz/XpdffryUl3ok5fdx+17MF97l6ennTnH3S/6Pv8tHuv+3e1uP6O/cNiBHiuxZP5EHYMyPf2eXH9HfuHxQjwXK3JrMf0729/defjiv20Oz897V5+SstOK3p90msbadnk2HjeXfdF/Vj1Lyjb7Gujf816WIIAz1WEsnEs+3u9Gv366vP62Ienm4BMx4YJ/fHVaeWVPGpjqBccG9rY1o/xXOvwjcEajgX1474GbUv/4npYigDPJatIuTJVAqzH+gmdrMDFOYKHRLE/CUVxbBXGTfvNfki5KFRFncqxolzjFbooiyUI8FytiafHdHJn4SgD/P5J8FDQ9os20gDrg6UW4Eq5bDVujKvW11b/WvWwGAGeK5jM1WNFcHR1GgK8fnUdXz2LskF7Yxu1FbhSb1u5rQFu9LVoOw1wox4WI8BzNSde8jo6rjZD2ej3YbBCFvVSURuV38DVYDXK6W/g4Vi1Le1ro3/NeliKAM/VDPDm48zmFfH8wyoQadnkC+2T19krdPpqWdZLNb7yZl+X09fzdbDir9DyO7wfX9qXsn67r/X+tethCQL8o2x5EAC7IMBHk656wcoHLECAAWMEGDBGgAFjBBgwRoABYwQYMEaAAWMEGDBGgAFjBBgwRoABYwQYMEaAAWMEGDD2P/IyGKD9yZ2EAAAAAElFTkSuQmCC",
            "uploadedByUserSeedKey": "seller-center",
            "createdAt": "2026-08-31T14:15:00Z"
          }
        ],
        "createdAt": "2026-08-31T14:10:00Z",
        "updatedAt": "2026-08-31T14:15:00Z"
      },
      {
        "seedKey": "unreported-absence",
        "code": "INC-1175",
        "title": "Ausencia no reportada en turno de mañana",
        "description": "La persona asignada no se presentó y no notificó al supervisor.",
        "type": "personal",
        "priority": "baja",
        "status": "cerrada",
        "branchCode": "HQ",
        "assetSeedKey": null,
        "reporterUserSeedKey": "cashier",
        "participantUserSeedKeys": [
          "cashier",
          "admin"
        ],
        "activities": [
          {
            "seedKey": "reported",
            "type": "created",
            "authorUserSeedKey": "cashier",
            "message": "Incidencia reportada y abierta.",
            "createdAt": "2026-08-26T08:35:00Z"
          },
          {
            "seedKey": "closed",
            "type": "status_changed",
            "authorUserSeedKey": "admin",
            "message": "Estado cambiado a cerrada después de validar la novedad.",
            "createdAt": "2026-08-27T11:40:00Z"
          }
        ],
        "attachments": [],
        "createdAt": "2026-08-26T08:35:00Z",
        "updatedAt": "2026-08-27T11:40:00Z"
      },
      {
        "seedKey": "east-cooling-system",
        "code": "INC-1162",
        "title": "Sistema de enfriamiento sin alcanzar temperatura",
        "description": "La cabina registra temperatura elevada desde el turno anterior.",
        "type": "activo",
        "priority": "media",
        "status": "en_proceso",
        "branchCode": "EAST",
        "assetSeedKey": "east-cooling-system",
        "reporterUserSeedKey": "seller-east",
        "participantUserSeedKeys": [
          "seller-east",
          "seller-center"
        ],
        "activities": [
          {
            "seedKey": "reported",
            "type": "created",
            "authorUserSeedKey": "seller-east",
            "message": "Incidencia reportada y abierta.",
            "createdAt": "2026-08-28T16:25:00Z"
          },
          {
            "seedKey": "technician-scheduled",
            "type": "comment",
            "authorUserSeedKey": "seller-center",
            "message": "Técnico programado para revisión y cambio de repuesto.",
            "createdAt": "2026-08-28T17:10:00Z"
          }
        ],
        "attachments": [],
        "createdAt": "2026-08-28T16:25:00Z",
        "updatedAt": "2026-08-28T17:10:00Z"
      },
      {
        "seedKey": "main-hall-light",
        "code": "INC-1150",
        "title": "Luz intermitente en pasillo principal",
        "description": "La luminaria central presenta parpadeo constante.",
        "type": "infraestructura",
        "priority": "media",
        "status": "resuelta",
        "branchCode": "HQ",
        "assetSeedKey": null,
        "reporterUserSeedKey": "cashier",
        "participantUserSeedKeys": [
          "cashier",
          "admin"
        ],
        "activities": [
          {
            "seedKey": "reported",
            "type": "created",
            "authorUserSeedKey": "cashier",
            "message": "Incidencia reportada y abierta.",
            "createdAt": "2026-08-23T12:00:00Z"
          },
          {
            "seedKey": "resolved",
            "type": "status_changed",
            "authorUserSeedKey": "admin",
            "message": "Luminaria reemplazada; estado cambiado a resuelta.",
            "createdAt": "2026-08-24T09:30:00Z"
          }
        ],
        "attachments": [],
        "createdAt": "2026-08-23T12:00:00Z",
        "updatedAt": "2026-08-24T09:30:00Z"
      },
      {
        "seedKey": "north-pos-tablet",
        "code": "INC-1144",
        "title": "Tablet del punto de venta fuera de servicio",
        "description": "La pantalla no responde y no permite completar cobros.",
        "type": "activo",
        "priority": "critica",
        "status": "abierta",
        "branchCode": "NORTH",
        "assetSeedKey": "north-pos-tablet",
        "reporterUserSeedKey": "manager-north",
        "participantUserSeedKeys": [
          "manager-north",
          "supervisor"
        ],
        "activities": [
          {
            "seedKey": "reported",
            "type": "created",
            "authorUserSeedKey": "manager-north",
            "message": "Incidencia reportada y abierta; equipo enviado a diagnóstico.",
            "createdAt": "2026-08-30T18:45:00Z"
          }
        ],
        "attachments": [],
        "createdAt": "2026-08-30T18:45:00Z",
        "updatedAt": "2026-08-30T18:45:00Z"
      }
    ]
  },
  "customers": {
    "items": [
      {
        "seedKey": "c1",
        "customerType": "person",
        "displayName": "María Fernández",
        "firstName": "María",
        "lastName": "Fernández",
        "phone": "809-555-0142",
        "branchCodes": [
          "DOWNTOWN",
          "NORTH",
          "EAST"
        ],
        "status": "active",
        "points": 340
      },
      {
        "seedKey": "c2",
        "customerType": "person",
        "displayName": "José Ramírez",
        "firstName": "José",
        "lastName": "Ramírez",
        "phone": "809-555-0198",
        "branchCodes": [
          "DOWNTOWN"
        ],
        "status": "active",
        "points": 120
      },
      {
        "seedKey": "c3",
        "customerType": "person",
        "displayName": "Ana Cristina Vargas",
        "firstName": "Ana Cristina",
        "lastName": "Vargas",
        "phone": "829-555-0110",
        "branchCodes": [
          "NORTH"
        ],
        "status": "active",
        "points": 890
      },
      {
        "seedKey": "c4",
        "customerType": "business",
        "displayName": "Luis Alberto Peña",
        "firstName": "Luis Alberto",
        "lastName": "Peña",
        "businessName": "Distribuidora Peña, S.R.L.",
        "phone": "849-555-0177",
        "branchCodes": [
          "DOWNTOWN",
          "EAST"
        ],
        "status": "active",
        "points": 55
      },
      {
        "seedKey": "c5",
        "customerType": "person",
        "displayName": "Carla Jiménez",
        "firstName": "Carla",
        "lastName": "Jiménez",
        "phone": "809-555-0210",
        "branchCodes": [
          "EAST"
        ],
        "status": "active",
        "points": 410
      }
    ]
  },
  "crm": {
    "scoringWeights": {
      "pos": 1,
      "agenda": 1,
      "inventarios": 1,
      "finanzas": 0.9,
      "crm": 1.2,
      "incidencias": 0.8,
      "config": 0.6
    },
    "customerProfiles": [
      {
        "customerSeedKey": "c1",
        "lifecycleStatus": "activo",
        "notes": "Cliente VIP. Prefiere contacto por WhatsApp y horario de tarde."
      },
      {
        "customerSeedKey": "c2",
        "lifecycleStatus": "activo",
        "notes": "Convertido desde CRM; interesado en paquetes recurrentes."
      },
      {
        "customerSeedKey": "c3",
        "lifecycleStatus": "activo",
        "notes": "Cuenta de alto valor con compras frecuentes en Sucursal Norte."
      },
      {
        "customerSeedKey": "c4",
        "lifecycleStatus": "inactivo",
        "notes": "Reactivar con campaña de fidelización en septiembre."
      },
      {
        "customerSeedKey": "c5",
        "lifecycleStatus": "prospecto",
        "notes": "Cotización vencida; requiere seguimiento comercial."
      }
    ],
    "leads": [
      {
        "seedKey": "jose-studio",
        "branchCode": "DOWNTOWN",
        "assignedUserSeedKey": "seller-center",
        "name": "José Ramírez",
        "company": "Studio JR",
        "email": "jose.ramirez@example.com",
        "phone": "809-555-0198",
        "website": "https://studio-jr.example.com",
        "location": "Santo Domingo",
        "source": "referral",
        "rawSnippet": "Salón de belleza con agenda, citas, clientes y punto de venta.",
        "status": "convertido",
        "scoreManual": 91,
        "scoreNotes": "Referido por cliente VIP.",
        "convertedCustomerSeedKey": "c2",
        "createdAt": "2026-08-20T14:00:00Z",
        "updatedAt": "2026-08-24T16:30:00Z"
      },
      {
        "seedKey": "carla-boutique",
        "branchCode": "EAST",
        "assignedUserSeedKey": "seller-east",
        "name": "Carla Jiménez",
        "company": "Boutique Carla",
        "email": "carla.jimenez@example.com",
        "phone": "809-555-0210",
        "website": "https://boutique-carla.example.com",
        "location": "Santo Domingo Este",
        "source": "serper",
        "sourceUrl": "https://www.google.com/maps/search/boutique-carla",
        "scrapedAt": "2026-08-25T13:00:00Z",
        "rawSnippet": "Tienda retail con productos, inventario, stock y ventas.",
        "status": "convertido",
        "scoreNotes": "Conversión parcial; validar presupuesto actualizado.",
        "convertedCustomerSeedKey": "c5",
        "createdAt": "2026-08-25T13:00:00Z",
        "updatedAt": "2026-08-27T17:10:00Z"
      },
      {
        "seedKey": "clinica-sonrisa",
        "branchCode": "NORTH",
        "assignedUserSeedKey": "manager-north",
        "name": "Dra. Laura Méndez",
        "company": "Clínica Sonrisa Norte",
        "email": "laura@sonrisanorte.example.com",
        "phone": "809-555-0301",
        "website": "https://sonrisanorte.example.com",
        "location": "Santiago",
        "source": "serp",
        "sourceUrl": "https://www.google.com/maps/search/clinica-sonrisa-norte",
        "scrapedAt": "2026-08-29T14:15:00Z",
        "rawSnippet": "Clínica dental con citas, pacientes, inventario e historial de clientes.",
        "status": "calificado",
        "scoreNotes": "Solicitó demostración de agenda y CRM.",
        "createdAt": "2026-08-29T14:15:00Z",
        "updatedAt": "2026-08-31T18:00:00Z"
      },
      {
        "seedKey": "zen-spa",
        "branchCode": "DOWNTOWN",
        "assignedUserSeedKey": "seller-center",
        "name": "Paola Castillo",
        "company": "Zen Spa Colonial",
        "email": "paola@zenspa.example.com",
        "phone": "829-555-0312",
        "location": "Zona Colonial",
        "source": "manual",
        "rawSnippet": "Spa de masajes que necesita reservas, agenda y fidelización de clientes.",
        "status": "contactado",
        "scoreManual": 84,
        "scoreNotes": "Primera llamada positiva.",
        "createdAt": "2026-08-30T15:20:00Z",
        "updatedAt": "2026-09-01T13:30:00Z"
      },
      {
        "seedKey": "crossfit-oriente",
        "branchCode": "EAST",
        "assignedUserSeedKey": "seller-east",
        "name": "Manuel Reyes",
        "company": "CrossFit Oriente",
        "email": "manuel@crossfitoriente.example.com",
        "phone": "849-555-0415",
        "website": "https://crossfitoriente.example.com",
        "location": "Santo Domingo Este",
        "source": "import",
        "rawSnippet": "Gimnasio con membresías, reservas, cobros recurrentes y CRM.",
        "status": "nuevo",
        "createdAt": "2026-09-01T12:00:00Z",
        "updatedAt": "2026-09-01T12:00:00Z"
      },
      {
        "seedKey": "cafe-mirador",
        "branchCode": "NORTH",
        "assignedUserSeedKey": "manager-north",
        "name": "Elena Cruz",
        "company": "Café Mirador",
        "email": "elena@cafemirador.example.com",
        "phone": "809-555-0550",
        "location": "Santiago",
        "source": "serp",
        "rawSnippet": "Café y restaurante con punto de venta, caja e inventario de insumos.",
        "status": "calificado",
        "createdAt": "2026-08-28T11:45:00Z",
        "updatedAt": "2026-08-31T16:00:00Z"
      },
      {
        "seedKey": "autolavado-27",
        "branchCode": "DOWNTOWN",
        "assignedUserSeedKey": "seller-center",
        "name": "Rafael Ortiz",
        "company": "Autolavado 27",
        "phone": "809-555-0607",
        "location": "Distrito Nacional",
        "source": "manual",
        "rawSnippet": "Lavado y detailing por reserva; necesita caja e inventario.",
        "status": "descartado",
        "scoreManual": 42,
        "scoreNotes": "Sin presupuesto para este trimestre.",
        "createdAt": "2026-08-22T17:00:00Z",
        "updatedAt": "2026-08-26T19:00:00Z"
      },
      {
        "seedKey": "ferreteria-europa",
        "branchCode": "HQ",
        "assignedUserSeedKey": "manager-north",
        "name": "Sofía Luna",
        "company": "Ferretería Europa",
        "email": "sofia@ferreteriaeurope.example.com",
        "phone": "809-555-0714",
        "website": "https://ferreteriaeurope.example.com",
        "location": "Santo Domingo",
        "source": "referral",
        "rawSnippet": "Ferretería multisucursal con ventas, productos, almacén y stock.",
        "status": "contactado",
        "createdAt": "2026-08-27T14:10:00Z",
        "updatedAt": "2026-09-01T14:05:00Z"
      }
    ],
    "opportunities": [
      {
        "seedKey": "jose-package",
        "branchCode": "DOWNTOWN",
        "assignedUserSeedKey": "seller-center",
        "leadSeedKey": "jose-studio",
        "customerSeedKey": "c2",
        "title": "Paquete operativo Studio JR",
        "customerName": "José Ramírez",
        "stage": "cerrado",
        "value": 18500,
        "notes": "Cotización aceptada y convertida en venta.",
        "createdAt": "2026-08-21T14:00:00Z",
        "updatedAt": "2026-08-30T14:00:00Z",
        "closedAt": "2026-08-30T14:00:00Z"
      },
      {
        "seedKey": "carla-retail",
        "branchCode": "EAST",
        "assignedUserSeedKey": "seller-east",
        "leadSeedKey": "carla-boutique",
        "customerSeedKey": "c5",
        "title": "Implementación retail Boutique Carla",
        "customerName": "Carla Jiménez",
        "stage": "propuesta",
        "value": 32000,
        "notes": "Renovar propuesta vencida con alcance de inventarios.",
        "createdAt": "2026-08-27T17:10:00Z",
        "updatedAt": "2026-09-01T12:30:00Z"
      },
      {
        "seedKey": "sonrisa-agenda",
        "branchCode": "NORTH",
        "assignedUserSeedKey": "manager-north",
        "leadSeedKey": "clinica-sonrisa",
        "title": "Agenda y CRM Clínica Sonrisa",
        "customerName": "Clínica Sonrisa Norte",
        "stage": "negociacion",
        "value": 47500,
        "notes": "Pendiente confirmación de número de consultorios.",
        "createdAt": "2026-08-30T13:00:00Z",
        "updatedAt": "2026-09-01T15:00:00Z"
      },
      {
        "seedKey": "zen-spa-demo",
        "branchCode": "DOWNTOWN",
        "assignedUserSeedKey": "seller-center",
        "leadSeedKey": "zen-spa",
        "title": "Demo comercial Zen Spa",
        "customerName": "Zen Spa Colonial",
        "stage": "contactado",
        "value": 24000,
        "createdAt": "2026-09-01T13:30:00Z",
        "updatedAt": "2026-09-01T13:30:00Z"
      },
      {
        "seedKey": "cafe-pos",
        "branchCode": "NORTH",
        "assignedUserSeedKey": "manager-north",
        "leadSeedKey": "cafe-mirador",
        "title": "POS e inventario Café Mirador",
        "customerName": "Café Mirador",
        "stage": "propuesta",
        "value": 39500,
        "createdAt": "2026-08-31T16:00:00Z",
        "updatedAt": "2026-09-01T16:00:00Z"
      },
      {
        "seedKey": "ferreteria-rollout",
        "branchCode": "HQ",
        "assignedUserSeedKey": "manager-north",
        "leadSeedKey": "ferreteria-europa",
        "title": "Rollout multisucursal Ferretería Europa",
        "customerName": "Ferretería Europa",
        "stage": "nuevo",
        "value": 78000,
        "createdAt": "2026-09-01T14:05:00Z",
        "updatedAt": "2026-09-01T14:05:00Z"
      }
    ],
    "activities": [
      {
        "seedKey": "jose-sale-call",
        "branchCode": "DOWNTOWN",
        "assignedUserSeedKey": "seller-center",
        "leadSeedKey": "jose-studio",
        "opportunitySeedKey": "jose-package",
        "customerSeedKey": "c2",
        "activityType": "llamada",
        "title": "Confirmación posterior a la venta",
        "description": "Validar fecha de activación y datos del equipo.",
        "customerName": "José Ramírez",
        "dueAt": "2026-08-31T14:00:00Z",
        "completedAt": "2026-08-31T14:12:00Z",
        "createdAt": "2026-08-30T14:05:00Z",
        "updatedAt": "2026-08-31T14:12:00Z"
      },
      {
        "seedKey": "carla-renew-quote",
        "branchCode": "EAST",
        "assignedUserSeedKey": "seller-east",
        "leadSeedKey": "carla-boutique",
        "opportunitySeedKey": "carla-retail",
        "customerSeedKey": "c5",
        "activityType": "tarea",
        "title": "Renovar cotización vencida",
        "description": "Actualizar precios y confirmar módulos incluidos.",
        "customerName": "Carla Jiménez",
        "dueAt": "2026-09-02T15:00:00Z",
        "createdAt": "2026-09-01T12:35:00Z",
        "updatedAt": "2026-09-01T12:35:00Z"
      },
      {
        "seedKey": "sonrisa-demo",
        "branchCode": "NORTH",
        "assignedUserSeedKey": "manager-north",
        "leadSeedKey": "clinica-sonrisa",
        "opportunitySeedKey": "sonrisa-agenda",
        "activityType": "reunion",
        "title": "Demo de agenda clínica",
        "description": "Mostrar gestión de consultorios, citas y recordatorios.",
        "customerName": "Clínica Sonrisa Norte",
        "dueAt": "2026-09-03T16:00:00Z",
        "createdAt": "2026-09-01T15:05:00Z",
        "updatedAt": "2026-09-01T15:05:00Z"
      },
      {
        "seedKey": "zen-first-call",
        "branchCode": "DOWNTOWN",
        "assignedUserSeedKey": "seller-center",
        "leadSeedKey": "zen-spa",
        "opportunitySeedKey": "zen-spa-demo",
        "activityType": "llamada",
        "title": "Llamada de descubrimiento",
        "description": "Confirmar cantidad de cabinas y terapeutas.",
        "customerName": "Zen Spa Colonial",
        "dueAt": "2026-09-01T13:00:00Z",
        "completedAt": "2026-09-01T13:25:00Z",
        "createdAt": "2026-08-31T17:00:00Z",
        "updatedAt": "2026-09-01T13:25:00Z"
      },
      {
        "seedKey": "cafe-proposal-email",
        "branchCode": "NORTH",
        "assignedUserSeedKey": "manager-north",
        "leadSeedKey": "cafe-mirador",
        "opportunitySeedKey": "cafe-pos",
        "activityType": "email",
        "title": "Enviar propuesta POS",
        "description": "Adjuntar alcance de caja, recetas e inventario.",
        "customerName": "Café Mirador",
        "dueAt": "2026-09-01T16:00:00Z",
        "completedAt": "2026-09-01T16:08:00Z",
        "createdAt": "2026-09-01T10:00:00Z",
        "updatedAt": "2026-09-01T16:08:00Z"
      },
      {
        "seedKey": "ferreteria-discovery",
        "branchCode": "HQ",
        "assignedUserSeedKey": "manager-north",
        "leadSeedKey": "ferreteria-europa",
        "opportunitySeedKey": "ferreteria-rollout",
        "activityType": "tarea",
        "title": "Levantar sucursales y almacenes",
        "customerName": "Ferretería Europa",
        "dueAt": "2026-09-04T14:00:00Z",
        "createdAt": "2026-09-01T14:10:00Z",
        "updatedAt": "2026-09-01T14:10:00Z"
      },
      {
        "seedKey": "crossfit-intro-email",
        "branchCode": "EAST",
        "assignedUserSeedKey": "seller-east",
        "leadSeedKey": "crossfit-oriente",
        "activityType": "email",
        "title": "Correo de presentación",
        "description": "Presentar membresías, reservas y cobros recurrentes.",
        "customerName": "CrossFit Oriente",
        "dueAt": "2026-09-02T13:00:00Z",
        "createdAt": "2026-09-01T12:10:00Z",
        "updatedAt": "2026-09-01T12:10:00Z"
      },
      {
        "seedKey": "autolavado-closed-note",
        "branchCode": "DOWNTOWN",
        "assignedUserSeedKey": "seller-center",
        "leadSeedKey": "autolavado-27",
        "activityType": "nota",
        "title": "Lead pausado por presupuesto",
        "description": "Retomar en el próximo trimestre.",
        "customerName": "Autolavado 27",
        "completedAt": "2026-08-26T19:00:00Z",
        "createdAt": "2026-08-26T19:00:00Z",
        "updatedAt": "2026-08-26T19:00:00Z"
      }
    ]
  },
  "employees": {
    "items": [
      {
        "seedKey": "emp-1",
        "employeeNumber": "EMP-001",
        "firstName": "Leonedis",
        "lastName": "Hamburgo",
        "email": "leonedis@charm.example",
        "phone": "8095550100",
        "position": "Director General",
        "department": "Administración",
        "contractType": "Indefinido",
        "hireDate": "2020-01-15",
        "branchCodes": [
          "DOWNTOWN",
          "NORTH",
          "EAST"
        ],
        "userSeedKey": "admin",
        "futureHr": {
          "initialSalary": 75000,
          "salary": 85000,
          "vacationDays": 15,
          "bankName": "Banco Popular",
          "bankAccountType": "ahorro",
          "bankAccountNumber": "****4521",
          "bankDocument": "00112345678"
        }
      },
      {
        "seedKey": "emp-2",
        "employeeNumber": "EMP-002",
        "firstName": "Starling",
        "lastName": "Subervi",
        "email": "starling@charm.example",
        "phone": "8096168273",
        "position": "Supervisor",
        "department": "Operaciones",
        "contractType": "Indefinido",
        "hireDate": "2021-03-10",
        "branchCodes": [
          "DOWNTOWN"
        ],
        "supervisorSeedKeys": [
          "emp-1"
        ],
        "futureHr": {
          "initialSalary": 38000,
          "salary": 45000,
          "vacationDays": 15,
          "bankName": "Banreservas",
          "bankAccountType": "ahorro",
          "bankAccountNumber": "****8832",
          "bankDocument": "40298765432"
        }
      },
      {
        "seedKey": "emp-3",
        "employeeNumber": "EMP-003",
        "firstName": "Jefferson",
        "lastName": "Ramírez",
        "email": "jefferson@charm.example",
        "phone": "8095551020",
        "position": "Barbero",
        "department": "Operaciones",
        "contractType": "Indefinido",
        "hireDate": "2022-06-01",
        "branchCodes": [
          "DOWNTOWN"
        ],
        "supervisorSeedKeys": [
          "emp-2",
          "emp-1"
        ],
        "futureHr": {
          "initialSalary": 24000,
          "salary": 28000,
          "vacationDays": 10
        }
      },
      {
        "seedKey": "emp-4",
        "employeeNumber": "EMP-004",
        "firstName": "Loreinni",
        "lastName": "Rosario",
        "email": "loreinni@charm.example",
        "phone": "8295551030",
        "position": "Asistente De Barbero",
        "department": "Operaciones",
        "contractType": "Indefinido",
        "hireDate": "2023-01-20",
        "branchCodes": [
          "NORTH"
        ],
        "supervisorSeedKeys": [
          "emp-2"
        ],
        "futureHr": {
          "initialSalary": 20000,
          "salary": 22000,
          "vacationDays": 12
        }
      },
      {
        "seedKey": "emp-5",
        "employeeNumber": "EMP-005",
        "firstName": "Jasmin",
        "lastName": "Fernández",
        "email": "jasmin@charm.example",
        "phone": "8495551040",
        "position": "Recepcionista",
        "department": "Administración",
        "contractType": "Indefinido",
        "hireDate": "2021-08-05",
        "branchCodes": [
          "DOWNTOWN"
        ],
        "supervisorSeedKeys": [
          "emp-1"
        ],
        "userSeedKey": "manager-north",
        "futureHr": {
          "initialSalary": 22000,
          "salary": 25000,
          "vacationDays": 15
        }
      },
      {
        "seedKey": "emp-6",
        "employeeNumber": "EMP-006",
        "firstName": "Yocarlin",
        "lastName": "Charlotte",
        "email": "yocarlin@charm.example",
        "phone": "8095551050",
        "position": "Especialista Laser",
        "department": "Laser",
        "contractType": "Indefinido",
        "hireDate": "2022-11-12",
        "branchCodes": [
          "DOWNTOWN",
          "EAST"
        ],
        "supervisorSeedKeys": [
          "emp-1"
        ],
        "futureHr": {
          "initialSalary": 30000,
          "salary": 35000,
          "vacationDays": 8,
          "bankName": "BHD",
          "bankAccountType": "corriente",
          "bankAccountNumber": "****1190",
          "bankDocument": "22300111222"
        }
      },
      {
        "seedKey": "emp-7",
        "employeeNumber": "EMP-007",
        "firstName": "Emperatriz",
        "lastName": "Gomez",
        "email": "emperatriz@charm.example",
        "phone": "8095551060",
        "position": "Asistente De Barbero",
        "department": "Operaciones",
        "contractType": "Indefinido",
        "hireDate": "2023-04-18",
        "branchCodes": [
          "DOWNTOWN"
        ],
        "supervisorSeedKeys": [
          "emp-2"
        ],
        "futureHr": {
          "initialSalary": 18000,
          "salary": 20000,
          "vacationDays": 15
        }
      },
      {
        "seedKey": "emp-8",
        "employeeNumber": "EMP-008",
        "firstName": "Carlos",
        "lastName": "Méndez",
        "email": "carlos@charm.example",
        "phone": "8095551070",
        "position": "Cajero",
        "department": "Ventas",
        "contractType": "Indefinido",
        "hireDate": "2022-02-28",
        "branchCodes": [
          "DOWNTOWN"
        ],
        "supervisorSeedKeys": [
          "emp-1"
        ],
        "userSeedKey": "cashier",
        "futureHr": {
          "initialSalary": 21000,
          "salary": 24000,
          "vacationDays": 10
        }
      },
      {
        "seedKey": "emp-9",
        "employeeNumber": "EMP-009",
        "firstName": "Ana",
        "lastName": "Jiménez",
        "email": "ana@charm.example",
        "phone": "8095551080",
        "position": "Vendedora",
        "department": "Ventas",
        "contractType": "Indefinido",
        "hireDate": "2023-07-01",
        "branchCodes": [
          "EAST"
        ],
        "supervisorSeedKeys": [
          "emp-1"
        ],
        "userSeedKey": "seller-east",
        "futureHr": {
          "initialSalary": 20000,
          "salary": 23000,
          "vacationDays": 12
        }
      },
      {
        "seedKey": "emp-10",
        "employeeNumber": "EMP-010",
        "firstName": "Fiordaliza",
        "lastName": "Peña",
        "email": "fiordaliza@charm.example",
        "phone": "8095551090",
        "position": "Estilista",
        "department": "Operaciones",
        "contractType": "Indefinido",
        "hireDate": "2020-09-15",
        "branchCodes": [
          "NORTH"
        ],
        "supervisorSeedKeys": [
          "emp-2"
        ],
        "status": "inactive",
        "futureHr": {
          "initialSalary": 24000,
          "salary": 26000,
          "vacationDays": 0
        }
      },
      {
        "seedKey": "emp-11",
        "employeeNumber": "EMP-011",
        "firstName": "María",
        "lastName": "López",
        "email": "maria.rrhh@charm.example",
        "phone": "8095551100",
        "position": "Analista RRHH",
        "department": "Recursos Humanos",
        "contractType": "Indefinido",
        "hireDate": "2021-05-20",
        "branchCodes": [
          "DOWNTOWN"
        ],
        "supervisorSeedKeys": [
          "emp-1"
        ],
        "futureHr": {
          "initialSalary": 34000,
          "salary": 38000,
          "vacationDays": 15
        }
      },
      {
        "seedKey": "emp-12",
        "employeeNumber": "EMP-012",
        "firstName": "Pedro",
        "lastName": "Santos",
        "email": "pedro@charm.example",
        "phone": "8095551110",
        "position": "Contador",
        "department": "Finanzas",
        "contractType": "Indefinido",
        "hireDate": "2019-11-01",
        "branchCodes": [
          "DOWNTOWN",
          "NORTH"
        ],
        "supervisorSeedKeys": [
          "emp-1"
        ],
        "futureHr": {
          "initialSalary": 38000,
          "salary": 42000,
          "vacationDays": 14
        }
      },
      {
        "seedKey": "emp-13",
        "employeeNumber": "EMP-013",
        "firstName": "Yafreisy",
        "lastName": "Rodríguez",
        "email": "yafreisy@charm.example",
        "phone": "8095551120",
        "position": "Especialista Laser",
        "department": "Laser",
        "contractType": "Indefinido",
        "hireDate": "2023-09-01",
        "branchCodes": [
          "DOWNTOWN"
        ],
        "supervisorSeedKeys": [
          "emp-1"
        ],
        "workSchedule": {
          "mon": [
            {
              "start": "08:00",
              "end": "10:00"
            },
            {
              "start": "14:00",
              "end": "16:00"
            },
            {
              "start": "17:00",
              "end": "19:00"
            }
          ],
          "tue": [
            {
              "start": "08:00",
              "end": "10:00"
            },
            {
              "start": "14:00",
              "end": "16:00"
            },
            {
              "start": "17:00",
              "end": "19:00"
            }
          ],
          "wed": [
            {
              "start": "08:00",
              "end": "10:00"
            },
            {
              "start": "14:00",
              "end": "16:00"
            },
            {
              "start": "17:00",
              "end": "19:00"
            }
          ],
          "thu": [
            {
              "start": "08:00",
              "end": "10:00"
            },
            {
              "start": "14:00",
              "end": "16:00"
            },
            {
              "start": "17:00",
              "end": "19:00"
            }
          ],
          "fri": [
            {
              "start": "08:00",
              "end": "10:00"
            },
            {
              "start": "14:00",
              "end": "16:00"
            },
            {
              "start": "17:00",
              "end": "19:00"
            }
          ],
          "sat": [],
          "sun": []
        },
        "futureHr": {
          "initialSalary": 28000,
          "salary": 32000,
          "vacationDays": 10
        }
      }
    ]
  },
  "hr": {
    "leaveRequests": [
      {
        "seedKey": "leave-1",
        "employeeSeedKey": "emp-1",
        "startDate": "2026-09-14",
        "endDate": "2026-09-18",
        "reason": "Vacaciones familiares",
        "status": "aprobada",
        "requestedByUserSeedKey": "admin",
        "reviewedByUserSeedKey": "admin",
        "reviewedAt": "2026-08-22T14:00:00Z"
      },
      {
        "seedKey": "leave-2",
        "employeeSeedKey": "emp-5",
        "startDate": "2026-09-04",
        "endDate": "2026-09-06",
        "reason": "Asuntos personales",
        "status": "pendiente",
        "requestedByUserSeedKey": "manager-north"
      }
    ],
    "debts": [
      {
        "seedKey": "debt-1",
        "employeeSeedKey": "emp-3",
        "concept": "Adelanto de comisión",
        "clientName": "Cliente VIP",
        "amount": 5000,
        "createdByUserSeedKey": "admin",
        "payments": [
          {
            "seedKey": "debt-payment-1",
            "amount": 2000,
            "paidOn": "2026-08-25",
            "receivedByUserSeedKey": "admin"
          }
        ]
      },
      {
        "seedKey": "debt-2",
        "employeeSeedKey": "emp-7",
        "concept": "Préstamo interno",
        "amount": 8000,
        "createdByUserSeedKey": "admin",
        "payments": []
      }
    ],
    "documents": []
  },
  "pos": {
    "registers": [
      {
        "seedKey": "hq-current",
        "branchCode": "HQ",
        "openedByUserSeedKey": "cashier",
        "openingCash": 5000,
        "openedAt": "2026-09-01T12:00:00Z",
        "status": "open",
        "notes": "Turno operativo actual para pruebas integrales del POS."
      },
      {
        "seedKey": "north-aug31",
        "branchCode": "NORTH",
        "openedByUserSeedKey": "manager-north",
        "openingCash": 3500,
        "openedAt": "2026-08-31T12:00:00Z",
        "status": "closed",
        "notes": "Turno histórico con diferencia positiva de arqueo.",
        "closedByUserSeedKey": "manager-north",
        "closedAt": "2026-08-31T22:00:00Z",
        "closingDifference": 50
      },
      {
        "seedKey": "downtown-aug30",
        "branchCode": "DOWNTOWN",
        "openedByUserSeedKey": "manager-center",
        "openingCash": 4500,
        "openedAt": "2026-08-30T13:00:00Z",
        "status": "closed",
        "notes": "Turno histórico con faltante documentado.",
        "closedByUserSeedKey": "manager-center",
        "closedAt": "2026-08-30T23:00:00Z",
        "closingDifference": -75
      },
      {
        "seedKey": "east-aug29",
        "branchCode": "EAST",
        "openedByUserSeedKey": "admin",
        "openingCash": 3000,
        "openedAt": "2026-08-29T14:00:00Z",
        "status": "closed",
        "notes": "Turno histórico cuadrado.",
        "closedByUserSeedKey": "admin",
        "closedAt": "2026-08-29T22:00:00Z",
        "closingDifference": 0
      }
    ],
    "quotes": [
      {
        "seedKey": "hq-open-vip",
        "documentNumber": "COT-99000001",
        "branchCode": "HQ",
        "customerSeedKey": "c1",
        "createdByUserSeedKey": "manager-north",
        "kind": "quote",
        "status": "open",
        "paymentMethodSeedKey": "card",
        "lines": [
          {
            "itemSeedKey": "full-body-vip-package-12",
            "quantity": 1
          }
        ],
        "discountType": "percent",
        "discountValue": 5,
        "notes": "Propuesta VIP válida por cinco días.",
        "expiresAt": "2026-09-06T03:59:59Z",
        "createdAt": "2026-09-01T12:20:00Z",
        "updatedAt": "2026-09-01T12:20:00Z"
      },
      {
        "seedKey": "hq-held-counter",
        "documentNumber": "COT-99000002",
        "branchCode": "HQ",
        "createdByUserSeedKey": "cashier",
        "kind": "held",
        "status": "open",
        "lines": [
          {
            "itemSeedKey": "face-session",
            "quantity": 1
          },
          {
            "itemSeedKey": "spf50-sunscreen",
            "quantity": 1
          }
        ],
        "notes": "Carrito retenido de cliente mostrador.",
        "expiresAt": "2026-09-02T03:59:59Z",
        "createdAt": "2026-09-01T13:05:00Z",
        "updatedAt": "2026-09-01T13:05:00Z"
      },
      {
        "seedKey": "north-open-package",
        "documentNumber": "COT-99000003",
        "branchCode": "NORTH",
        "customerSeedKey": "c3",
        "createdByUserSeedKey": "manager-north",
        "kind": "quote",
        "status": "open",
        "paymentMethodSeedKey": "credit",
        "lines": [
          {
            "itemSeedKey": "full-body-package-12",
            "quantity": 1
          }
        ],
        "notes": "Cotización pendiente de aprobación del cliente.",
        "expiresAt": "2026-09-08T03:59:59Z",
        "createdAt": "2026-08-31T15:10:00Z",
        "updatedAt": "2026-08-31T15:10:00Z"
      },
      {
        "seedKey": "east-expired-retail",
        "documentNumber": "COT-99000004",
        "branchCode": "EAST",
        "customerSeedKey": "c5",
        "createdByUserSeedKey": "seller-east",
        "kind": "quote",
        "origin": "crm",
        "opportunitySeedKey": "carla-retail",
        "crmStatus": "vencida",
        "status": "expired",
        "paymentMethodSeedKey": "card",
        "lines": [
          {
            "itemSeedKey": "upper-lip-session",
            "quantity": 1
          },
          {
            "itemSeedKey": "vitamin-c-serum",
            "quantity": 1
          }
        ],
        "expiresAt": "2026-08-31T03:59:59Z",
        "createdAt": "2026-08-28T16:30:00Z",
        "updatedAt": "2026-08-31T04:00:00Z",
        "closedAt": "2026-08-31T04:00:00Z"
      },
      {
        "seedKey": "downtown-converted-package",
        "documentNumber": "COT-99000005",
        "branchCode": "DOWNTOWN",
        "customerSeedKey": "c2",
        "createdByUserSeedKey": "seller-center",
        "kind": "quote",
        "origin": "crm",
        "opportunitySeedKey": "jose-package",
        "crmStatus": "aceptada",
        "status": "converted",
        "paymentMethodSeedKey": "cash",
        "lines": [
          {
            "itemSeedKey": "brazilian-package-12",
            "quantity": 1
          }
        ],
        "notes": "Cotización convertida en venta durante el turno.",
        "expiresAt": "2026-09-03T03:59:59Z",
        "createdAt": "2026-08-29T17:30:00Z",
        "updatedAt": "2026-08-30T14:00:00Z",
        "closedAt": "2026-08-30T14:00:00Z"
      },
      {
        "seedKey": "downtown-cancelled-vip",
        "documentNumber": "COT-99000006",
        "branchCode": "DOWNTOWN",
        "customerSeedKey": "c4",
        "createdByUserSeedKey": "seller-center",
        "kind": "quote",
        "status": "cancelled",
        "paymentMethodSeedKey": "card",
        "lines": [
          {
            "itemSeedKey": "full-body-vip-package-12",
            "quantity": 1
          }
        ],
        "notes": "Cliente solicitó cancelar la propuesta comercial.",
        "expiresAt": "2026-09-04T03:59:59Z",
        "createdAt": "2026-08-29T18:00:00Z",
        "updatedAt": "2026-08-29T19:15:00Z",
        "closedAt": "2026-08-29T19:15:00Z"
      }
    ],
    "sales": [
      {
        "seedKey": "hq-cash-counter",
        "saleNumber": "VTA-99000001",
        "branchCode": "HQ",
        "registerSeedKey": "hq-current",
        "paymentMethodSeedKey": "cash",
        "soldByUserSeedKey": "cashier",
        "lines": [
          {
            "itemSeedKey": "face-session",
            "quantity": 1
          },
          {
            "itemSeedKey": "coca-cola",
            "quantity": 2
          }
        ],
        "notes": "Venta combinada de servicio y consumo de recepción.",
        "completedAt": "2026-09-01T12:30:00Z"
      },
      {
        "seedKey": "hq-card-skin-care",
        "saleNumber": "VTA-99000002",
        "branchCode": "HQ",
        "registerSeedKey": "hq-current",
        "customerSeedKey": "c1",
        "paymentMethodSeedKey": "card",
        "soldByUserSeedKey": "cashier",
        "lines": [
          {
            "itemSeedKey": "spf50-sunscreen",
            "quantity": 1
          },
          {
            "itemSeedKey": "vitamin-c-serum",
            "quantity": 1
          }
        ],
        "discountType": "percent",
        "discountValue": 5,
        "paymentReference": "CARD-483921",
        "notes": "Kit de cuidado posterior con descuento de fidelidad.",
        "completedAt": "2026-09-01T13:15:00Z"
      },
      {
        "seedKey": "hq-credit-cycle",
        "saleNumber": "VTA-99000003",
        "branchCode": "HQ",
        "registerSeedKey": "hq-current",
        "customerSeedKey": "c1",
        "paymentMethodSeedKey": "credit",
        "soldByUserSeedKey": "cashier",
        "lines": [
          {
            "itemSeedKey": "remaining-cycle-half",
            "quantity": 1
          }
        ],
        "notes": "Saldo de ciclo financiado a siete días.",
        "completedAt": "2026-09-01T13:40:00Z",
        "receivableDueDate": "2026-09-08",
        "receivableReference": "PLAN-CICLO-01",
        "receivableNotes": "Contactar al cliente dos días antes del vencimiento."
      },
      {
        "seedKey": "hq-transfer-retail",
        "saleNumber": "VTA-99000004",
        "branchCode": "HQ",
        "registerSeedKey": "hq-current",
        "customerSeedKey": "c1",
        "paymentMethodSeedKey": "transfer",
        "soldByUserSeedKey": "cashier",
        "lines": [
          {
            "itemSeedKey": "vitamin-c-serum",
            "quantity": 1
          }
        ],
        "paymentReference": "TRX-PEND-8821",
        "notes": "Transferencia pendiente con abono posterior.",
        "completedAt": "2026-09-01T14:10:00Z",
        "receivableDueDate": "2026-09-03",
        "receivableReference": "TRX-PEND-8821",
        "receivablePayments": [
          {
            "seedKey": "card-deposit",
            "paymentMethodSeedKey": "card",
            "receivedByUserSeedKey": "cashier",
            "amount": 500,
            "reference": "CARD-ABONO-201",
            "note": "Abono confirmado en recepción.",
            "postedAt": "2026-09-01T15:00:00Z"
          }
        ]
      },
      {
        "seedKey": "hq-voided-cash-product",
        "saleNumber": "VTA-99000005",
        "branchCode": "HQ",
        "registerSeedKey": "hq-current",
        "paymentMethodSeedKey": "cash",
        "soldByUserSeedKey": "cashier",
        "lines": [
          {
            "itemSeedKey": "hamburger",
            "quantity": 1
          }
        ],
        "completedAt": "2026-09-01T14:30:00Z",
        "status": "voided",
        "voidedAt": "2026-09-01T14:38:00Z",
        "voidedByUserSeedKey": "admin",
        "voidReason": "Artículo cargado por error; efectivo devuelto al cliente."
      },
      {
        "seedKey": "north-cash-treatment",
        "saleNumber": "VTA-99000006",
        "branchCode": "NORTH",
        "registerSeedKey": "north-aug31",
        "customerSeedKey": "c3",
        "paymentMethodSeedKey": "cash",
        "soldByUserSeedKey": "manager-north",
        "lines": [
          {
            "itemSeedKey": "full-legs-session",
            "quantity": 1
          },
          {
            "itemSeedKey": "red-bull",
            "quantity": 2
          }
        ],
        "completedAt": "2026-08-31T13:10:00Z"
      },
      {
        "seedKey": "north-card-facial",
        "saleNumber": "VTA-99000007",
        "branchCode": "NORTH",
        "registerSeedKey": "north-aug31",
        "customerSeedKey": "c3",
        "paymentMethodSeedKey": "card",
        "soldByUserSeedKey": "manager-north",
        "lines": [
          {
            "itemSeedKey": "hydrating-facial",
            "quantity": 1
          }
        ],
        "discountType": "percent",
        "discountValue": 10,
        "paymentReference": "CARD-771204",
        "completedAt": "2026-08-31T14:20:00Z"
      },
      {
        "seedKey": "north-credit-face-package",
        "saleNumber": "VTA-99000008",
        "branchCode": "NORTH",
        "registerSeedKey": "north-aug31",
        "customerSeedKey": "c3",
        "paymentMethodSeedKey": "credit",
        "soldByUserSeedKey": "manager-north",
        "lines": [
          {
            "itemSeedKey": "full-face-package-12",
            "quantity": 1
          }
        ],
        "completedAt": "2026-08-31T15:00:00Z",
        "receivableDueDate": "2026-09-10",
        "receivableNotes": "Plan de pagos acordado con recepción.",
        "receivablePayments": [
          {
            "seedKey": "cash-reversed",
            "paymentMethodSeedKey": "cash",
            "receivedByUserSeedKey": "manager-north",
            "amount": 1000,
            "reference": "REC-ERR-01",
            "note": "Pago registrado en cuenta equivocada.",
            "postedAt": "2026-08-31T16:00:00Z",
            "status": "reversed",
            "reversedAt": "2026-08-31T16:08:00Z",
            "reversedByUserSeedKey": "manager-north",
            "reversalReason": "Se corrigió la cuenta del cliente."
          },
          {
            "seedKey": "cash-valid",
            "paymentMethodSeedKey": "cash",
            "receivedByUserSeedKey": "manager-north",
            "amount": 1500,
            "reference": "REC-ABONO-02",
            "note": "Primer abono válido.",
            "postedAt": "2026-08-31T16:15:00Z"
          }
        ]
      },
      {
        "seedKey": "north-credit-voided",
        "saleNumber": "VTA-99000009",
        "branchCode": "NORTH",
        "registerSeedKey": "north-aug31",
        "customerSeedKey": "c3",
        "paymentMethodSeedKey": "credit",
        "soldByUserSeedKey": "manager-north",
        "lines": [
          {
            "itemSeedKey": "full-legs-session",
            "quantity": 1
          }
        ],
        "completedAt": "2026-08-31T17:10:00Z",
        "status": "voided",
        "voidedAt": "2026-08-31T17:25:00Z",
        "voidedByUserSeedKey": "manager-north",
        "voidReason": "Cliente cambió el servicio antes de iniciar.",
        "receivableDueDate": "2026-09-05"
      },
      {
        "seedKey": "downtown-cash-package",
        "saleNumber": "VTA-99000010",
        "branchCode": "DOWNTOWN",
        "registerSeedKey": "downtown-aug30",
        "customerSeedKey": "c2",
        "quoteSeedKey": "downtown-converted-package",
        "paymentMethodSeedKey": "cash",
        "soldByUserSeedKey": "seller-center",
        "lines": [
          {
            "itemSeedKey": "brazilian-package-12",
            "quantity": 1
          }
        ],
        "completedAt": "2026-08-30T14:00:00Z"
      },
      {
        "seedKey": "downtown-transfer-session",
        "saleNumber": "VTA-99000011",
        "branchCode": "DOWNTOWN",
        "registerSeedKey": "downtown-aug30",
        "customerSeedKey": "c4",
        "paymentMethodSeedKey": "transfer",
        "soldByUserSeedKey": "seller-center",
        "lines": [
          {
            "itemSeedKey": "underarm-session",
            "quantity": 1
          },
          {
            "itemSeedKey": "upper-lip-session",
            "quantity": 1
          }
        ],
        "paymentReference": "TRX-440192",
        "completedAt": "2026-08-30T15:20:00Z",
        "receivableDueDate": "2026-09-02",
        "receivableReference": "TRX-440192",
        "receivableNotes": "Validar comprobante bancario antes de confirmar."
      },
      {
        "seedKey": "downtown-card-vip",
        "saleNumber": "VTA-99000012",
        "branchCode": "DOWNTOWN",
        "registerSeedKey": "downtown-aug30",
        "customerSeedKey": "c4",
        "paymentMethodSeedKey": "card",
        "soldByUserSeedKey": "seller-center",
        "lines": [
          {
            "itemSeedKey": "full-body-vip-package-12",
            "quantity": 1
          }
        ],
        "discountType": "fixed",
        "discountValue": 1000,
        "paymentReference": "CARD-994201",
        "completedAt": "2026-08-30T17:45:00Z"
      },
      {
        "seedKey": "downtown-cash-retail",
        "saleNumber": "VTA-99000013",
        "branchCode": "DOWNTOWN",
        "registerSeedKey": "downtown-aug30",
        "paymentMethodSeedKey": "cash",
        "soldByUserSeedKey": "seller-center",
        "lines": [
          {
            "itemSeedKey": "milk-cream",
            "quantity": 1
          },
          {
            "itemSeedKey": "coca-cola",
            "quantity": 2
          }
        ],
        "completedAt": "2026-08-30T19:05:00Z"
      },
      {
        "seedKey": "east-cash-face",
        "saleNumber": "VTA-99000014",
        "branchCode": "EAST",
        "registerSeedKey": "east-aug29",
        "customerSeedKey": "c5",
        "paymentMethodSeedKey": "cash",
        "soldByUserSeedKey": "seller-east",
        "lines": [
          {
            "itemSeedKey": "face-session",
            "quantity": 1
          },
          {
            "itemSeedKey": "spf50-sunscreen",
            "quantity": 1
          }
        ],
        "completedAt": "2026-08-29T15:10:00Z"
      },
      {
        "seedKey": "east-credit-promo",
        "saleNumber": "VTA-99000015",
        "branchCode": "EAST",
        "registerSeedKey": "east-aug29",
        "customerSeedKey": "c5",
        "paymentMethodSeedKey": "credit",
        "soldByUserSeedKey": "seller-east",
        "lines": [
          {
            "itemSeedKey": "two-full-body-half-package",
            "quantity": 1
          }
        ],
        "completedAt": "2026-08-29T16:00:00Z",
        "receivableDueDate": "2026-09-15",
        "receivableNotes": "Cuenta pagada en dos cargos de tarjeta.",
        "receivablePayments": [
          {
            "seedKey": "card-first",
            "paymentMethodSeedKey": "card",
            "receivedByUserSeedKey": "admin",
            "amount": 6000,
            "reference": "CARD-EAST-601",
            "postedAt": "2026-08-29T17:00:00Z"
          },
          {
            "seedKey": "card-final",
            "paymentMethodSeedKey": "card",
            "receivedByUserSeedKey": "admin",
            "amount": 8160,
            "reference": "CARD-EAST-602",
            "postedAt": "2026-08-29T17:05:00Z"
          }
        ]
      },
      {
        "seedKey": "east-card-lip-retail",
        "saleNumber": "VTA-99000016",
        "branchCode": "EAST",
        "registerSeedKey": "east-aug29",
        "customerSeedKey": "c4",
        "paymentMethodSeedKey": "card",
        "soldByUserSeedKey": "seller-east",
        "lines": [
          {
            "itemSeedKey": "upper-lip-session",
            "quantity": 1
          },
          {
            "itemSeedKey": "coca-cola",
            "quantity": 1
          }
        ],
        "paymentReference": "CARD-EAST-774",
        "completedAt": "2026-08-29T18:30:00Z"
      }
    ],
    "cashAdjustments": [
      {
        "seedKey": "hq-extra-change",
        "registerSeedKey": "hq-current",
        "createdByUserSeedKey": "cashier",
        "movementType": "income",
        "amount": 500,
        "concept": "Fondo adicional de cambio",
        "reference": "ADM-HQ-001",
        "createdAt": "2026-09-01T12:10:00Z"
      },
      {
        "seedKey": "hq-courier",
        "registerSeedKey": "hq-current",
        "createdByUserSeedKey": "cashier",
        "movementType": "expense",
        "amount": 350,
        "concept": "Servicio de mensajería",
        "reference": "CAJA-HQ-002",
        "createdAt": "2026-09-01T13:45:00Z"
      },
      {
        "seedKey": "north-supplies",
        "registerSeedKey": "north-aug31",
        "createdByUserSeedKey": "manager-north",
        "movementType": "expense",
        "amount": 600,
        "concept": "Compra menor de agua e hielo",
        "reference": "CAJA-NOR-014",
        "createdAt": "2026-08-31T18:00:00Z"
      },
      {
        "seedKey": "downtown-extra-change",
        "registerSeedKey": "downtown-aug30",
        "createdByUserSeedKey": "manager-center",
        "movementType": "income",
        "amount": 1000,
        "concept": "Refuerzo de efectivo para cambio",
        "reference": "ADM-DOW-007",
        "createdAt": "2026-08-30T13:30:00Z"
      },
      {
        "seedKey": "east-transport",
        "registerSeedKey": "east-aug29",
        "createdByUserSeedKey": "admin",
        "movementType": "expense",
        "amount": 275,
        "concept": "Transporte de paquete a sucursal",
        "reference": "CAJA-EAS-003",
        "createdAt": "2026-08-29T20:00:00Z"
      }
    ]
  },
  "finance": {
    "budgets": [
      {
        "seedKey": "north-marketing",
        "branchCode": "NORTH",
        "name": "Marketing",
        "group": "marketing",
        "monthlyLimit": 18000,
        "createdAt": "2026-07-01T13:00:00Z"
      },
      {
        "seedKey": "north-operations",
        "branchCode": "NORTH",
        "name": "Operaciones",
        "group": "operaciones",
        "monthlyLimit": 42000,
        "createdAt": "2026-07-01T13:05:00Z"
      },
      {
        "seedKey": "downtown-payroll",
        "branchCode": "DOWNTOWN",
        "name": "RH y Nómina",
        "group": "rh",
        "monthlyLimit": 135000,
        "createdAt": "2026-07-01T13:10:00Z"
      },
      {
        "seedKey": "east-infrastructure",
        "branchCode": "EAST",
        "name": "IT e Infraestructura",
        "group": "it",
        "monthlyLimit": 26000,
        "createdAt": "2026-07-01T13:15:00Z"
      }
    ],
    "expenses": [
      {
        "seedKey": "north-social-campaign",
        "branchCode": "NORTH",
        "budgetSeedKey": "north-marketing",
        "concept": "Campaña de captación en redes sociales",
        "amount": 6200,
        "category": "marketing",
        "date": "2026-09-01",
        "status": "pagado",
        "createdAt": "2026-09-01T13:20:00Z"
      },
      {
        "seedKey": "north-disposables",
        "branchCode": "NORTH",
        "budgetSeedKey": "north-operations",
        "concept": "Reposición de guantes y materiales desechables",
        "amount": 8450,
        "category": "insumos",
        "date": "2026-08-30",
        "status": "pagado",
        "createdAt": "2026-08-30T15:00:00Z"
      },
      {
        "seedKey": "north-water",
        "branchCode": "NORTH",
        "concept": "Servicio de agua de agosto",
        "amount": 2150,
        "category": "servicios",
        "date": "2026-09-01",
        "status": "pendiente",
        "createdAt": "2026-09-01T14:00:00Z"
      },
      {
        "seedKey": "downtown-equipment-maintenance",
        "branchCode": "DOWNTOWN",
        "concept": "Mantenimiento preventivo de equipos",
        "amount": 12750,
        "category": "mantenimiento",
        "date": "2026-08-28",
        "status": "pagado",
        "createdAt": "2026-08-28T16:30:00Z"
      },
      {
        "seedKey": "downtown-uniforms",
        "branchCode": "DOWNTOWN",
        "concept": "Uniformes para personal de atención",
        "amount": 9800,
        "category": "otros",
        "date": "2026-08-25",
        "status": "pagado",
        "createdAt": "2026-08-25T14:10:00Z"
      },
      {
        "seedKey": "east-router",
        "branchCode": "EAST",
        "budgetSeedKey": "east-infrastructure",
        "concept": "Router empresarial y puntos de acceso",
        "amount": 22400,
        "category": "servicios",
        "date": "2026-08-27",
        "status": "pagado",
        "createdAt": "2026-08-27T18:00:00Z"
      }
    ],
    "fixedExpenses": [
      {
        "seedKey": "north-rent",
        "branchCode": "NORTH",
        "concept": "Alquiler del local",
        "amount": 48000,
        "category": "alquiler",
        "dayOfMonth": 1,
        "payments": [
          {
            "seedKey": "north-rent-2026-09",
            "period": "2026-09-01",
            "paidOn": "2026-09-01",
            "createdAt": "2026-09-01T12:30:00Z"
          }
        ],
        "createdAt": "2026-06-01T12:00:00Z"
      },
      {
        "seedKey": "north-connectivity",
        "branchCode": "NORTH",
        "concept": "Internet empresarial y telefonía",
        "amount": 4200,
        "category": "servicios",
        "dayOfMonth": 5,
        "payments": [],
        "createdAt": "2026-06-01T12:05:00Z"
      },
      {
        "seedKey": "downtown-rent",
        "branchCode": "DOWNTOWN",
        "concept": "Alquiler sucursal centro",
        "amount": 62000,
        "category": "alquiler",
        "dayOfMonth": 1,
        "payments": [
          {
            "seedKey": "downtown-rent-2026-09",
            "period": "2026-09-01",
            "paidOn": "2026-09-01",
            "createdAt": "2026-09-01T12:45:00Z"
          }
        ],
        "createdAt": "2026-06-01T12:10:00Z"
      },
      {
        "seedKey": "east-electricity",
        "branchCode": "EAST",
        "concept": "Energía eléctrica estimada",
        "amount": 18500,
        "category": "servicios",
        "dayOfMonth": 10,
        "payments": [
          {
            "seedKey": "east-electricity-2026-08",
            "period": "2026-08-01",
            "paidOn": "2026-08-10",
            "createdAt": "2026-08-10T15:00:00Z"
          }
        ],
        "createdAt": "2026-06-01T12:15:00Z"
      }
    ],
    "liabilities": [
      {
        "seedKey": "north-renovation-loan",
        "branchCode": "NORTH",
        "name": "Préstamo adecuación sucursal",
        "type": "prestamo",
        "initialAmount": 950000,
        "pendingAmount": 684250,
        "payDay": 5,
        "cutDay": null,
        "installment": 31750,
        "paidInstallments": 9,
        "totalInstallments": 36,
        "categoryIds": [
          "alquiler",
          "mantenimiento"
        ],
        "createdAt": "2025-12-05T13:00:00Z"
      },
      {
        "seedKey": "north-business-card",
        "branchCode": "NORTH",
        "name": "Tarjeta corporativa Popular",
        "type": "tarjeta",
        "initialAmount": 250000,
        "pendingAmount": 73580,
        "payDay": 22,
        "cutDay": 15,
        "installment": null,
        "paidInstallments": 0,
        "totalInstallments": null,
        "categoryIds": [
          "insumos",
          "marketing"
        ],
        "createdAt": "2026-01-15T13:00:00Z"
      },
      {
        "seedKey": "downtown-equipment-loan",
        "branchCode": "DOWNTOWN",
        "name": "Financiamiento equipos especializados",
        "type": "prestamo",
        "initialAmount": 680000,
        "pendingAmount": 472000,
        "payDay": 12,
        "cutDay": null,
        "installment": 24000,
        "paidInstallments": 8,
        "totalInstallments": 30,
        "categoryIds": [
          "mantenimiento"
        ],
        "createdAt": "2026-01-12T13:00:00Z"
      }
    ],
    "accounts": [
      {
        "seedKey": "north-operating-account",
        "branchCode": "NORTH",
        "name": "Cuenta corriente operativa",
        "type": "banco",
        "bank": "Banco BHD",
        "accountNumberMasked": "****4521",
        "balance": 286450.75,
        "currency": "DOP",
        "notes": "Cobros y pagos operativos de la sucursal.",
        "createdAt": "2026-01-02T13:00:00Z"
      },
      {
        "seedKey": "downtown-operating-account",
        "branchCode": "DOWNTOWN",
        "name": "Cuenta operativa centro",
        "type": "banco",
        "bank": "Banco Popular",
        "accountNumberMasked": "****8890",
        "balance": 394820.5,
        "currency": "DOP",
        "notes": "Cuenta principal de la sucursal centro.",
        "createdAt": "2026-01-02T13:05:00Z"
      },
      {
        "seedKey": "workspace-reserve-fund",
        "branchCode": "NORTH",
        "name": "Fondo de reserva",
        "type": "inversion",
        "bank": "AFI Reservas",
        "accountNumberMasked": "****1138",
        "balance": 750000,
        "currency": "DOP",
        "notes": "Reserva para contingencias y expansión.",
        "createdAt": "2026-02-01T13:00:00Z"
      }
    ],
    "manualIncomes": [
      {
        "seedKey": "north-corporate-package",
        "branchCode": "NORTH",
        "category": "transferencia",
        "amount": 18500,
        "date": "2026-09-01",
        "customer": "Grupo Empresarial Demo",
        "source": "Formulario",
        "status": "pagado",
        "createdAt": "2026-09-01T15:30:00Z"
      },
      {
        "seedKey": "downtown-training",
        "branchCode": "DOWNTOWN",
        "category": "servicios",
        "amount": 12000,
        "date": "2026-08-29",
        "customer": "Academia Belleza Demo",
        "source": "Online",
        "status": "pagado",
        "createdAt": "2026-08-29T17:00:00Z"
      },
      {
        "seedKey": "east-event-deposit",
        "branchCode": "EAST",
        "category": "link",
        "amount": 9500,
        "date": "2026-09-01",
        "customer": "Evento Corporativo Demo",
        "source": "Online",
        "status": "pendiente",
        "createdAt": "2026-09-01T16:10:00Z"
      }
    ]
  }
})
