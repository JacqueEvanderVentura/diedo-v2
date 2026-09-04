import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/services/apiClient', () => ({ apiClient: mocks, bindSessionHandlers: vi.fn() }))

import { dashboardApi } from '@/services/dashboardApi'

describe('cliente API del Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get
      .mockResolvedValueOnce({ revenue: '2500.50', activeLeads: 7, appointmentsToday: 3, openTasks: 4 })
      .mockResolvedValueOnce({ total: '2500.50', points: [{ label: 'lun 1', value: '2500.50' }] })
      .mockResolvedValueOnce({ items: [{ id: 'stock-1', units: '2.000', minimumUnits: '5.000' }] })
      .mockResolvedValueOnce({ items: [{ id: 'appointment-1', status: 'confirmed' }] })
      .mockResolvedValueOnce({ items: [{ id: 'sale:1', occurredAt: '2026-09-01T12:00:00Z' }] })
  })

  it('consulta los cinco resúmenes con período y sucursal compartidos', async () => {
    const result = await dashboardApi.dashboard({ period: 'month', branchId: 'branch-id' })

    expect(mocks.get.mock.calls).toEqual([
      ['/api/v1/dashboard/summary', { period: 'month', branchId: 'branch-id' }],
      ['/api/v1/dashboard/sales-trend', { period: 'month', branchId: 'branch-id' }],
      ['/api/v1/dashboard/stock-alerts', { branchId: 'branch-id' }],
      ['/api/v1/dashboard/appointments', { branchId: 'branch-id' }],
      ['/api/v1/dashboard/activity', { period: 'month', branchId: 'branch-id', limit: 10 }],
    ])
    expect(result.summary.revenue).toBe(2500.5)
    expect(result.summary.activeLeads).toBe(7)
    expect(result.trend.points[0].value).toBe(2500.5)
    expect(result.stockAlerts[0].units).toBe(2)
    expect(result.appointments[0].status).toBe('confirmada')
  })

  it('omite branchId cuando se seleccionan todas las sucursales', async () => {
    await dashboardApi.dashboard({ period: 'today', branchId: 'all' })

    expect(mocks.get).toHaveBeenCalledWith('/api/v1/dashboard/summary', {
      period: 'today',
      branchId: undefined,
    })
  })
})
