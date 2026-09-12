import { describe, expect, it } from 'vitest'
import {
  draftFromQuote,
  emptyQuoteLine,
  isQuoteEditable,
  quoteLinesToItems,
} from '@/modules/crm/lib/quoteForm'

describe('quoteForm helpers', () => {
  it('convierte líneas del borrador a ítems con nombre y totales', () => {
    const catalog = new Map([
      ['p1', { id: 'p1', name: 'Servicio A', price: 1000 }],
      ['p2', { id: 'p2', name: 'Servicio B', price: 500 }],
    ])
    const items = quoteLinesToItems([
      { itemId: 'p1', qty: 2, price: '1200' },
      { itemId: 'p2', qty: 1, price: '' },
      emptyQuoteLine(),
    ], catalog)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ name: 'Servicio A', qty: 2, price: 1200 })
    expect(items[1]).toMatchObject({ name: 'Servicio B', qty: 1, price: 500 })
  })

  it('carga borrador desde cotización existente', () => {
    const draft = draftFromQuote({
      customerId: 'c1',
      opportunityId: 'o1',
      branchId: 'b1',
      items: [{ itemId: 'p1', qty: 3, price: 99 }],
    })
    expect(draft.lines[0]).toMatchObject({ itemId: 'p1', qty: 3, price: '99' })
  })

  it('solo permite editar borrador y enviada', () => {
    expect(isQuoteEditable({ status: 'borrador' })).toBe(true)
    expect(isQuoteEditable({ status: 'enviada' })).toBe(true)
    expect(isQuoteEditable({ status: 'aceptada' })).toBe(false)
    expect(isQuoteEditable({ status: 'enviada', invoiceNumber: 'FAC-001' })).toBe(false)
  })
})
