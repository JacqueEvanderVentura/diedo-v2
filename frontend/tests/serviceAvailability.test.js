import { describe, expect, it } from 'vitest'
import { servicesForBranch } from '@/modules/agenda/lib/serviceAvailability'

const products = [
  {
    id: 'service-main',
    type: 'service',
    status: 'active',
    branchIds: ['branch-main'],
    apiSynced: true,
  },
  {
    id: 'service-center',
    type: 'service',
    status: 'active',
    branchIds: ['branch-center'],
    apiSynced: true,
  },
  {
    id: 'service-both',
    type: 'service',
    status: 'active',
    branchIds: ['branch-main', 'branch-center'],
    apiSynced: true,
  },
  {
    id: 'service-inactive',
    type: 'service',
    status: 'inactive',
    branchIds: ['branch-main'],
    apiSynced: true,
  },
  {
    id: 'service-dummy',
    type: 'service',
    branchId: 'branch-main',
  },
  {
    id: 'product-main',
    type: 'product',
    status: 'active',
    branchIds: ['branch-main'],
    apiSynced: true,
  },
]

describe('servicios disponibles por sucursal', () => {
  it('solo devuelve servicios activos asignados a la sucursal elegida', () => {
    expect(servicesForBranch(products, 'branch-main').map((item) => item.id)).toEqual([
      'service-main',
      'service-both',
      'service-dummy',
    ])
    expect(servicesForBranch(products, 'branch-center').map((item) => item.id)).toEqual([
      'service-center',
      'service-both',
    ])
  })

  it('en modo API excluye fixtures locales aunque coincida la sucursal', () => {
    expect(
      servicesForBranch(products, 'branch-main', { online: true }).map((item) => item.id)
    ).toEqual(['service-main', 'service-both'])
  })
})
