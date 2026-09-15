import { describe, expect, it, vi } from 'vitest'
import { backofficeApi } from '@/services/backofficeApi'
import { apiClient } from '@/services/apiClient'
vi.mock('@/services/apiClient', () => ({
  apiClient: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}))

describe('Backoffice HTTP contracts', () => {
  it('envía nombres públicos de filtros y paginación', () => {
    backofficeApi.listUsers({
      workspaceId: 'w1',
      status: 'disabled',
      platformStatus: 'active',
      page: 2,
      pageSize: 50,
    })
    const url = new URL(apiClient.get.mock.lastCall[0], 'https://example.test')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      workspaceId: 'w1',
      status: 'disabled',
      platformStatus: 'active',
      page: '2',
      pageSize: '50',
    })
  })
  it('edita memberships y suscripciones dentro del workspace elegido', () => {
    backofficeApi.updateMember('w1', 'm1', { version: 4, status: 'suspended' })
    expect(apiClient.patch).toHaveBeenLastCalledWith(
      '/api/v1/backoffice/workspaces/w1/members/m1',
      { version: 4, status: 'suspended' }
    )
    backofficeApi.updateSubscription('w1', { version: 2, status: 'active' })
    expect(apiClient.patch).toHaveBeenLastCalledWith(
      '/api/v1/backoffice/workspaces/w1/subscription',
      { version: 2, status: 'active' }
    )
  })
})
