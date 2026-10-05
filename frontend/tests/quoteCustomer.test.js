import { describe, expect, it, vi } from 'vitest'
import {
  ensureCustomerForQuote,
  ensureCustomerForLeadQuote,
  syncLeadPipelineValue,
} from '@/modules/crm/lib/quoteCustomer'

describe('ensureCustomerForQuote', () => {
  it('devuelve el id si ya hay cliente', async () => {
    const result = await ensureCustomerForQuote({
      customerId: 'c-1',
      lead: null,
      addCustomer: vi.fn(),
      updateLead: vi.fn(),
    })
    expect(result).toEqual({ id: 'c-1' })
  })

  it('crea cliente desde el lead si falta ficha', async () => {
    const addCustomer = vi.fn().mockResolvedValue({ id: 'new-c', name: 'Spa Zen' })
    const updateLead = vi.fn().mockResolvedValue(undefined)
    const result = await ensureCustomerForQuote({
      customerId: null,
      lead: {
        id: 'lead-1',
        company: 'Spa Zen',
        branchId: 'b1',
      },
      addCustomer,
      updateLead,
    })
    expect(addCustomer).toHaveBeenCalled()
    expect(updateLead).toHaveBeenCalledWith('lead-1', { customerId: 'new-c' })
    expect(result).toEqual({ id: 'new-c', name: 'Spa Zen' })
  })
})

describe('ensureCustomerForLeadQuote', () => {
  it('reutiliza customerId del lead', async () => {
    const result = await ensureCustomerForLeadQuote({
      lead: { id: 'lead-1', customerId: 'c-existing' },
      addCustomer: vi.fn(),
      updateLead: vi.fn(),
    })
    expect(result).toEqual({ id: 'c-existing', leadId: 'lead-1' })
  })

  it('crea cliente y vincula al lead', async () => {
    const addCustomer = vi.fn().mockResolvedValue({ id: 'new-c' })
    const updateLead = vi.fn().mockResolvedValue(undefined)
    const result = await ensureCustomerForLeadQuote({
      lead: { id: 'lead-2', name: 'Ada', branchId: 'b1' },
      addCustomer,
      updateLead,
    })
    expect(addCustomer).toHaveBeenCalled()
    expect(updateLead).toHaveBeenCalledWith('lead-2', { customerId: 'new-c' })
    expect(result).toEqual({ id: 'new-c', leadId: 'lead-2' })
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
