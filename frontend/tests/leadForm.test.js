import { describe, expect, it } from 'vitest'
import { buildLeadSubmitPayload, inferLeadCustomerType } from '@/modules/crm/lib/leadForm'

describe('leadForm', () => {
  it('infiere B2B cuando hay empresa distinta al contacto', () => {
    expect(inferLeadCustomerType({ name: 'Ana', company: 'Acme SRL' })).toBe('b2b')
    expect(inferLeadCustomerType({ name: '', company: 'Acme' })).toBe('b2b')
  })

  it('infiere B2C cuando solo hay nombre de persona', () => {
    expect(inferLeadCustomerType({ name: 'Juan', company: '' })).toBe('b2c')
  })

  it('arma payload B2C sin empresa ni sitio web', () => {
    const result = buildLeadSubmitPayload({
      customerType: 'b2c',
      name: 'María',
      company: 'ignorada',
      email: '',
      phone: '809',
      website: 'https://x.com',
      instagramUrl: '',
      location: 'SD',
      acquisitionSource: 'whatsapp',
    })
    expect(result.error).toBeUndefined()
    expect(result.company).toBe('')
    expect(result.website).toBeNull()
    expect(result.name).toBe('María')
  })

  it('exige empresa o contacto en B2B', () => {
    expect(buildLeadSubmitPayload({
      customerType: 'b2b',
      name: '',
      company: '',
      email: '',
      phone: '',
      website: '',
      instagramUrl: '',
      location: '',
      acquisitionSource: 'whatsapp',
    }).error).toBeTruthy()
  })
})
