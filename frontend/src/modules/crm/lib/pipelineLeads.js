export const PIPELINE_EXCLUDED_LEAD_STATUSES = ['convertido', 'descartado']

export function leadStatusToOpportunityStage(status) {
  if (status === 'contactado') return 'contactado'
  if (status === 'calificado') return 'propuesta'
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
    value: Math.round((lead.score || 50) * 500),
    branchId: lead.branchId,
    assignedUserId: lead.assignedUserId,
    notes: lead.scoreNotes || '',
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
