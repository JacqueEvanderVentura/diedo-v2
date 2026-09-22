import { describe, expect, it } from 'vitest'
import { formatOpportunityOfferText, resolveInstagramUrl } from '@/modules/crm/lib/simplifiedOffer'

describe('simplifiedOffer', () => {
  it('formats linked quote text for clipboard', () => {
    const text = formatOpportunityOfferText([
      {
        id: 'q1',
        opportunityId: 'opp-1',
        number: 'COT-100',
        status: 'borrador',
        total: 2500,
        items: [{ name: 'Facial', qty: 1, price: 2500 }],
      },
    ], 'opp-1', { customerName: 'María López' })

    expect(text).toContain('Hola María,')
    expect(text).toContain('COT-100')
    expect(text).toContain('Facial')
    expect(text).toContain('RD$')
  })

  it('resolves instagram profile url from lead website', () => {
    expect(resolveInstagramUrl({ website: 'instagram.com/charmrd' })).toBe('https://instagram.com/charmrd')
    expect(resolveInstagramUrl({ website: 'https://www.instagram.com/charm' })).toContain('instagram.com')
    expect(resolveInstagramUrl({ website: 'example.com' })).toBeNull()
  })

  it('prioriza IG independiente y acepta un cliente convertido', () => {
    expect(resolveInstagramUrl({
      website: 'https://empresa.example',
      instagramUrl: 'https://www.instagram.com/empresa/',
    })).toBe('https://www.instagram.com/empresa/')
    expect(resolveInstagramUrl({ instagramUrl: 'https://www.instagram.com/cliente/' }))
      .toBe('https://www.instagram.com/cliente/')
  })
})
