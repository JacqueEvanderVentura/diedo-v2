import { describe, expect, it } from 'vitest'
import { mapDebt, mapDebtStats, mapDocument, mapLeaveRequest, mapOverview, mapProfile } from '@/services/hrApi'

describe('adaptadores de RRHH', () => {
  it('normaliza fichas, solicitudes y valores monetarios de la API', () => {
    expect(mapProfile({
      employeeId: 'employee-1',
      initialSalary: '30000.00',
      salary: '35000.00',
      vacationDays: 15,
      version: 3,
    })).toMatchObject({
      employeeId: 'employee-1',
      initialSalary: 30000,
      salary: 35000,
      vacationDays: 15,
      profileVersion: 3,
    })

    expect(mapLeaveRequest({
      id: 'leave-1',
      employeeId: 'employee-1',
      startDate: '2026-09-01',
      endDate: '2026-09-05',
      reason: 'Vacaciones',
      status: 'pendiente',
      version: 2,
    })).toMatchObject({ id: 'leave-1', employeeId: 'employee-1', version: 2 })

    expect(mapDebt({
      id: 'debt-1',
      employeeId: 'employee-1',
      concept: 'Adelanto',
      amount: '8000.00',
      payments: [{ id: 'payment-1', amount: '3000.00', paidOn: '2026-08-30' }],
    })).toMatchObject({
      amount: 8000,
      payments: [{ id: 'payment-1', amount: 3000, date: '2026-08-30' }],
    })
  })

  it('normaliza los KPIs y el historial de documentos', () => {
    expect(mapDebtStats({
      totalDebt: '13000.00',
      totalPaid: '2000.00',
      pending: '11000.00',
      employeesWithDebt: 2,
    })).toEqual({ totalDebt: 13000, totalPaid: 2000, pending: 11000, employeesWithDebt: 2 })

    expect(mapDocument({
      id: 'document-1',
      employeeId: 'employee-1',
      templateId: 'bancaria',
      issueDate: '2026-08-30',
      includeSalary: true,
      snapshot: { salary: '35000.00' },
    })).toMatchObject({ id: 'document-1', includeSalary: true })

    expect(mapOverview({
      totalEmployees: 13,
      activeEmployees: 12,
      approvedVacations: 1,
      pendingApprovals: 1,
      debt: { totalDebt: '13000.00', totalPaid: '2000.00', pending: '11000.00', employeesWithDebt: 2 },
      recentRequests: [{ id: 'leave-1', employeeId: 'employee-1', status: 'pendiente' }],
    })).toMatchObject({
      totalEmployees: 13,
      debt: { pending: 11000 },
      recentRequests: [{ id: 'leave-1', employeeId: 'employee-1' }],
    })
  })
})
