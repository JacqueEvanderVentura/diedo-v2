export const PIPELINE_STAGES = [
  'nuevo',
  'contactado',
  'propuesta',
  'negociacion',
  'cerrado',
  'perdido',
]

export const PIPELINE_OPEN_STAGES = PIPELINE_STAGES.filter(
  (stage) => !['cerrado', 'perdido'].includes(stage),
)

/** Etapa del embudo: el status del lead es la etapa. */
export function leadPipelineStage(lead) {
  const status = lead?.status
  if (PIPELINE_STAGES.includes(status)) return status
  return 'nuevo'
}

export function leadDisplayTitle(lead) {
  if (!lead) return 'Sin nombre'
  return lead.company?.trim() || lead.name?.trim() || 'Sin nombre'
}

/** Id del lead asociado a un ítem de cola (embudo simplificado o legacy con leadId). */
export function queueItemLeadId(queueItem) {
  return queueItem?.leadId || queueItem?.id || null
}

export function resolveLeadFromQueueItem(queueItem, leads = []) {
  if (!queueItem) return null
  const leadId = queueItemLeadId(queueItem)
  if (!leadId) return queueItem
  return leads.find((item) => item.id === leadId) || queueItem
}

export function leadsMissingPipeline() {
  return []
}
