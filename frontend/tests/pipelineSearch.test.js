import { describe, expect, it } from 'vitest'
import { opportunityMatchesQuery } from '@/modules/crm/lib/pipelineSearch'

describe('pipelineSearch', () => {
  const opportunity = {
    id: 'opp-abc',
    title: 'Cotización Cortinaje',
    customerName: 'Claudette Cochon',
  }

  it('matches by customer name', () => {
    expect(opportunityMatchesQuery(opportunity, {}, 'claudette')).toBe(true)
  })

  it('matches kommo external id on linked lead', () => {
    const lead = { rawSnippet: 'kommo:19989539', phone: '+18095551234' }
    expect(opportunityMatchesQuery(opportunity, { lead }, '19989539')).toBe(true)
  })

  it('matches phone digits ignoring formatting', () => {
    const lead = { phone: '+1 (809) 555-1234' }
    expect(opportunityMatchesQuery(opportunity, { lead }, '8095551234')).toBe(true)
  })

  it('returns all when query is empty', () => {
    expect(opportunityMatchesQuery(opportunity, {}, '')).toBe(true)
  })
})
