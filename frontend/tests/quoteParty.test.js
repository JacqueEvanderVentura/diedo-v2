import { describe, expect, it } from 'vitest'
import { filterQuoteParties } from '@/modules/crm/lib/quoteParty'

describe('quoteParty', () => {
  it('mezcla leads y clientes y filtra por búsqueda', () => {
    const rows = filterQuoteParties({
      query: 'ana',
      leads: [
        { id: 'l1', name: 'Ana Lead', phone: '809', branchId: 'b1', status: 'nuevo' },
        { id: 'l2', name: 'Pedro', status: 'convertido' },
      ],
      customers: [
        { id: 'c1', name: 'Ana Cliente', phone: '829', branchIds: ['b1'] },
      ],
      branchId: 'b1',
    })
    expect(rows.map((row) => row.id)).toEqual(['c1', 'l1'])
    expect(rows[0].badge).toBe('Cliente')
    expect(rows[1].badge).toBe('Lead')
  })
})
