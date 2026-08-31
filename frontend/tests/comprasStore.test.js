import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listAllSuppliers: vi.fn(),
  listAllRequests: vi.fn(),
  getRequestStats: vi.fn(),
  getSettings: vi.fn(),
  listApprovers: vi.fn(),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  deleteSupplier: vi.fn(),
  createRequest: vi.fn(),
  updateRequest: vi.fn(),
  reviewRequest: vi.fn(),
  deliverRequest: vi.fn(),
  updateSettings: vi.fn(),
}))

vi.mock('@/services/purchasingApi', () => ({ purchasingApi: mocks }))

import { useComprasStore } from '@/stores/comprasStore'

const supplierResponse = {
  id: 'supplier-id',
  name: 'Proveedor API',
  branchIds: ['branch-id'],
  productCount: 0,
  active: true,
  version: 1,
  createdAt: '2026-08-31T10:00:00Z',
  updatedAt: '2026-08-31T10:00:00Z',
}

function requestResponse(overrides = {}) {
  return {
    id: 'request-id',
    number: 'SC-20260831-0001',
    supplierId: 'supplier-id',
    supplierName: 'Proveedor API',
    branchId: 'branch-id',
    requesterName: 'Alex',
    requesterId: 'membership-id',
    items: [{ id: 'line-id', name: 'Guantes', qty: '2', unit: 'caja', price: '320', subtotal: '640' }],
    status: 'pendiente',
    priority: 'normal',
    notes: null,
    quoteFile: null,
    total: '640',
    createdAt: '2026-08-31T10:00:00Z',
    reviewedAt: null,
    reviewedBy: null,
    deliveredAt: null,
    version: 1,
    updatedAt: '2026-08-31T10:00:00Z',
    ...overrides,
  }
}

describe('store de Compras conectado a la API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useComprasStore.setState({
      suppliers: [],
      purchaseRequests: [],
      settings: { approverUserId: '', notifyOnRequest: true },
      approvers: [],
      stats: { total: 0, pendiente: 0, aprobada: 0, rechazada: 0, entregada: 0 },
      apiContext: { hydrated: false },
      hydrating: false,
      error: null,
    })
    mocks.listAllSuppliers.mockResolvedValue({ items: [supplierResponse] })
    mocks.listAllRequests.mockResolvedValue({ items: [requestResponse()] })
    mocks.getRequestStats.mockResolvedValue({ total: 1, pendiente: 1, aprobada: 0, rechazada: 0, entregada: 0 })
    mocks.getSettings.mockResolvedValue({
      approverUserId: 'membership-id',
      approverUser: { id: 'membership-id', name: 'Alex' },
      notifyOnRequest: true,
      version: 2,
    })
    mocks.listApprovers.mockResolvedValue([{ id: 'membership-id', name: 'Alex' }])
  })

  it('reemplaza la data local con las cinco respuestas de hidratación', async () => {
    await useComprasStore.getState().hydrateFromApi()

    expect(mocks.listAllSuppliers).toHaveBeenCalledOnce()
    expect(mocks.listAllRequests).toHaveBeenCalledOnce()
    expect(mocks.getRequestStats).toHaveBeenCalledOnce()
    expect(mocks.getSettings).toHaveBeenCalledOnce()
    expect(mocks.listApprovers).toHaveBeenCalledOnce()
    expect(useComprasStore.getState()).toMatchObject({
      suppliers: [expect.objectContaining({ id: 'supplier-id', apiSynced: true })],
      purchaseRequests: [expect.objectContaining({ id: 'request-id', number: 'SC-20260831-0001' })],
      settings: expect.objectContaining({ approverUserId: 'membership-id', version: 2 }),
      approvers: [{ id: 'membership-id', name: 'Alex' }],
      apiContext: { hydrated: true },
    })
  })

  it('aprueba y entrega usando la versión devuelta por cada respuesta', async () => {
    await useComprasStore.getState().hydrateFromApi()
    mocks.reviewRequest.mockResolvedValue(requestResponse({ status: 'aprobada', version: 2 }))
    mocks.deliverRequest.mockResolvedValue(requestResponse({ status: 'entregada', version: 3 }))

    await useComprasStore.getState().reviewPurchaseRequest(
      'request-id',
      'aprobada',
      'membership-id',
      { isOnline: true }
    )
    await useComprasStore.getState().markRequestDelivered('request-id', { isOnline: true })

    expect(mocks.reviewRequest).toHaveBeenCalledWith('request-id', {
      version: 1,
      status: 'aprobada',
    })
    expect(mocks.deliverRequest).toHaveBeenCalledWith('request-id', { version: 2 })
    expect(useComprasStore.getState().purchaseRequests[0]).toMatchObject({
      status: 'entregada',
      version: 3,
    })
  })

  it('guarda configuración con el UUID de membresía y versión vigentes', async () => {
    await useComprasStore.getState().hydrateFromApi()
    mocks.updateSettings.mockResolvedValue({
      approverUserId: null,
      approverUser: null,
      notifyOnRequest: false,
      version: 3,
    })

    await useComprasStore.getState().updateSettings(
      { approverUserId: '', notifyOnRequest: false },
      { isOnline: true }
    )

    expect(mocks.updateSettings).toHaveBeenCalledWith({
      version: 2,
      approverUserId: null,
      notifyOnRequest: false,
    })
    expect(useComprasStore.getState().settings).toMatchObject({
      approverUserId: '',
      notifyOnRequest: false,
      version: 3,
    })
  })
})
