export const PIPELINE_EXCLUDED_LEAD_STATUSES = ['convertido', 'descartado']

export function leadStatusToOpportunityStage(status) {
  if (status === 'convertido') return 'cerrado'
  if (status === 'descartado') return 'perdido'
  if (status === 'contactado') return 'contactado'
  if (status === 'calificado') return 'propuesta'
  return 'nuevo'
}

/** Etapa del embudo mostrada en Lista (prioriza la oportunidad vinculada). */
export function leadPipelineStage(lead, opportunity) {
  if (opportunity?.stage) return opportunity.stage
  return leadStatusToOpportunityStage(lead?.status)
}

export function opportunityStageToLeadStatus(stage) {
  if (stage === 'perdido') return 'descartado'
  if (stage === 'cerrado') return 'convertido'
  if (stage === 'propuesta' || stage === 'negociacion') return 'calificado'
  if (stage === 'contactado') return 'contactado'
  return 'nuevo'
}

export function buildOpportunityDraftFromLead(lead, { id, timestamps }) {
  const createdAt = timestamps?.createdAt
  const updatedAt = timestamps?.updatedAt
  return {
    id,
    title: `${lead.company || lead.name} — Oportunidad`,
    leadId: lead.id,
    customerName: lead.company || lead.name,
    stage: leadStatusToOpportunityStage(lead.status),
    value: 0,
    branchId: lead.branchId,
    assignedUserId: lead.assignedUserId,
    notes: '',
    createdAt,
    updatedAt,
  }
}

export function leadsMissingPipeline(leads) {
  return (leads || []).filter((lead) => (
    !lead.opportunityId
    && !PIPELINE_EXCLUDED_LEAD_STATUSES.includes(lead.status)
  ))
}
