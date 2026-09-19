import { describe, expect, it } from 'vitest'
import { buildCustomerListApiParams } from '@/modules/crm/lib/customerListParams'

describe('buildCustomerListApiParams', () => {
  it('maps filters to API query', () => {
    expect(buildCustomerListApiParams({
      page: 2,
      pageSize: 200,
      search: 'maria',
      typeFilter: 'b2b',
      statusFilter: 'activo',
      branchIds: ['branch-1'],
    })).toEqual({
      page: 2,
      pageSize: 200,
      search: 'maria',
      type: 'business',
      status: 'active',
      branchId: 'branch-1',
    })
  })
})
