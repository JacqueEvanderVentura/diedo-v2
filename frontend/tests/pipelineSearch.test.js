import { describe, expect, it } from 'vitest'
import { leadMatchesQuery } from '@/modules/crm/lib/pipelineSearch'

describe('pipelineSearch', () => {
  const lead = {
    id: 'lead-abc',
    company: 'Cotización Cortinaje',
    name: 'Claudette Cochon',
  }

  it('matches by customer name', () => {
    expect(leadMatchesQuery(lead, {}, 'claudette')).toBe(true)
  })

  it('matches kommo external id on linked lead', () => {
    const enriched = { ...lead, rawSnippet: 'kommo:19989539', phone: '+18095551234' }
    expect(leadMatchesQuery(enriched, {}, '19989539')).toBe(true)
  })

  it('matches phone digits ignoring formatting', () => {
    const withPhone = { ...lead, phone: '+1 (809) 555-1234' }
    expect(leadMatchesQuery(withPhone, {}, '8095551234')).toBe(true)
  })

  it('returns all when query is empty', () => {
    expect(leadMatchesQuery(lead, {}, '')).toBe(true)
  })
})
