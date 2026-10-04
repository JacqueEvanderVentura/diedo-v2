import { describe, expect, it, vi } from 'vitest'
import {
  ensureCustomerForQuote,
  findOpenOpportunitiesForQuote,
  pickMostRecentOpportunity,
  resolveOpportunityForQuote,
} from '@/modules/crm/lib/quoteCustomer'

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

describe('resolveOpportunityForQuote', () => {
  const opportunities = [
    { id: 'o-old', customerId: 'c1', branchId: 'b1', stage: 'nuevo', updatedAt: '2026-01-01' },
    { id: 'o-new', customerId: 'c1', branchId: 'b1', stage: 'propuesta', updatedAt: '2026-02-01' },
    { id: 'o-closed', customerId: 'c1', branchId: 'b1', stage: 'cerrado', updatedAt: '2026-03-01' },
  ]

  it('reutiliza la oportunidad abierta más reciente', async () => {
    const addOpportunity = vi.fn()
    const updateOpportunity = vi.fn().mockResolvedValue(undefined)
    const id = await resolveOpportunityForQuote({
      opportunities,
      customerId: 'c1',
      branchId: 'b1',
      items: [{ name: 'POS' }],
      total: 5000,
      addOpportunity,
      updateOpportunity,
    })
    expect(id).toBe('o-new')
    expect(addOpportunity).not.toHaveBeenCalled()
    expect(updateOpportunity).toHaveBeenCalledWith('o-new', { value: 5000 })
  })

  it('crea oportunidad en propuesta si no hay abierta', async () => {
    const addOpportunity = vi.fn().mockResolvedValue({ id: 'o-created' })
    const id = await resolveOpportunityForQuote({
      opportunities: [opportunities[2]],
      customerId: 'c9',
      branchId: 'b1',
      customerName: 'Glamour',
      items: [{ name: 'Agenda' }],
      total: 12000,
      addOpportunity,
      updateOpportunity: vi.fn(),
      assignedUserId: 'u1',
    })
    expect(id).toBe('o-created')
    expect(addOpportunity).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'propuesta',
      value: 12000,
      customerId: 'c9',
      title: 'Glamour — Agenda',
    }))
  })

  it('no reasigna al editar', async () => {
    const id = await resolveOpportunityForQuote({
      editing: true,
      explicitOpportunityId: 'o-keep',
      opportunities,
      customerId: 'c1',
      addOpportunity: vi.fn(),
    })
    expect(id).toBe('o-keep')
  })
})

describe('findOpenOpportunitiesForQuote', () => {
  it('excluye cerradas y otras sucursales', () => {
    const list = findOpenOpportunitiesForQuote({
      opportunities: [
        { id: '1', customerId: 'c1', branchId: 'b1', stage: 'nuevo' },
        { id: '2', customerId: 'c1', branchId: 'b2', stage: 'nuevo' },
        { id: '3', customerId: 'c1', branchId: 'b1', stage: 'perdido' },
      ],
      customerId: 'c1',
      branchId: 'b1',
    })
    expect(list.map((o) => o.id)).toEqual(['1'])
    expect(pickMostRecentOpportunity(list)?.id).toBe('1')
  })
})
