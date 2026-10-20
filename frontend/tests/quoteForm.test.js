import { describe, expect, it } from 'vitest'
import {
  countQuoteProductLines,
  draftFromQuote,
  emptyQuoteLine,
  emptyQuoteSection,
  isQuoteEditable,
  quoteLinesToItems,
} from '@/modules/crm/lib/quoteForm'
import { mapQuoteItemToApiLine } from '@/modules/crm/lib/quoteApiLines'
import { sumQuoteLines } from '@/modules/crm/lib/pipelineInvoice'

describe('quoteForm helpers', () => {
  it('convierte líneas del borrador a ítems con nombre y totales', () => {
    const catalog = new Map([
      ['p1', { id: 'p1', name: 'Servicio A', price: 1000 }],
      ['p2', { id: 'p2', name: 'Servicio B', price: 500 }],
    ])
    const items = quoteLinesToItems([
      { key: 'a', kind: 'section', title: 'Sala' },
      { key: 'b', itemId: 'p1', qty: 2, price: '1200' },
      { key: 'c', itemId: 'p2', qty: 1, price: '' },
      emptyQuoteLine(),
    ], catalog)
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ kind: 'section', title: 'Sala' })
    expect(items[1]).toMatchObject({ name: 'Servicio A', qty: 2, price: 1200 })
    expect(items[2]).toMatchObject({ name: 'Servicio B', qty: 1, price: 500 })
  })

  it('permite repetir el mismo producto y conserva ids únicos', () => {
    const catalog = new Map([['p1', { id: 'p1', name: 'Tela', price: 100 }]])
    const items = quoteLinesToItems([
      { key: 'line-1', itemId: 'p1', qty: 1, price: '100' },
      { key: 'line-2', itemId: 'p1', qty: 2, price: '100' },
    ], catalog)
    expect(items).toHaveLength(2)
    expect(items[0].id).not.toBe(items[1].id)
    expect(items[0].itemId).toBe('p1')
    expect(items[1].itemId).toBe('p1')
  })

  it('carga borrador desde cotización existente con secciones', () => {
    const draft = draftFromQuote({
      customerId: 'c1',
      branchId: 'b1',
      items: [
        { id: 's1', kind: 'section', title: 'Sala' },
        { itemId: 'p1', qty: 3, price: 99 },
      ],
    })
    expect(draft.lines[0]).toMatchObject({ kind: 'section', title: 'Sala' })
    expect(draft.lines[1]).toMatchObject({ itemId: 'p1', qty: 3, price: '99' })
  })

  it('mapea líneas de API con secciones', () => {
    expect(mapQuoteItemToApiLine({ kind: 'section', title: 'Sala' })).toEqual({
      kind: 'section',
      title: 'Sala',
    })
    expect(mapQuoteItemToApiLine({ itemId: 'p1', qty: 2, price: 50 })).toMatchObject({
      kind: 'item',
      itemId: 'p1',
      quantity: 2,
      unitPrice: 50,
    })
  })

  it('excluye secciones del subtotal', () => {
    const total = sumQuoteLines([
      { kind: 'section', title: 'Sala', price: 0, qty: 0 },
      { kind: 'item', price: 100, qty: 2 },
    ])
    expect(total).toBe(200)
    expect(countQuoteProductLines([
      { kind: 'section' },
      { kind: 'item' },
      { kind: 'item' },
    ])).toBe(2)
  })

  it('solo permite editar borrador y enviada', () => {
    expect(isQuoteEditable({ status: 'borrador' })).toBe(true)
    expect(isQuoteEditable({ status: 'enviada' })).toBe(true)
    expect(isQuoteEditable({ status: 'aceptada' })).toBe(false)
    expect(isQuoteEditable({ status: 'enviada', invoiceNumber: 'FAC-001' })).toBe(false)
  })

  it('crea sección vacía con kind section', () => {
    expect(emptyQuoteSection()).toMatchObject({ kind: 'section', title: '' })
    expect(emptyQuoteLine()).toMatchObject({ kind: 'item', itemId: '' })
  })
})
