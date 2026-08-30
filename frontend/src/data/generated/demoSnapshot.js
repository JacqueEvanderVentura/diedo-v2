// Generated from demo-data/v1; do not edit.
export const DEMO_SNAPSHOT = Object.freeze({
  "seedVersion": "v1",
  "schemaVersion": "20260829_0007",
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
        "customer.read",
        "customer.manage",
        "employee.read",
        "employee.manage",
        "employee.schedule.manage"
      ],
      "supervisor": [
        "workspace.read",
        "legal_entity.read",
        "branch.read",
        "membership.read",
        "catalog.read",
        "customer.read",
        "customer.manage",
        "employee.read",
        "employee.schedule.manage"
      ],
      "cashier": [
        "workspace.read",
        "branch.read",
        "catalog.read",
        "customer.read",
        "customer.manage",
        "employee.read"
      ],
      "seller": [
        "workspace.read",
        "branch.read",
        "catalog.read",
        "customer.read",
        "customer.manage",
        "employee.read"
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
  }
})
