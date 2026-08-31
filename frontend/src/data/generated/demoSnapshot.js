// Generated from demo-data/v1; do not edit.
export const DEMO_SNAPSHOT = Object.freeze({
  "seedVersion": "v1",
  "schemaVersion": "20260831_0010",
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
