import { describe, expect, it } from 'vitest'
import {
  effectiveLeadCustomerId,
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

  it('no adivina el cliente por nombre de empresa', () => {
    const lead = {
      id: 'lead-1',
      company: 'SM Medicina Estetica',
      branchId: 'b1',
    }
    const customers = [
      { id: 'c1', name: 'Daniela Sturs', branchId: 'b1' },
      { id: 'c2', name: 'SM Medicina Estetica', branchId: 'b1' },
    ]
    expect(resolveCustomerForLead(lead, customers)).toBeNull()
    expect(effectiveLeadCustomerId(lead)).toBeNull()
  })

  it('usa el cliente vinculado al lead', () => {
    const lead = { id: 'lead-1', customerId: 'c1' }
    const customers = [{ id: 'c1', name: 'Daniela Sturs' }]
    expect(resolveCustomerForLead(lead, customers)?.id).toBe('c1')
  })

  it('usa el cliente de la cotización más reciente del lead', () => {
    const lead = { id: 'lead-1' }
    const quotes = [
      { id: 'q1', leadId: 'lead-1', customerId: 'c1', updatedAt: '2026-10-01T00:00:00Z' },
      { id: 'q2', leadId: 'lead-1', customerId: 'c2', updatedAt: '2026-10-05T00:00:00Z' },
      { id: 'q3', leadId: 'otro', customerId: 'c3', updatedAt: '2026-10-09T00:00:00Z' },
    ]
    expect(effectiveLeadCustomerId(lead, quotes)).toBe('c2')
  })
})
