import { describe, expect, it } from 'vitest'
import {
  mapCrmStateFromApi,
  mapLeadFromApi,
} from '@/services/adapters/crm'

describe('crm adapters', () => {
  it('maps lead star rating from api', () => {
    const lead = mapLeadFromApi({
      id: 'lead-id',
      assignedMembershipId: 'member-1',
      starRating: '3.5',
    })
    expect(lead.starRating).toBe(3.5)
  })

  it('maps crm state workspace settings', () => {
    const state = mapCrmStateFromApi({
      settings: { uiMode: 'standard', version: 4 },
      leads: [{ id: 'lead-id', assignedMembershipId: 'm1', starRating: null }],
      opportunities: [],
      activities: [],
      quotes: [],
    })
    expect(state.uiMode).toBe('standard')
    expect(state.uiModeVersion).toBe(4)
    expect(state.leads[0].starRating).toBeNull()
  })
})
