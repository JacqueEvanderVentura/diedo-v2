import { opportunityStageToLeadStatus } from '@/modules/crm/lib/pipelineLeads'

export const SIMPLIFIED_STAGE_TABS = [
  { id: 'nuevo', label: 'Nuevos' },
  { id: 'contactado', label: 'Contactados' },
  { id: 'propuesta', label: 'Interesados' },
  { id: 'negociacion', label: 'Seguimiento' },
  { id: 'cerrado', label: 'Ganados' },
  { id: 'perdido', label: 'Perdidos' },
]

export const SIMPLIFIED_STAGE_LOST_OPTION_VALUE = 'perdido'

/** Options for the detail-panel stage select (includes «Marcar como perdido»). */
export function simplifiedStageSelectOptions() {
  return [
    ...SIMPLIFIED_STAGE_TABS.filter((tab) => tab.id !== 'perdido').map((tab) => ({ value: tab.id, label: tab.label })),
    { value: SIMPLIFIED_STAGE_LOST_OPTION_VALUE, label: 'Marcar como perdido' },
  ]
}

/** Stages that can be set with a direct PATCH (no invoice / lost reason). */
export const SIMPLIFIED_DIRECT_MOVE_STAGES = ['nuevo', 'contactado', 'propuesta', 'negociacion']

export function canDirectMoveSimplifiedStage(stage) {
  return SIMPLIFIED_DIRECT_MOVE_STAGES.includes(stage)
}

export function simplifiedStageMoveResult(fromStage, toStage) {
  if (!toStage || toStage === fromStage) return { type: 'noop' }
  if (toStage === 'cerrado') return { type: 'requires_payment' }
  if (toStage === 'perdido') return { type: 'requires_lost_reason' }
  if (!canDirectMoveSimplifiedStage(toStage)) return { type: 'invalid' }
  return { type: 'moved', stage: toStage }
}

/**
 * Move opportunity stage from simplified CRM (tabs drag or edit).
 * Returns result type; does not throw for cerrado/perdido (caller shows UI).
 */
export async function applySimplifiedOpportunityStageMove({
  opportunityId,
  leadId,
  leadStatus,
  fromStage,
  toStage,
  updateOpportunity,
  updateLead,
}) {
  const result = simplifiedStageMoveResult(fromStage, toStage)
  if (result.type !== 'moved') return result

  await updateOpportunity(opportunityId, { stage: result.stage })
  if (leadId && leadStatus !== 'convertido') {
    await updateLead(leadId, { status: opportunityStageToLeadStatus(result.stage) })
  }
  return result
}

export function resolveSimplifiedStageDrop(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY)
  const tab = element?.closest('[data-simplified-stage]')
  return tab?.dataset?.simplifiedStage || null
}
