/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/appointmentsApi', () => ({
  listAppointmentsPage: vi.fn(async () => ({
    items: [],
    totalItems: 0,
    totalPages: 1,
    page: 1,
    pageSize: 25,
  })),
}))

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector) => selector({ status: 'online' }),
}))

import { listAppointmentsPage } from '@/services/appointmentsApi'
import { useGestionCitasList } from '@/modules/agenda/hooks/useGestionCitasList'

const baseFilters = {
  search: '',
  dateFilter: { period: 'all', dateFrom: null, dateTo: null },
  employeeId: '',
  branchId: 'branch-1',
  status: '',
}

describe('useGestionCitasList', () => {
  beforeEach(() => {
    listAppointmentsPage.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('no acumula listeners de visibilitychange al cambiar filtros y los limpia al unmount', async () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    const visibilityAdds = () => add.mock.calls.filter(([type]) => type === 'visibilitychange').length
    const visibilityRemoves = () => remove.mock.calls.filter(([type]) => type === 'visibilitychange').length

    const { rerender, unmount } = renderHook(
      ({ filters }) => useGestionCitasList(filters),
      { initialProps: { filters: baseFilters } },
    )
    await act(async () => {})
    expect(visibilityAdds()).toBe(1)
    expect(visibilityRemoves()).toBe(0)

    await act(async () => {
      rerender({ filters: { ...baseFilters, search: 'ana' } })
    })
    await act(async () => {
      rerender({ filters: { ...baseFilters, search: 'ana perez' } })
    })
    await act(async () => {
      rerender({ filters: { ...baseFilters, status: 'confirmada' } })
    })

    expect(visibilityAdds()).toBe(visibilityRemoves() + 1)

    unmount()
    expect(visibilityAdds()).toBe(visibilityRemoves())

    add.mockRestore()
    remove.mockRestore()
  })
})
