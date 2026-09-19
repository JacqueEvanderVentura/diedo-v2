import { describe, expect, it } from 'vitest'
import {
  leadPipelineStage,
  leadStatusToOpportunityStage,
  opportunityStageToLeadStatus,
} from '@/modules/crm/lib/pipelineLeads'

describe('pipelineLeads', () => {
  it('uses opportunity stage when linked', () => {
    const lead = { id: '1', status: 'contactado' }
    const opportunity = { leadId: '1', stage: 'negociacion' }
    expect(leadPipelineStage(lead, opportunity)).toBe('negociacion')
  })

  it('maps legacy lead status when there is no opportunity', () => {
    expect(leadStatusToOpportunityStage('calificado')).toBe('propuesta')
    expect(leadPipelineStage({ status: 'calificado' }, null)).toBe('propuesta')
  })

  it('round-trips editable stages to lead status', () => {
    expect(opportunityStageToLeadStatus('negociacion')).toBe('calificado')
    expect(opportunityStageToLeadStatus('contactado')).toBe('contactado')
  })
})
