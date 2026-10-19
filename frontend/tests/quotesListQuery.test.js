import { describe, expect, it } from 'vitest'
import { defaultQuotesDateFilter, quotesUpdatedRange } from '@/modules/crm/lib/quotesListQuery'

describe('quotesListQuery', () => {
  it('default filter is current month', () => {
    expect(defaultQuotesDateFilter()).toEqual({ period: 'month', dateFrom: null, dateTo: null })
  })

  it('all period returns no range', () => {
    expect(quotesUpdatedRange({ period: 'all' })).toBeNull()
  })

  it('month period returns start and end', () => {
    const range = quotesUpdatedRange({ period: 'month', dateFrom: null, dateTo: null })
    expect(range?.start).toBeInstanceOf(Date)
    expect(range?.end).toBeInstanceOf(Date)
    expect(range.end.getTime()).toBeGreaterThan(range.start.getTime())
  })
})
