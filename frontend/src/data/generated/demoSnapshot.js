// Generated from demo-data/v1; do not edit.
export const DEMO_SNAPSHOT = Object.freeze({
  "seedVersion": "v1",
  "schemaVersion": "20260831_0012",
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
  "iam": {
    "rolePermissions": {
      "manager": [
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
        "workspace.read",
        "legal_entity.read",
        "branch.read",
        "membership.read",
        "catalog.read",
        "inventory.read",
        "inventory.move",
        "purchasing.read",
        "purchasing.requests.create",
        "incidents.read",
        "incidents.create",
        "incidents.manage",
        "customer.read",
        "customer.manage",
        "employee.read",
        "employee.schedule.manage",
        "hr.overview.read",
        "hr.leave.request",
        "hr.leave.review",
        "appointment.read",
        "appointment.manage"
      ],
      "cashier": [
        "workspace.read",
        "branch.read",
        "catalog.read",
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
        "workspace.read",
        "branch.read",
        "catalog.read",
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
        "system": true
      },
      {
        "seedKey": "card",
        "code": "card",
        "name": "Tarjeta",
        "icon": "CreditCard",
        "enabled": true,
        "system": true
      },
      {
        "seedKey": "transfer",
        "code": "transfer",
        "name": "Transferencia",
        "icon": "Landmark",
        "enabled": true,
        "system": true
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
            "contentBase64": "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",
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
        "customerType": "person",
        "displayName": "Luis Alberto Peña",
        "firstName": "Luis Alberto",
        "lastName": "Peña",
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
  }
})
