import { describe, expect, it } from 'vitest'
import {
  agendaPeriodDays,
  enrichAgendaSummary,
} from '@/modules/reportes/lib/agendaReportMetrics'

describe('agendaReportMetrics', () => {
  it('computes averages for a month period', () => {
    const enriched = enrichAgendaSummary({
      total: 31,
      attended: 10,
      noShow: 2,
      cancelled: 3,
      selfBooking: 1,
      attendanceRate: 83.3,
      statusDistribution: [
        { id: 'confirmada', value: 16 },
        { id: 'cumplida', value: 10 },
        { id: 'noshow', value: 2 },
        { id: 'cancelada', value: 3 },
      ],
    }, { period: 'month' })

    expect(enriched.pending).toBe(16)
    expect(enriched.completed).toBe(10)
    expect(enriched.periodDays).toBeGreaterThan(27)
    expect(enriched.avgTotalPerDay).toBeGreaterThan(0)
    expect(enriched.avgCancelledPerDay).toBeGreaterThan(0)
    expect(enriched.cancellationRate).toBeCloseTo(9.7, 0)
  })

  it('skips daily averages when period is all', () => {
    const enriched = enrichAgendaSummary({
      total: 100,
      attended: 40,
      noShow: 5,
      cancelled: 10,
      statusDistribution: [],
    }, { period: 'all' })

    expect(agendaPeriodDays({ period: 'all' })).toBeNull()
    expect(enriched.avgTotalPerDay).toBeNull()
    expect(enriched.avgTotalLabel).toBeNull()
  })
})
