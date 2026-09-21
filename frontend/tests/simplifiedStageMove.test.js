import { describe, expect, it, vi } from 'vitest'
import {
  applySimplifiedOpportunityStageMove,
  canDirectMoveSimplifiedStage,
  simplifiedStageMoveResult,
  simplifiedStageSelectOptions,
  SIMPLIFIED_STAGE_LOST_OPTION_VALUE,
} from '@/modules/crm/lib/simplifiedStageMove'

describe('simplifiedStageMove', () => {
  it('classifies direct moves vs payment and lost', () => {
    expect(simplifiedStageMoveResult('nuevo', 'contactado')).toEqual({ type: 'moved', stage: 'contactado' })
    expect(simplifiedStageMoveResult('nuevo', 'nuevo')).toEqual({ type: 'noop' })
    expect(simplifiedStageMoveResult('contactado', 'cerrado')).toEqual({ type: 'requires_payment' })
    expect(simplifiedStageMoveResult('nuevo', 'perdido')).toEqual({ type: 'requires_lost_reason' })
  })

  it('includes marcar como perdido in detail select options', () => {
    const options = simplifiedStageSelectOptions()
    expect(options.some((row) => row.value === SIMPLIFIED_STAGE_LOST_OPTION_VALUE)).toBe(true)
    expect(options.filter((row) => row.value === 'cerrado')).toHaveLength(1)
  })

  it('lists droppable stages without cerrado', () => {
    expect(canDirectMoveSimplifiedStage('negociacion')).toBe(true)
    expect(canDirectMoveSimplifiedStage('cerrado')).toBe(false)
  })

  it('updates opportunity and syncs lead status on direct move', async () => {
    const updateOpportunity = vi.fn().mockResolvedValue({})
    const updateLead = vi.fn().mockResolvedValue({})

    const result = await applySimplifiedOpportunityStageMove({
      opportunityId: 'opp-1',
      leadId: 'lead-1',
      fromStage: 'nuevo',
      toStage: 'contactado',
      updateOpportunity,
      updateLead,
    })

    expect(result).toEqual({ type: 'moved', stage: 'contactado' })
    expect(updateOpportunity).toHaveBeenCalledWith('opp-1', { stage: 'contactado' })
    expect(updateLead).toHaveBeenCalledWith('lead-1', { status: 'contactado' })
  })

  it('does not patch when moving to ganados', async () => {
    const updateOpportunity = vi.fn()
    const updateLead = vi.fn()

    const result = await applySimplifiedOpportunityStageMove({
      opportunityId: 'opp-1',
      leadId: 'lead-1',
      fromStage: 'propuesta',
      toStage: 'cerrado',
      updateOpportunity,
      updateLead,
    })

    expect(result).toEqual({ type: 'requires_payment' })
    expect(updateOpportunity).not.toHaveBeenCalled()
    expect(updateLead).not.toHaveBeenCalled()
  })
})
