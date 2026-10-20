import { describe, expect, it } from 'vitest'
import { formatDwellHours, mapPipelineSummaryFromApi, originLabel } from '@/modules/reportes/lib/pipelineReport'

describe('pipelineReport', () => {
  it('maps API payload with separate acquisition channels', () => {
    const mapped = mapPipelineSummaryFromApi({
      totalLeads: 3,
      withOriginPct: '66.67',
      wonCount: 1,
      lostCount: 1,
      lossRate: '50.00',
      winRate: '50.00',
      openPipelineCount: 1,
      openPipelineValue: '500.00',
      byOrigin: [
        { id: 'whatsapp', label: 'WhatsApp', count: 1, sharePct: '33.33', won: 0, lost: 1, open: 0, lossRate: '100.00' },
        { id: 'instagram', label: 'Instagram', count: 1, sharePct: '33.33', won: 1, lost: 0, open: 0, winRate: '100.00' },
        { id: 'ai', label: 'AI', count: 1, sharePct: '33.33', won: 0, lost: 0, open: 1 },
      ],
      byStage: [],
      stageDwell: [{ stage: 'nuevo', label: 'Nuevo', sampleCount: 0, avgHours: null }],
      stageDwellByOrigin: [],
      lostReasons: [],
    })
    expect(mapped.byOrigin.map((row) => row.id)).toEqual(['whatsapp', 'instagram', 'ai'])
    expect(mapped.byOrigin[0].lossRate).toBe(100)
    expect(mapped.stageDwell[0].avgHours).toBeNull()
  })

  it('formats dwell hours for display', () => {
    expect(formatDwellHours(5.5)).toBe('5.5 h')
    expect(formatDwellHours(30)).toBe('1 d 6 h')
    expect(formatDwellHours(null)).toBe('—')
  })

  it('resolves origin labels', () => {
    expect(originLabel('whatsapp')).toBe('WhatsApp')
  })
})
