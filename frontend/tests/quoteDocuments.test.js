import { describe, expect, it } from 'vitest'
import {
  buildCrmDocumentRows,
  filterDocumentRows,
  parseDocFilter,
} from '@/modules/crm/lib/quoteDocuments'

describe('quoteDocuments', () => {
  it('parsea filtro doc desde query', () => {
    expect(parseDocFilter(null)).toBe('all')
    expect(parseDocFilter('quotes')).toBe('quotes')
    expect(parseDocFilter('facturas')).toBe('invoices')
  })

  it('arma filas de cotizaciones abiertas y facturas', () => {
    const rows = buildCrmDocumentRows({
      quotes: [
        { id: 'q1', number: 'COT-1', createdAt: '2026-01-02', total: 100 },
        { id: 'q2', number: 'COT-2', convertedSaleId: 's1', createdAt: '2026-01-01', total: 200 },
      ],
      crmSales: [{ id: 's1', number: 'VTA-1', createdAt: '2026-01-03', total: 200, method: 'efectivo', status: 'completed' }],
      receivables: [],
    })
    expect(rows.some((row) => row.kind === 'quote' && row.quote.id === 'q1')).toBe(true)
    expect(rows.some((row) => row.kind === 'quote' && row.quote.id === 'q2')).toBe(false)
    expect(rows.some((row) => row.kind === 'invoice' && row.sale.id === 's1')).toBe(true)
  })

  it('filtra por tipo de documento', () => {
    const rows = [
      { kind: 'quote', id: 'quote-1' },
      { kind: 'invoice', id: 'sale-1', pendingCxc: true },
    ]
    expect(filterDocumentRows(rows, 'quotes')).toHaveLength(1)
    expect(filterDocumentRows(rows, 'invoices')).toHaveLength(1)
    expect(filterDocumentRows(rows, 'all')).toHaveLength(2)
  })

  it('marca factura pendiente CxC cuando hay saldo', () => {
    const rows = buildCrmDocumentRows({
      quotes: [],
      crmSales: [{
        id: 's2',
        number: 'VTA-2',
        createdAt: '2026-01-04',
        total: 500,
        method: 'cxc',
        status: 'completed',
      }],
      receivables: [{ id: 'r1', saleId: 's2', amount: 500, paidAmount: 0 }],
    })
    const invoice = rows.find((row) => row.kind === 'invoice')
    expect(invoice?.pendingCxc).toBe(true)
  })
})
