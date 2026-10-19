import { describe, expect, it, vi } from 'vitest'
import {
  applySimplifiedLeadStageMove,
  canDirectMoveSimplifiedStage,
  simplifiedStageMoveResult,
  simplifiedStageSelectOptions,
  SIMPLIFIED_STAGE_LOST_OPTION_VALUE,
  SIMPLIFIED_STAGE_TABS,
} from '@/modules/crm/lib/simplifiedStageMove'

describe('simplifiedStageMove', () => {
  it('classifies direct moves vs payment and lost', () => {
    expect(simplifiedStageMoveResult('nuevo', 'contactado')).toEqual({ type: 'moved', stage: 'contactado' })
    expect(simplifiedStageMoveResult('nuevo', 'nuevo')).toEqual({ type: 'noop' })
    expect(simplifiedStageMoveResult('contactado', 'cerrado')).toEqual({ type: 'requires_payment' })
    expect(simplifiedStageMoveResult('nuevo', 'perdido')).toEqual({ type: 'requires_lost_reason' })
  })

  it('includes marcar como perdido in detail select options', () => {
    expect(SIMPLIFIED_STAGE_TABS).toContainEqual({ id: 'perdido', label: 'Perdidos' })
    const options = simplifiedStageSelectOptions()
    expect(options.filter((row) => row.value === SIMPLIFIED_STAGE_LOST_OPTION_VALUE)).toHaveLength(1)
    expect(options.filter((row) => row.value === 'cerrado')).toHaveLength(1)
  })

  it('lists droppable stages without cerrado', () => {
    expect(canDirectMoveSimplifiedStage('negociacion')).toBe(true)
    expect(canDirectMoveSimplifiedStage('cerrado')).toBe(false)
  })

  it('updates lead status on direct move', async () => {
    const updateLead = vi.fn().mockResolvedValue({})

    const result = await applySimplifiedLeadStageMove({
      leadId: 'lead-1',
      fromStage: 'nuevo',
      toStage: 'contactado',
      updateLead,
    })

    expect(result).toEqual({ type: 'moved', stage: 'contactado' })
    expect(updateLead).toHaveBeenCalledWith('lead-1', { status: 'contactado' })
  })

  it('mueve el lead actualizando solo su etapa en el embudo', async () => {
    const updateLead = vi.fn().mockResolvedValue({})
    const result = await applySimplifiedLeadStageMove({
      leadId: 'lead-1',
      fromStage: 'propuesta',
      toStage: 'negociacion',
      updateLead,
    })
    expect(result).toEqual({ type: 'moved', stage: 'negociacion' })
    expect(updateLead).toHaveBeenCalledWith('lead-1', { status: 'negociacion' })
  })

  it('does not patch when moving to ganados', async () => {
    const updateLead = vi.fn()

    const result = await applySimplifiedLeadStageMove({
      leadId: 'lead-1',
      fromStage: 'propuesta',
      toStage: 'cerrado',
      updateLead,
    })

    expect(result).toEqual({ type: 'requires_payment' })
    expect(updateLead).not.toHaveBeenCalled()
  })
})
