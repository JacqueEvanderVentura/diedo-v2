import { describe, expect, it } from 'vitest'
import {
  buildDemoSaleFromPipeline,
  findBillableQuote,
  previewInvoiceNumber,
  validatePipelineClose,
} from '@/modules/crm/lib/pipelineInvoice'

describe('pipelineInvoice', () => {
  const opportunity = {
    id: 'opp-1',
    customerId: 'c2',
    customerName: 'Glamour Studio RD',
    branchId: 'charm-dn',
    value: 45000,
  }

  const quotes = [
    {
      id: 'qt-1',
      opportunityId: 'opp-1',
      status: 'enviada',
      number: 'COT-2026-001',
      total: 45000,
      items: [
        { name: 'Módulo Agenda', qty: 1, price: 25000 },
        { name: 'Módulo POS', qty: 1, price: 20000 },
      ],
    },
  ]

  it('encuentra la cotización facturable de la oportunidad', () => {
    expect(findBillableQuote(quotes, 'opp-1')?.id).toBe('qt-1')
  })

  it('valida cliente y cotización antes de cerrar', () => {
    expect(validatePipelineClose({ opportunity, quotes })).toBeNull()
    expect(validatePipelineClose({
      opportunity: { ...opportunity, customerId: null },
      quotes,
    })).toMatch(/cliente/i)
  })

  it('genera una venta demo con número FAC', () => {
    const sale = buildDemoSaleFromPipeline({
      opportunity,
      quote: quotes[0],
      customer: { id: 'c2', name: 'Glamour Studio RD' },
      paymentMethod: 'efectivo',
    })
    expect(sale.number).toMatch(/^FAC-/)
    expect(sale.items).toHaveLength(2)
    expect(sale.channel).toBe('crm')
  })

  it('previsualiza un número de factura', () => {
    expect(previewInvoiceNumber(new Date('2026-09-08T12:30:45'))).toBe('FAC-20260908-123045')
  })
})
