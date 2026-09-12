import { describe, expect, it, vi } from 'vitest'
import { ensureCustomerForQuote } from '@/modules/crm/lib/quoteCustomer'

describe('ensureCustomerForQuote', () => {
  it('devuelve el id si ya hay cliente', async () => {
    const result = await ensureCustomerForQuote({
      customerId: 'c-1',
      opportunity: null,
      addCustomer: vi.fn(),
      updateOpportunity: vi.fn(),
    })
    expect(result).toEqual({ id: 'c-1' })
  })

  it('crea cliente desde la oportunidad si falta ficha', async () => {
    const addCustomer = vi.fn().mockResolvedValue({ id: 'new-c', name: 'Spa Zen' })
    const updateOpportunity = vi.fn().mockResolvedValue(undefined)
    const result = await ensureCustomerForQuote({
      customerId: null,
      opportunity: {
        id: 'opp-1',
        customerName: 'Spa Zen — Oportunidad',
        branchId: 'b1',
      },
      addCustomer,
      updateOpportunity,
    })
    expect(addCustomer).toHaveBeenCalled()
    expect(updateOpportunity).toHaveBeenCalledWith('opp-1', {
      customerId: 'new-c',
      customerName: 'Spa Zen',
    })
    expect(result).toEqual({ id: 'new-c', name: 'Spa Zen' })
  })
})
