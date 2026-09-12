import { describe, expect, it } from 'vitest'
import { mergeSalesForCustomer, filterOpenOpportunities } from '@/modules/crm/lib/customerContext'

describe('customerContext helpers', () => {
  it('fusiona ventas POS y CRM sin duplicar por id', () => {
    const customerId = 'c1'
    const merged = mergeSalesForCustomer(
      [{ id: 's1', customer: { id: customerId }, total: 100, createdAt: '2026-01-02T00:00:00Z' }],
      [
        { id: 's1', customer: { id: customerId }, total: 100, createdAt: '2026-01-02T00:00:00Z' },
        { id: 's2', customer: { id: customerId }, total: 50, createdAt: '2026-01-03T00:00:00Z' },
      ],
      customerId,
    )
    expect(merged).toHaveLength(2)
    expect(merged[0].id).toBe('s2')
  })

  it('filtra oportunidades abiertas del cliente', () => {
    const rows = filterOpenOpportunities([
      { id: 'o1', customerId: 'c1', stage: 'nuevo' },
      { id: 'o2', customerId: 'c1', stage: 'cerrado' },
      { id: 'o3', customerId: 'c2', stage: 'contactado' },
    ], 'c1')
    expect(rows.map((row) => row.id)).toEqual(['o1'])
  })
})
