import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/services/apiClient', () => ({ apiClient: mocks }))

import { purchasingApi } from '@/services/purchasingApi'

describe('cliente API de Compras', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue({ items: [], totalPages: 0 })
  })

  it('hidrata las cinco fuentes del módulo desde endpoints reales', async () => {
    await Promise.all([
      purchasingApi.listAllSuppliers(),
      purchasingApi.listAllRequests(),
      purchasingApi.getRequestStats(),
      purchasingApi.getSettings(),
      purchasingApi.listApprovers(),
    ])

    expect(mocks.get).toHaveBeenCalledWith('/api/v1/purchasing/suppliers', {
      page: 1,
      pageSize: 200,
    })
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/purchasing/requests', {
      page: 1,
      pageSize: 200,
    })
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/purchasing/requests/stats', undefined)
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/purchasing/settings')
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/purchasing/settings/approvers')
  })

  it('envía altas y transiciones a sus endpoints con idempotencia y versión', async () => {
    mocks.post.mockResolvedValue({})
    mocks.put.mockResolvedValue({})
    mocks.patch.mockResolvedValue({})
    const supplier = { name: 'Proveedor', branchIds: ['branch-id'] }
    const request = { supplierId: 'supplier-id', branchId: 'branch-id', items: [] }

    await purchasingApi.createSupplier(supplier)
    await purchasingApi.updateSupplier('supplier-id', { version: 2, name: 'Proveedor 2' })
    await purchasingApi.createRequest(request)
    await purchasingApi.reviewRequest('request-id', { version: 3, status: 'aprobada' })
    await purchasingApi.deliverRequest('request-id', { version: 4 })
    await purchasingApi.updateSettings({ version: 2, approverUserId: null, notifyOnRequest: true })

    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/purchasing/suppliers',
      supplier,
      { headers: { 'Idempotency-Key': expect.any(String) } }
    )
    expect(mocks.patch).toHaveBeenCalledWith(
      '/api/v1/purchasing/suppliers/supplier-id',
      { version: 2, name: 'Proveedor 2' }
    )
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/purchasing/requests',
      request,
      { headers: { 'Idempotency-Key': expect.any(String) } }
    )
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/purchasing/requests/request-id/review',
      { version: 3, status: 'aprobada' }
    )
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/purchasing/requests/request-id/deliver',
      { version: 4 }
    )
    expect(mocks.put).toHaveBeenCalledWith('/api/v1/purchasing/settings', {
      version: 2,
      approverUserId: null,
      notifyOnRequest: true,
    })
  })
})
