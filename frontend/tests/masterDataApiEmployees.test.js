import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/services/apiClient', () => ({ apiClient: mocks, bindSessionHandlers: vi.fn() }))

import { masterDataApi } from '@/services/masterDataApi'

describe('lectura de empleados del directorio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recorre todas las páginas para no ocultar usuarios ya vinculados', async () => {
    mocks.get
      .mockResolvedValueOnce({ items: [{ id: 'emp-1', platformUserId: 'user-1' }], page: 1, totalPages: 2 })
      .mockResolvedValueOnce({ items: [{ id: 'emp-2', platformUserId: 'user-2' }], page: 2, totalPages: 2 })

    const items = await masterDataApi.employees()

    expect(mocks.get.mock.calls).toEqual([
      ['/api/v1/employees', { pageSize: 100, page: 1 }],
      ['/api/v1/employees', { pageSize: 100, page: 2 }],
    ])
    expect(items.map((item) => item.platformUserId)).toEqual(['user-1', 'user-2'])
  })
})
