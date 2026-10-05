import { describe, expect, it } from 'vitest'
import {
  buildDemoSaleFromPipeline,
  findBillableQuote,
  findLeadLinkedQuote,
  previewInvoiceNumber,
  validatePipelineClose,
} from '@/modules/crm/lib/pipelineInvoice'

describe('pipelineInvoice', () => {
  const lead = {
    id: 'lead-1',
    customerId: 'c2',
    company: 'Glamour Studio RD',
    branchId: 'charm-dn',
    pipelineValue: 45000,
  }

  const quotes = [
    {
      id: 'qt-1',
      leadId: 'lead-1',
      status: 'enviada',
      number: 'COT-2026-001',
      total: 45000,
      items: [
        { name: 'Módulo Agenda', qty: 1, price: 25000 },
        { name: 'Módulo POS', qty: 1, price: 20000 },
      ],
    },
  ]

  it('encuentra la cotización facturable del lead', () => {
    expect(findBillableQuote(quotes, 'lead-1')?.id).toBe('qt-1')
  })

  it('devuelve la cotización activa más reciente del lead', () => {
    const scoped = [
      { ...quotes[0], updatedAt: '2026-06-01T00:00:00Z', createdAt: '2026-06-01T00:00:00Z' },
      {
        id: 'qt-old',
        leadId: 'lead-1',
        status: 'borrador',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'qt-cancel',
        leadId: 'lead-1',
        status: 'cancelada',
        updatedAt: '2026-12-01T00:00:00Z',
      },
    ]
    expect(findLeadLinkedQuote(scoped, 'lead-1')?.id).toBe('qt-1')
    expect(findLeadLinkedQuote(scoped, 'lead-missing')).toBeNull()
  })

  it('valida cliente y cotización antes de cerrar', () => {
    expect(validatePipelineClose({ lead, quotes })).toBeNull()
    expect(validatePipelineClose({
      lead: { ...lead, customerId: null },
      quotes,
    })).toMatch(/cliente/i)
  })

  it('genera una venta demo con número FAC', () => {
    const sale = buildDemoSaleFromPipeline({
      lead,
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
