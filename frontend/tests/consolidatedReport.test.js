import { describe, expect, it } from 'vitest'
import {
  acquisitionBucket,
  buildConsolidatedReport,
  classifySaleChannel,
} from '@/modules/reportes/lib/consolidatedReport'

describe('consolidatedReport', () => {
  it('clasifica ventas CRM vs POS sin tratar un hold del POS como CRM', () => {
    expect(classifySaleChannel({ channel: 'crm' })).toBe('crm')
    expect(classifySaleChannel({ origin: 'pipeline', quoteId: 'qt-1' })).toBe('crm')
    expect(classifySaleChannel({ origin: 'crm', quoteId: 'qt-2' })).toBe('crm')
    expect(classifySaleChannel({ origin: 'pos', quoteId: 'held-1' })).toBe('pos')
    expect(classifySaleChannel({ quoteId: 'held-1' })).toBe('pos')
    expect(classifySaleChannel({ total: 100 })).toBe('pos')
  })

  it('agrupa montos por canal y personas por comercio vs redes', () => {
    const report = buildConsolidatedReport(
      {
        sales: [
          { id: 's1', total: 1000, createdAt: '2026-09-05T12:00:00Z', customer: { id: 'c1' }, channel: 'crm' },
          { id: 's2', total: 500, createdAt: '2026-09-06T12:00:00Z', customer: { id: 'c2' } },
          { id: 's3', total: 200, createdAt: '2026-09-07T12:00:00Z', origin: 'pos' },
          { id: 's4', total: 300, createdAt: '2026-09-08T12:00:00Z', customer: { id: 'c3' }, origin: 'pos' },
        ],
        customers: [
          { id: 'c1', acquisitionSource: 'whatsapp' },
          { id: 'c2', acquisitionSource: 'pos_walk_in' },
          { id: 'c3', acquisitionSource: 'app' },
        ],
      },
      { period: 'month' },
    )

    expect(report.totalSales).toBe(4)
    expect(report.salesByChannel.find((row) => row.id === 'crm')?.amount).toBe(1000)
    expect(report.salesByChannel.find((row) => row.id === 'pos')?.amount).toBe(1000)
    expect(acquisitionBucket('whatsapp')).toBe('social')
    expect(report.salesByAcquisition.find((row) => row.id === 'social')?.customers).toBe(1)
    expect(report.salesByAcquisition.find((row) => row.id === 'pos_walk_in')?.customers).toBe(2)
    expect(report.salesByAcquisition.find((row) => row.id === 'app')?.customers).toBe(1)
  })
})
