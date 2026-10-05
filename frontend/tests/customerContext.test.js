import { describe, expect, it } from 'vitest'
import { mergeSalesForCustomer, filterOpenPipelineLeads } from '@/modules/crm/lib/customerContext'

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

  it('filtra leads abiertos del cliente en pipeline', () => {
    const rows = filterOpenPipelineLeads([
      { id: 'o1', customerId: 'c1', status: 'nuevo' },
      { id: 'o2', customerId: 'c1', status: 'cerrado' },
      { id: 'o3', customerId: 'c2', status: 'contactado' },
    ], 'c1')
    expect(rows.map((row) => row.id)).toEqual(['o1'])
  })
})
