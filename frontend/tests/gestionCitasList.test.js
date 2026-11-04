import { describe, expect, it } from 'vitest'

import {
  buildGestionCitasListParams,
  gestionCitasPaginationMeta,
  gestionCitasSortParams,
} from '@/modules/agenda/lib/gestionCitasList'

describe('gestionCitasList', () => {
  it('maps sort keys to API fields', () => {
    expect(gestionCitasSortParams('customer', 'asc')).toEqual({
      sortBy: 'customerName',
      sortDirection: 'asc',
    })
    expect(gestionCitasSortParams('date', 'desc')).toEqual({
      sortBy: 'date',
      sortDirection: 'desc',
    })
  })

  it('builds paginated list params from filters', () => {
    const params = buildGestionCitasListParams({
      branchId: 'branch-1',
      employeeId: 'emp-1',
      status: 'confirmada',
      search: '  ana  ',
      dateFilter: { period: 'all', dateFrom: null, dateTo: null },
      page: 2,
      pageSize: 25,
      sortKey: 'date',
      sortDir: 'desc',
    })
    expect(params).toMatchObject({
      branchId: 'branch-1',
      employeeId: 'emp-1',
      status: 'confirmada',
      search: 'ana',
      page: 2,
      pageSize: 25,
      sortBy: 'date',
      sortDirection: 'desc',
    })
  })

  it('computes pagination ranges', () => {
    expect(gestionCitasPaginationMeta({ page: 2, pageSize: 10, totalItems: 25, totalPages: 3 })).toEqual({
      page: 2,
      pageSize: 10,
      totalItems: 25,
      totalPages: 3,
      from: 11,
      to: 20,
    })
  })
})
