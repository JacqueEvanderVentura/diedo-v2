import { describe, expect, it } from 'vitest'
import {
  leadCompanyLabel,
  resolveCustomerForLead,
} from '@/modules/crm/lib/leadCustomer'

describe('leadCustomer', () => {
  it('extrae el nombre B2B del lead', () => {
    expect(leadCompanyLabel({
      company: 'SM Medicina Estetica',
      name: 'Contacto',
    })).toBe('SM Medicina Estetica')
  })

  it('resuelve cliente CRM por nombre de empresa', () => {
    const lead = {
      id: 'lead-1',
      company: 'SM Medicina Estetica',
      branchId: 'b1',
    }
    const customers = [
      { id: 'c1', name: 'Daniela Sturs', branchId: 'b1' },
      { id: 'c2', name: 'SM Medicina Estetica', branchId: 'b1' },
    ]
    expect(resolveCustomerForLead(lead, customers)?.id).toBe('c2')
  })
})
