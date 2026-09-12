import { describe, expect, it } from 'vitest'
import { buildLeadConvertRequest, buildLeadOfflineCustomer } from '@/modules/crm/lib/leadConversion'

describe('leadConversion', () => {
  it('siempre convierte como business/b2b', () => {
    const lead = {
      id: 'l1',
      version: 2,
      name: 'Carla Jiménez',
      company: '',
      branchId: 'b1',
    }
    expect(buildLeadConvertRequest(lead)).toMatchObject({
      customerType: 'business',
      displayName: 'Carla Jiménez',
      businessName: 'Carla Jiménez',
    })
    expect(buildLeadOfflineCustomer(lead).customerType).toBe('b2b')
  })
})
