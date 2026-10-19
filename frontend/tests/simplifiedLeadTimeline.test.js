import { describe, expect, it } from 'vitest'
import {
  buildSimplifiedLeadTimeline,
  leadQuotesForTimeline,
} from '@/modules/crm/lib/simplifiedLeadTimeline'

describe('simplifiedLeadTimeline', () => {
  it('lists quotes linked to the lead', () => {
    const quotes = [
      { id: 'q1', leadId: 'lead-1', status: 'enviada', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'q2', leadId: 'lead-2', status: 'borrador', createdAt: '2026-01-02T00:00:00Z' },
      { id: 'q3', leadId: 'lead-1', status: 'cancelada', createdAt: '2026-01-03T00:00:00Z' },
      {
        id: 'q4',
        leadId: 'lead-1',
        status: 'borrador',
        structuralStatus: 'cancelled',
        createdAt: '2026-01-04T00:00:00Z',
      },
    ]
    expect(leadQuotesForTimeline(quotes, 'lead-1').map((q) => q.id)).toEqual(['q4', 'q3', 'q1'])
  })

  it('merges activities and quotes by date', () => {
    const timeline = buildSimplifiedLeadTimeline(
      [{ id: 'a1', type: 'email', title: 'Correo', createdAt: '2026-01-05T00:00:00Z' }],
      [{ id: 'q1', leadId: 'lead-1', number: 'COT-1', status: 'borrador', total: 100, createdAt: '2026-01-10T00:00:00Z' }],
      'lead-1',
    )
    expect(timeline.map((row) => row.kind)).toEqual(['activity', 'quote'])
    expect(timeline[1].quote.number).toBe('COT-1')
  })
})
