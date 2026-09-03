import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/services/apiClient', () => ({ default: mocks, apiClient: mocks }))
vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: { getState: () => ({ status: 'online' }) },
}))

import {
  fetchAgendaReport,
  fetchAgendaSummary,
  fetchDividendReport,
  fetchExpenseCategoryReport,
  fetchGeneralSummary,
  fetchInventoryReport,
  fetchInventorySummary,
  fetchMembershipReport,
  fetchPersonalPerformanceReport,
  fetchTransactionsReport,
} from '@/services/reportApi'

describe('cliente API de Reportes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('conecta los seis submódulos a sus endpoints reales', async () => {
    mocks.get.mockImplementation(async (path) => {
      if (path.endsWith('/general/summary')) {
        return {
          totals: { income: '250.00', expenses: '75.00', balance: '175.00' },
          series: [],
          incomeDistribution: [],
        }
      }
      if (path.endsWith('/agenda/summary')) {
        return { totalAppointments: 0, weekly: [], byEmployee: [], bySource: [] }
      }
      if (path.endsWith('/inventory/summary')) {
        return { productsWithStock: 0, stock: [], valueByCategory: [], margins: [] }
      }
      if (path.endsWith('/personal')) {
        return { totals: { salesTotal: '0.00' }, byUser: [], byEmployee: [], supplyUsage: [] }
      }
      return {
        items: [],
        page: 1,
        pageSize: 10,
        totalItems: 0,
        totalPages: 1,
        summary: {},
      }
    })

    const empty = () => []
    const data = () => ({ sales: [], expenses: [], incomes: [] })
    await Promise.all([
      fetchGeneralSummary(data, { period: 'month' }),
      fetchTransactionsReport(data, { page: 1 }),
      fetchExpenseCategoryReport(empty, { page: 1 }),
      fetchMembershipReport({ page: 1 }),
      fetchAgendaSummary(empty, empty, { period: 'month' }),
      fetchAgendaReport(empty, { page: 1 }),
      fetchInventorySummary(empty, empty, {}),
      fetchInventoryReport(empty, empty, { page: 1 }),
      fetchDividendReport(empty, { page: 1, period: 'month' }),
      fetchPersonalPerformanceReport(data, { period: 'month' }),
    ])

    expect(mocks.get.mock.calls.map(([path]) => path)).toEqual(
      expect.arrayContaining([
        '/api/v1/reports/general/summary',
        '/api/v1/reports/general/transactions',
        '/api/v1/reports/general/expense-categories',
        '/api/v1/reports/memberships',
        '/api/v1/reports/agenda/summary',
        '/api/v1/reports/agenda/appointments',
        '/api/v1/reports/inventory/summary',
        '/api/v1/reports/inventory/items',
        '/api/v1/reports/dividends',
        '/api/v1/reports/personal',
      ])
    )
  })

  it('adapta paginación, decimales y estados de agenda al contrato visual', async () => {
    mocks.get.mockResolvedValue({
      items: [
        {
          id: 'appointment-id',
          status: 'no_show',
          employeeName: 'Ana Vargas',
        },
      ],
      page: 2,
      pageSize: 10,
      totalItems: 25,
      totalPages: 3,
    })

    const result = await fetchAgendaReport(() => [], {
      status: 'noshow',
      page: 2,
      pageSize: 10,
    })

    expect(mocks.get).toHaveBeenCalledWith('/api/v1/reports/agenda/appointments', {
      status: 'no_show',
      page: 2,
      pageSize: 10,
    })
    expect(result).toMatchObject({ total: 25, from: 11, to: 20, totalPages: 3 })
    expect(result.items[0].status).toBe('noshow')
  })

  it('adapta las nuevas métricas de personal y sus cantidades decimales', async () => {
    mocks.get.mockResolvedValue({
      totals: {
        salesTotal: '1250.50',
        suppliesUsed: '7.500',
        teamAverageAttended: '2.500',
        employeeIncidents: 2,
      },
      byUser: [{ id: 'user-id', salesTotal: '1250.50', avgTicket: '625.25' }],
      byEmployee: [{
        id: 'employee-id',
        revenue: '900.00',
        avgTicket: '300.00',
        attendanceVsTeamPct: '120.00',
        supplyQuantity: '7.500',
      }],
      incidentMetrics: [{ employeeId: 'employee-id', total: 2 }],
      incidentDistribution: [{ id: 'ausencia', name: 'Ausencias', value: 2 }],
      supplyUsage: [{
        employeeId: 'employee-id',
        qty: '7.500',
        perAppointment: '2.500',
      }],
    })

    const result = await fetchPersonalPerformanceReport(() => ({}), { period: 'month' })

    expect(mocks.get).toHaveBeenCalledWith('/api/v1/reports/personal', { period: 'month' })
    expect(result.totals).toMatchObject({
      salesTotal: 1250.5,
      suppliesUsed: 7.5,
      teamAverageAttended: 2.5,
      employeeIncidents: 2,
    })
    expect(result.byEmployee[0]).toMatchObject({
      attendanceVsTeamPct: 120,
      supplyQuantity: 7.5,
    })
    expect(result.supplyUsage[0]).toMatchObject({ qty: 7.5, perAppointment: 2.5 })
    expect(result.incidentMetrics).toHaveLength(1)
    expect(result.incidentDistribution).toHaveLength(1)
  })

  it('convierte importes serializados sin perder los metadatos de membresía', async () => {
    mocks.get.mockResolvedValue({
      items: [{ id: 'membership-id', amount: '1000.00' }],
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
      summary: {
        activeCount: 1,
        mrr: '1000.00',
        avgTicket: '1000.00',
        upcoming: 0,
        expired: 0,
        newThisMonth: 1,
        growthPct: '100.00',
        growth: [{ label: 'sep', value: '1000.00' }],
        plans: ['Membresía Charm'],
      },
    })

    const result = await fetchMembershipReport({ page: 1, pageSize: 10 })

    expect(result.items[0].amount).toBe(1000)
    expect(result.summary).toMatchObject({
      mrr: 1000,
      avgTicket: 1000,
      growthPct: 100,
      proximo: 0,
      vencido: 0,
      plans: ['Membresía Charm'],
    })
  })
})
