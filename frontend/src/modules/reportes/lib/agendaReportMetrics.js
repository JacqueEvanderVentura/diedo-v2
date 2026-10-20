import { resolvePeriodRange } from '@/lib/datePeriod'

function round1(value) {
  return Math.round(value * 10) / 10
}

function distributionValue(distribution, id) {
  return distribution.find((point) => point.id === id)?.value || 0
}

export function agendaPeriodDays(params) {
  if (!params?.period || params.period === 'all') return null
  const { start, end } = resolvePeriodRange({
    period: params.period,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  })
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.max(1, Math.round((endDay - startDay) / 86400000) + 1)
}

function averagePerDay(count, periodDays) {
  if (!periodDays || periodDays <= 0) return null
  return round1(count / periodDays)
}

function formatAvgPerDay(count, periodDays) {
  const avg = averagePerDay(count, periodDays)
  if (avg === null) return null
  return `${avg} / día`
}

export function enrichAgendaSummary(summary, params) {
  const distribution = summary.statusDistribution || []
  const total = Number(summary.total) || 0
  const pending = distributionValue(distribution, 'confirmada')
  const completed = Number(summary.attended) || distributionValue(distribution, 'cumplida')
  const noShow = Number(summary.noShow) || distributionValue(distribution, 'noshow')
  const cancelled = Number(summary.cancelled) || distributionValue(distribution, 'cancelada')
  const periodDays = agendaPeriodDays(params)

  const pct = (part) => (total > 0 ? round1((part / total) * 100) : 0)

  return {
    ...summary,
    pending,
    completed,
    periodDays,
    avgTotalPerDay: averagePerDay(total, periodDays),
    avgPendingPerDay: averagePerDay(pending, periodDays),
    avgCompletedPerDay: averagePerDay(completed, periodDays),
    avgCancelledPerDay: averagePerDay(cancelled, periodDays),
    avgNoShowPerDay: averagePerDay(noShow, periodDays),
    cancellationRate: pct(cancelled),
    completionRate: pct(completed),
    pendingRate: pct(pending),
    avgTotalLabel: formatAvgPerDay(total, periodDays),
    avgPendingLabel: formatAvgPerDay(pending, periodDays),
    avgCompletedLabel: formatAvgPerDay(completed, periodDays),
    avgCancelledLabel: formatAvgPerDay(cancelled, periodDays),
    avgNoShowLabel: formatAvgPerDay(noShow, periodDays),
  }
}
