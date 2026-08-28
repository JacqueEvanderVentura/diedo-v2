import { SERP_HOUR_LIMIT, SERP_MONTH_LIMIT } from '@/data/crm'

const HOUR_MS = 60 * 60 * 1000

export function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function normalizeQuotaState(state = {}) {
  const now = Date.now()
  const monthKey = currentMonthKey()
  let { serpHourCount = 0, serpHourWindowStart = now, serpMonthCount = 0, serpMonthKey = monthKey } = state

  if (serpMonthKey !== monthKey) {
    serpMonthCount = 0
    serpMonthKey = monthKey
  }

  if (now - serpHourWindowStart >= HOUR_MS) {
    serpHourCount = 0
    serpHourWindowStart = now
  }

  return { serpHourCount, serpHourWindowStart, serpMonthCount, serpMonthKey }
}

export function resolveProvider(quotaState, { hasSerperKey = false } = {}) {
  const q = normalizeQuotaState(quotaState)
  const hourExceeded = q.serpHourCount >= SERP_HOUR_LIMIT
  const monthExceeded = q.serpMonthCount >= SERP_MONTH_LIMIT

  if (!hourExceeded && !monthExceeded) {
    return { provider: 'serp', reason: 'within_quota', quota: q }
  }

  if (hasSerperKey) {
    return {
      provider: 'serper',
      reason: monthExceeded ? 'month_exceeded' : 'hour_exceeded',
      quota: q,
    }
  }

  return {
    provider: null,
    reason: monthExceeded ? 'month_exceeded_no_serper' : 'hour_exceeded_no_serper',
    quota: q,
  }
}

export function getQuotaDisplay(quotaState) {
  const q = normalizeQuotaState(quotaState)
  return {
    hour: { used: q.serpHourCount, limit: SERP_HOUR_LIMIT },
    month: { used: q.serpMonthCount, limit: SERP_MONTH_LIMIT },
    monthKey: q.serpMonthKey,
  }
}

export function recordSerpUsage(state) {
  const q = normalizeQuotaState(state)
  const now = Date.now()
  return {
    serpHourCount: q.serpHourCount + 1,
    serpHourWindowStart: q.serpHourWindowStart,
    serpMonthCount: q.serpMonthCount + 1,
    serpMonthKey: q.serpMonthKey || currentMonthKey(new Date(now)),
  }
}
