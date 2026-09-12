import { describe, expect, it } from 'vitest'
import {
  opportunityCompanyLabel,
  resolveCustomerForOpportunity,
} from '@/modules/crm/lib/opportunityCustomer'

describe('opportunityCustomer', () => {
  it('extrae el nombre B2B del título de la oportunidad', () => {
    expect(opportunityCompanyLabel({
      title: 'SM Medicina Estetica — Oportunidad',
      customerName: 'SM Medicina Estetica',
    })).toBe('SM Medicina Estetica')
  })

  it('resuelve cliente CRM por nombre de empresa', () => {
    const opportunity = {
      id: 'opp-1',
      customerName: 'SM Medicina Estetica',
      title: 'SM Medicina Estetica — Oportunidad',
      branchId: 'b1',
    }
    const customers = [
      { id: 'c1', name: 'Daniela Sturs', branchId: 'b1' },
      { id: 'c2', name: 'SM Medicina Estetica', branchId: 'b1' },
    ]
    expect(resolveCustomerForOpportunity(opportunity, customers)?.id).toBe('c2')
  })
})
