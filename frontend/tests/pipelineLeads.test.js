import { describe, expect, it } from 'vitest'
import {
  buildOpportunityDraftFromLead,
  leadStatusToOpportunityStage,
  leadsMissingPipeline,
} from '@/modules/crm/lib/pipelineLeads'

describe('pipelineLeads', () => {
  it('mapea el estado del lead a la columna del pipeline', () => {
    expect(leadStatusToOpportunityStage('nuevo')).toBe('nuevo')
    expect(leadStatusToOpportunityStage('contactado')).toBe('contactado')
    expect(leadStatusToOpportunityStage('calificado')).toBe('propuesta')
  })

  it('lista leads activos sin oportunidad', () => {
    const leads = [
      { id: '1', status: 'nuevo' },
      { id: '2', status: 'nuevo', opportunityId: 'opp-1' },
      { id: '3', status: 'convertido' },
    ]
    expect(leadsMissingPipeline(leads).map((lead) => lead.id)).toEqual(['1'])
  })

  it('arma borrador de oportunidad en etapa nuevo', () => {
    const draft = buildOpportunityDraftFromLead(
      { id: 'l1', company: 'SM Medicina', name: 'SM', status: 'nuevo', score: 76, branchId: 'b1' },
      { id: 'opp-1', timestamps: { createdAt: 't1', updatedAt: 't1' } },
    )
    expect(draft.stage).toBe('nuevo')
    expect(draft.title).toContain('SM Medicina')
  })
})
