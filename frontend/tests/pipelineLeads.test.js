import { describe, expect, it } from 'vitest'
import {
  leadPipelineStage,
  leadDisplayTitle,
  queueItemLeadId,
  resolveLeadFromQueueItem,
} from '@/modules/crm/lib/pipelineLeads'

describe('pipelineLeads', () => {
  it('uses lead status as pipeline stage', () => {
    expect(leadPipelineStage({ status: 'negociacion' })).toBe('negociacion')
    expect(leadPipelineStage({ status: 'contactado' })).toBe('contactado')
  })

  it('defaults unknown status to nuevo', () => {
    expect(leadPipelineStage({ status: 'calificado' })).toBe('nuevo')
    expect(leadPipelineStage({})).toBe('nuevo')
  })

  it('builds display title from company or name', () => {
    expect(leadDisplayTitle({ company: 'Acme', name: 'Ada' })).toBe('Acme')
    expect(leadDisplayTitle({ name: 'Ada' })).toBe('Ada')
  })

  it('resolves lead id from queue item with or without legacy leadId', () => {
    expect(queueItemLeadId({ id: 'lead-1' })).toBe('lead-1')
    expect(queueItemLeadId({ id: 'opp-1', leadId: 'lead-1' })).toBe('lead-1')
    const leads = [{ id: 'lead-1', name: 'Demo' }]
    expect(resolveLeadFromQueueItem({ id: 'lead-1' }, leads)).toEqual(leads[0])
    expect(resolveLeadFromQueueItem({ id: 'opp-1', leadId: 'lead-1' }, leads)).toEqual(leads[0])
  })
})
