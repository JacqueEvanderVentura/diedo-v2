import { describe, expect, it } from 'vitest'
import { DEMO_SNAPSHOT } from '@/data/generated/demoSnapshot'
import {
  customerToApiPayload,
  employeeToApiPayload,
  mapCustomerFromDemo,
  mapEmployeeFromApi,
  mapEmployeeFromDemo,
} from '@/services/adapters/masterData'

describe('master data adapters', () => {
  it('conserva el fixture local demo sin confundirlo con una fila API', () => {
    const customer = mapCustomerFromDemo(DEMO_SNAPSHOT.customers.items[0])
    const employee = mapEmployeeFromDemo(DEMO_SNAPSHOT.employees.items[0])

    expect(customer.source).toBe('demo')
    expect(customer.branchIds).toContain('charm-dn')
    expect(employee.source).toBe('demo')
    expect(employee.salary).toBeTypeOf('number')
    expect(employee.bankName).toBeTypeOf('string')
  })

  it('mapea UUID, scope, versión y horario de una fila API', () => {
    const employee = mapEmployeeFromApi({
      id: 'employee-uuid',
      employeeNumber: 'EMP-001',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: null,
      position: 'Supervisora',
      department: 'Operaciones',
      contractType: 'Indefinido',
      hireDate: '2026-01-01',
      platformUserId: 'user-uuid',
      branches: [{ id: 'branch-uuid', code: 'MAIN', name: 'Principal' }],
      supervisorIds: [],
      schedule: { version: 3, timezone: 'America/La_Paz', week: { mon: [] } },
      status: 'active',
      version: 4,
      attachmentCount: 2,
    })

    expect(employee).toMatchObject({
      id: 'employee-uuid',
      branchIds: ['branch-uuid'],
      usuarioId: 'user-uuid',
      scheduleVersion: 3,
      version: 4,
      api: true,
    })
  })

  it('envía a fase 2 solo campos maestros y nunca salario o banca', () => {
    const customerPayload = customerToApiPayload(
      { name: 'Cliente', phone: '8095550000', customerType: 'b2c' },
      ['branch-uuid']
    )
    const employeePayload = employeeToApiPayload(
      {
        firstName: 'Ada',
        lastName: 'Lovelace',
        position: 'Especialista',
        hireDate: '2026-01-01',
        salary: 100000,
        bankAccountNumber: 'sensitive',
        workSchedule: {},
      },
      ['branch-uuid']
    )

    expect(customerPayload.branchIds).toEqual(['branch-uuid'])
    expect(employeePayload.branchIds).toEqual(['branch-uuid'])
    expect(employeePayload).not.toHaveProperty('salary')
    expect(employeePayload).not.toHaveProperty('bankAccountNumber')
  })
})
