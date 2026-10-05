import { describe, expect, it } from 'vitest'
import {
  customersForOpportunityBranch,
  isOpportunityCreateReady,
  leadCustomerDefaults,
} from '@/modules/crm/lib/pipelineForm'

describe('pipelineForm', () => {
  it('permite crear oportunidad solo con título, nombre y sucursal', () => {
    expect(isOpportunityCreateReady({
      title: 'Deal',
      customerName: 'Acme',
      branchId: 'b1',
      leadId: '',
      customerId: '',
    })).toBe(true)
  })

  it('precarga defaults de cliente desde el lead', () => {
    expect(leadCustomerDefaults({
      company: 'Spa Zen',
      branchId: 'branch-1',
    })).toMatchObject({
      name: 'Spa Zen',
      branchIds: ['branch-1'],
    })
  })

  it('filtra clientes por sucursal de la oportunidad', () => {
    const pool = [
      { id: 'a', branchIds: ['b1'] },
      { id: 'b', branchId: 'b2' },
    ]
    expect(customersForOpportunityBranch(pool, 'b1').map((c) => c.id)).toEqual(['a'])
  })
})
