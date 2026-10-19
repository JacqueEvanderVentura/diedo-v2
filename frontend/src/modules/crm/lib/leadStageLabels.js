import { SIMPLIFIED_STAGE_TABS } from '@/modules/crm/lib/simplifiedStageMove'
import { STAGE_META } from '@/data/crm'

const SIMPLIFIED_LABEL_BY_STATUS = Object.fromEntries(
  SIMPLIFIED_STAGE_TABS.map((tab) => [tab.id, tab.label.replace(/s$/, '')]),
)

export function leadStageDisplayLabel(status) {
  if (!status) return '—'
  const simplified = SIMPLIFIED_LABEL_BY_STATUS[status]
  if (simplified) return simplified
  return STAGE_META[status]?.label || status
}

export function formatLeadStageMoveTitle(fromStatus, toStatus) {
  const fromLabel = leadStageDisplayLabel(fromStatus)
  const toLabel = leadStageDisplayLabel(toStatus)
  return `Movido de ${fromLabel} a ${toLabel}`
}

export function isLeadStageMoveActivity(activity) {
  const title = String(activity?.title || '')
  return title.startsWith('Movido de ')
}
