import { describe, expect, it, vi } from 'vitest'
import {
  buildDemoSaleFromPipeline,
  findBillableQuote,
  findLeadLinkedQuote,
  previewInvoiceNumber,
  syncPipelineCloseCustomer,
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

  it('vincula el cliente al lead antes de actualizar la cotización', async () => {
    const calls = []
    const updateLead = vi.fn(async () => { calls.push('lead') })
    const updateQuote = vi.fn(async () => { calls.push('quote') })
    await syncPipelineCloseCustomer({ leadId: 'lead-1', customerId: 'c9', quotes, updateLead, updateQuote })
    expect(updateLead).toHaveBeenCalledWith('lead-1', { customerId: 'c9' })
    expect(updateQuote).toHaveBeenCalledWith('qt-1', { customerId: 'c9' })
    expect(calls).toEqual(['lead', 'quote'])
  })

  it('propaga el error al vincular y no toca cotizaciones facturadas', async () => {
    const updateQuote = vi.fn()
    await expect(syncPipelineCloseCustomer({
      leadId: 'lead-1',
      customerId: 'c9',
      quotes,
      updateLead: vi.fn().mockRejectedValue(new Error('El lead está vinculado a otro cliente.')),
      updateQuote,
    })).rejects.toThrow('otro cliente')
    expect(updateQuote).not.toHaveBeenCalled()

    await syncPipelineCloseCustomer({
      leadId: 'lead-1',
      customerId: 'c9',
      quotes: [{ ...quotes[0], convertedSaleId: 'sale-1' }],
      updateQuote,
    })
    expect(updateQuote).not.toHaveBeenCalled()
  })
})
