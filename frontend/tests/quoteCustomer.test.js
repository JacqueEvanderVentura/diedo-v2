import { describe, expect, it, vi } from 'vitest'
import {
  ensureCustomerForQuote,
  ensureCustomerForLeadQuote,
  isLeadNeedsDocumentError,
  preparePipelineCloseCustomer,
  syncLeadPipelineValue,
} from '@/modules/crm/lib/quoteCustomer'

describe('ensureCustomerForQuote', () => {
  it('devuelve el id si ya hay cliente', async () => {
    const convertToCustomer = vi.fn()
    const result = await ensureCustomerForQuote({
      customerId: 'c-1',
      lead: null,
      convertToCustomer,
    })
    expect(result).toEqual({ id: 'c-1' })
    expect(convertToCustomer).not.toHaveBeenCalled()
  })

  it('convierte el lead con documento sin cerrarlo', async () => {
    const convertToCustomer = vi.fn().mockResolvedValue({ id: 'new-c', name: 'Spa Zen' })
    const result = await ensureCustomerForQuote({
      customerId: null,
      lead: {
        id: 'lead-1',
        company: 'Spa Zen',
        branchId: 'b1',
        documentId: '001-1234567-8',
      },
      convertToCustomer,
    })
    expect(convertToCustomer).toHaveBeenCalledWith('lead-1', null)
    expect(result).toMatchObject({ id: 'new-c', leadId: 'lead-1' })
  })
})

describe('ensureCustomerForLeadQuote', () => {
  it('reutiliza customerId del lead', async () => {
    const result = await ensureCustomerForLeadQuote({
      lead: { id: 'lead-1', customerId: 'c-existing' },
      convertToCustomer: vi.fn(),
    })
    expect(result).toEqual({ id: 'c-existing', leadId: 'lead-1' })
  })

  it('pide documento cuando el lead no lo tiene', async () => {
    const convertToCustomer = vi.fn()
    const error = await ensureCustomerForLeadQuote({
      lead: { id: 'lead-2', name: 'Ada', branchId: 'b1' },
      convertToCustomer,
    }).catch((caught) => caught)
    expect(isLeadNeedsDocumentError(error)).toBe(true)
    expect(convertToCustomer).not.toHaveBeenCalled()
  })

  it('usa el documento indicado al convertir', async () => {
    const convertToCustomer = vi.fn().mockResolvedValue({ id: 'new-c' })
    const documentOverride = { docType: 'cedula', documentId: '001-7654321-0' }
    const result = await ensureCustomerForLeadQuote({
      lead: { id: 'lead-2', name: 'Ada', branchId: 'b1' },
      convertToCustomer,
      documentOverride,
    })
    expect(convertToCustomer).toHaveBeenCalledWith('lead-2', documentOverride)
    expect(result).toMatchObject({ id: 'new-c', leadId: 'lead-2' })
  })
})

describe('preparePipelineCloseCustomer', () => {
  it('vincula el cliente al lead y a su cotización', async () => {
    const convertToCustomer = vi.fn().mockResolvedValue({ id: 'c-9' })
    const updateLead = vi.fn().mockResolvedValue(undefined)
    const updateQuote = vi.fn().mockResolvedValue(undefined)
    await preparePipelineCloseCustomer({
      lead: { id: 'lead-3', name: 'Ana', documentId: '001-1111111-1' },
      convertToCustomer,
      updateLead,
      updateQuote,
      quotes: [{ id: 'q-1', leadId: 'lead-3', customerId: null, status: 'borrador', items: [{ id: 'i1' }] }],
    })
    expect(updateLead).toHaveBeenCalledWith('lead-3', { customerId: 'c-9' })
    expect(updateQuote).toHaveBeenCalledWith('q-1', { customerId: 'c-9' })
  })
})

describe('syncLeadPipelineValue', () => {
  it('actualiza pipelineValue del lead', async () => {
    const updateLead = vi.fn().mockResolvedValue(undefined)
    await syncLeadPipelineValue({ leadId: 'lead-1', total: 5000, updateLead })
    expect(updateLead).toHaveBeenCalledWith('lead-1', { pipelineValue: 5000 })
  })

  it('no llama updateLead sin total válido', async () => {
    const updateLead = vi.fn()
    await syncLeadPipelineValue({ leadId: 'lead-1', total: NaN, updateLead })
    expect(updateLead).not.toHaveBeenCalled()
  })
})
