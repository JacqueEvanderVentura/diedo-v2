import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('@/services/apiClient', () => ({ apiClient: mocks }))

import { appointmentsApi, hasAppointmentListScope } from '@/services/appointmentsApi'

describe('listAllAppointments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('hasAppointmentListScope', () => {
    it('rechaza params vacíos', () => {
      expect(hasAppointmentListScope({})).toBe(false)
    })

    it('acepta rango de fechas', () => {
      expect(hasAppointmentListScope({ dateFrom: '2026-01-01', dateTo: '2026-01-31' })).toBe(true)
    })

    it('acepta customerId', () => {
      expect(hasAppointmentListScope({ customerId: 'cust-1' })).toBe(true)
    })
  })

  it('no llama la API sin alcance (date range o customerId)', async () => {
    const result = await appointmentsApi.appointments({})

    expect(mocks.get).not.toHaveBeenCalled()
    expect(result).toEqual({ appointments: [], heldSlots: [] })
  })

  it('hace una sola página cuando totalPages es 1', async () => {
    mocks.get.mockResolvedValue({
      items: [{ id: 'a1', scheduled_date: '2026-01-15', scheduled_time: '10:00', status: 'confirmada' }],
      totalPages: 1,
      heldSlots: [],
    })

    await appointmentsApi.appointments({
      dateFrom: '2026-01-15',
      dateTo: '2026-01-15',
      branchId: 'branch-1',
    })

    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/appointments', expect.objectContaining({
      page: 1,
      pageSize: 200,
      dateFrom: '2026-01-15',
      dateTo: '2026-01-15',
      branchId: 'branch-1',
    }))
  })

  it('pagina todas las páginas solo cuando hay alcance definido', async () => {
    mocks.get.mockImplementation(async (_url, params) => ({
      items: [{ id: `p${params.page}`, scheduled_date: '2026-01-15', scheduled_time: '10:00', status: 'confirmada' }],
      totalPages: 3,
      heldSlots: [],
    }))

    const result = await appointmentsApi.appointments({ customerId: 'cust-1' })

    expect(mocks.get).toHaveBeenCalledTimes(3)
    expect(result.appointments).toHaveLength(3)
  })
})