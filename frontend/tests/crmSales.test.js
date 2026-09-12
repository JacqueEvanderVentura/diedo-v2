import { describe, expect, it } from 'vitest'
import {
  mergeCrmSalesLists,
  saleDisplayReference,
  saleOriginKey,
} from '@/modules/crm/lib/crmSales'

describe('crmSales helpers', () => {
  it('fusiona ventas POS y CRM sin duplicar', () => {
    const merged = mergeCrmSalesLists(
      [{ id: 's1', createdAt: '2026-01-01T00:00:00Z', total: 10 }],
      [
        { id: 's1', createdAt: '2026-01-01T00:00:00Z', total: 10 },
        { id: 's2', createdAt: '2026-01-02T00:00:00Z', total: 20, origin: 'pipeline' },
      ],
    )
    expect(merged).toHaveLength(2)
    expect(merged[0].id).toBe('s2')
  })

  it('detecta origen pipeline', () => {
    expect(saleOriginKey({ origin: 'pipeline' })).toBe('pipeline')
    expect(saleOriginKey({ channel: 'crm' })).toBe('pipeline')
    expect(saleOriginKey({})).toBe('pos')
  })

  it('muestra referencia de cotización cuando aplica', () => {
    expect(saleDisplayReference({ quoteId: 'q1' })).toBe('Cotización vinculada')
    expect(saleDisplayReference({ reference: 'FAC-1' })).toBe('FAC-1')
  })
})
