import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}))

vi.mock('@/services/apiClient', () => ({ apiClient: mocks }))

import { crmApi } from '@/services/crmApi'

describe('cliente API de CRM', () => {
  beforeEach(() => vi.clearAllMocks())

  it('consulta cada recurso CRM mediante su endpoint específico', async () => {
    mocks.get.mockResolvedValue({})

    await crmApi.state({ branchId: 'branch-id' })
    await crmApi.leads({ page: 1, pageSize: 200 })
    await crmApi.opportunities({ stage: 'propuesta' })
    await crmApi.activities({ completed: false })
    await crmApi.customers({ page: 2, pageSize: 25 })
    await crmApi.quotes({ status: 'enviada' })
    await crmApi.sales({ customerId: 'customer-id' })
    await crmApi.overview({ branchId: 'branch-id' })
    await crmApi.discoveryCapabilities()

    expect(mocks.get.mock.calls).toEqual([
      ['/api/v1/crm/state', { branchId: 'branch-id' }],
      ['/api/v1/crm/leads', { page: 1, pageSize: 200 }],
      ['/api/v1/crm/opportunities', { stage: 'propuesta' }],
      ['/api/v1/crm/activities', { completed: false }],
      ['/api/v1/crm/customers', { page: 2, pageSize: 25 }],
      ['/api/v1/crm/quotes', { status: 'enviada' }],
      ['/api/v1/crm/sales', { customerId: 'customer-id' }],
      ['/api/v1/crm/overview', { branchId: 'branch-id' }],
      ['/api/v1/crm/discovery/capabilities'],
    ])
  })

  it('envía mutaciones críticas con versión e idempotencia', async () => {
    mocks.post.mockResolvedValue({})
    mocks.patch.mockResolvedValue({})

    await crmApi.createLead({ name: 'Ada' }, 'lead-key')
    await crmApi.convertLead('lead-id', { version: 3 }, 'convert-key')
    await crmApi.createQuote({ customerId: 'customer-id' }, 'quote-key')
    await crmApi.updateOpportunity('opportunity-id', { version: 4, stage: 'ganado' })
    await crmApi.cancelQuote('quote-id', 5, 'Duplicada')
    await crmApi.searchDiscovery({ query: 'spa', location: 'Santo Domingo', limit: 10 })

    expect(mocks.post).toHaveBeenNthCalledWith(
      1,
      '/api/v1/crm/leads',
      { name: 'Ada' },
      { headers: { 'Idempotency-Key': 'lead-key' } }
    )
    expect(mocks.post).toHaveBeenNthCalledWith(
      2,
      '/api/v1/crm/leads/lead-id/convert',
      { version: 3 },
      { headers: { 'Idempotency-Key': 'convert-key' } }
    )
    expect(mocks.post).toHaveBeenNthCalledWith(
      3,
      '/api/v1/crm/quotes',
      { customerId: 'customer-id' },
      { headers: { 'Idempotency-Key': 'quote-key' } }
    )
    expect(mocks.patch).toHaveBeenCalledWith(
      '/api/v1/crm/opportunities/opportunity-id',
      { version: 4, stage: 'ganado' }
    )
    expect(mocks.post).toHaveBeenNthCalledWith(
      4,
      '/api/v1/crm/quotes/quote-id/cancel',
      { version: 5, reason: 'Duplicada' }
    )
    expect(mocks.post).toHaveBeenNthCalledWith(
      5,
      '/api/v1/crm/discovery/search',
      { query: 'spa', location: 'Santo Domingo', limit: 10 }
    )
  })
})
