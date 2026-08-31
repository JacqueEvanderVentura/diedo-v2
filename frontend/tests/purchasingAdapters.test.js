import { describe, expect, it } from 'vitest'
import {
  mapPurchaseRequestFromApi,
  mapPurchasingSettingsFromApi,
  mapSupplierFromApi,
  purchaseRequestToApiPayload,
  supplierToApiPayload,
} from '@/services/adapters/purchasing'

describe('adaptadores de Compras', () => {
  it('mapea proveedor y conserva versión/UUID para mutaciones online', () => {
    expect(mapSupplierFromApi({
      id: 'supplier-id',
      name: 'Proveedor',
      branchIds: ['branch-id'],
      productCount: 4,
      active: true,
      version: 3,
    })).toMatchObject({
      id: 'supplier-id',
      branchIds: ['branch-id'],
      productCount: 4,
      version: 3,
      apiSynced: true,
    })

    expect(supplierToApiPayload({
      name: ' Proveedor ',
      rnc: '',
      contactName: ' María ',
      phone: '',
      email: ' compras@example.com ',
      address: '',
      branchIds: ['branch-id'],
    })).toEqual({
      name: 'Proveedor',
      rnc: null,
      contactName: 'María',
      phone: null,
      email: 'compras@example.com',
      address: null,
      branchIds: ['branch-id'],
    })
  })

  it('mapea solicitud, importes y número visible sin perder el UUID', () => {
    const request = mapPurchaseRequestFromApi({
      id: 'request-id',
      number: 'SC-20260831-0001',
      supplierId: 'supplier-id',
      supplierName: 'Proveedor',
      branchId: 'branch-id',
      requesterName: 'Alex',
      requesterId: 'membership-id',
      items: [{ id: 'line-id', name: 'Guantes', qty: '2', unit: 'caja', price: '320', subtotal: '640' }],
      status: 'pendiente',
      priority: 'alta',
      total: '640',
      version: 2,
    })

    expect(request).toMatchObject({
      id: 'request-id',
      number: 'SC-20260831-0001',
      total: 640,
      version: 2,
      items: [{ qty: 2, price: 320, subtotal: 640 }],
      apiSynced: true,
    })
    expect(purchaseRequestToApiPayload(request)).toMatchObject({
      supplierId: 'supplier-id',
      branchId: 'branch-id',
      items: [{ name: 'Guantes', qty: 2, unit: 'caja', price: 320 }],
      priority: 'alta',
    })
  })

  it('conserva la versión y el aprobador real de configuración', () => {
    expect(mapPurchasingSettingsFromApi({
      approverUserId: 'membership-id',
      approverUser: { id: 'membership-id', name: 'Alex' },
      notifyOnRequest: true,
      version: 4,
    })).toMatchObject({
      approverUserId: 'membership-id',
      notifyOnRequest: true,
      version: 4,
      apiSynced: true,
    })
  })
})
