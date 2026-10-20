import { ACQUISITION_SOURCE_LABELS } from '@/data/crm'

const ORIGIN_COLORS = {
  whatsapp: '#22c55e',
  instagram: '#e1306c',
  ai: '#0ea5e9',
  app: '#a855f7',
  referral: '#f59e0b',
  pos_walk_in: '#3b82f6',
  otros: '#64748b',
  unknown: '#94a3b8',
}

export function originColor(id) {
  return ORIGIN_COLORS[id] || '#64748b'
}

export function originLabel(id, fallback) {
  return ACQUISITION_SOURCE_LABELS[id] || fallback || id
}

export function formatDwellHours(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const hours = Number(value)
  if (hours < 24) return `${hours.toFixed(1)} h`
  const days = Math.floor(hours / 24)
  const rem = hours % 24
  if (rem < 0.5) return `${days} d`
  return `${days} d ${rem.toFixed(0)} h`
}

function number(value) {
  return Number(value) || 0
}

function mapDwellStats(stats) {
  if (!stats) {
    return { sampleCount: 0, avgHours: null, medianHours: null }
  }
  return {
    sampleCount: stats.sampleCount ?? 0,
    avgHours: stats.avgHours != null ? number(stats.avgHours) : null,
    medianHours: stats.medianHours != null ? number(stats.medianHours) : null,
  }
}

export function mapPipelineSummaryFromApi(data) {
  if (!data) return null
  return {
    totalLeads: data.totalLeads ?? 0,
    withOriginPct: number(data.withOriginPct),
    wonCount: data.wonCount ?? 0,
    lostCount: data.lostCount ?? 0,
    lossRate: data.lossRate != null ? number(data.lossRate) : null,
    winRate: data.winRate != null ? number(data.winRate) : null,
    openPipelineCount: data.openPipelineCount ?? 0,
    openPipelineValue: number(data.openPipelineValue),
    byOrigin: (data.byOrigin || []).map((row) => ({
      id: row.id,
      label: row.label || originLabel(row.id),
      count: row.count ?? 0,
      sharePct: number(row.sharePct),
      won: row.won ?? 0,
      lost: row.lost ?? 0,
      open: row.open ?? 0,
      winRate: row.winRate != null ? number(row.winRate) : null,
      lossRate: row.lossRate != null ? number(row.lossRate) : null,
      avgWonValue: row.avgWonValue != null ? number(row.avgWonValue) : null,
      avgLostValue: row.avgLostValue != null ? number(row.avgLostValue) : null,
      color: originColor(row.id),
    })),
    byStage: (data.byStage || []).map((row) => ({
      stage: row.stage,
      label: row.label,
      count: row.count ?? 0,
    })),
    stageDwell: (data.stageDwell || []).map((row) => ({
      stage: row.stage,
      label: row.label,
      sampleCount: row.sampleCount ?? 0,
      avgHours: row.avgHours != null ? number(row.avgHours) : null,
      medianHours: row.medianHours != null ? number(row.medianHours) : null,
    })),
    stageDwellByOrigin: (data.stageDwellByOrigin || []).map((row) => ({
      id: row.id,
      label: row.label || originLabel(row.id),
      nuevo: mapDwellStats(row.nuevo),
      contactado: mapDwellStats(row.contactado),
      color: originColor(row.id),
    })),
    lostReasons: (data.lostReasons || []).map((row) => ({
      reason: row.reason,
      count: row.count ?? 0,
    })),
  }
}
