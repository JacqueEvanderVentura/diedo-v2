import { describe, expect, it } from 'vitest'
import {
  buildLeadConvertRequest,
  buildLeadOfflineCustomer,
  leadHasDocument,
} from '@/modules/crm/lib/leadConversion'

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

  it('conserva el enlace de Instagram en la conversión offline', () => {
    const lead = { id: 'l1', name: 'Carla', instagramUrl: 'https://www.instagram.com/carla/' }
    expect(buildLeadOfflineCustomer(lead).instagramUrl).toBe(lead.instagramUrl)
  })

  it('leadHasDocument detecta documento en el lead', () => {
    expect(leadHasDocument({ documentId: '' })).toBe(false)
    expect(leadHasDocument({ documentId: '00112345678' })).toBe(true)
  })

  it('buildLeadConvertRequest usa documentOverride al convertir', () => {
    const lead = { id: 'l1', version: 1, name: 'Ana', branchId: 'b1' }
    expect(buildLeadConvertRequest(lead, { docType: 'cedula', documentId: '001-1234567-8' })).toMatchObject({
      documentType: 'cedula',
      documentId: '001-1234567-8',
    })
  })
})
