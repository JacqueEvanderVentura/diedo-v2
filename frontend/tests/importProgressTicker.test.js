import { describe, expect, it } from 'vitest'

import {
  appendTickerRowsCapped,
  computeTickerLimit,
  getTickerWindow,
  nextTickerStartIndex,
  sequentialTickerRowsFromBatch,
  TICKER_MAX_ROWS,
  TICKER_VISIBLE_COUNT,
} from '@/modules/configuracion/lib/importProgressTicker'

describe('importProgressTicker', () => {
  it('computeTickerLimit caps at 30 regardless of file size', () => {
    expect(computeTickerLimit(11466)).toBe(30)
    expect(computeTickerLimit(100)).toBe(30)
    expect(computeTickerLimit(12)).toBe(12)
    expect(computeTickerLimit(0)).toBe(0)
  })

  it('collects created or skipped rows in batch order', () => {
    const batchResults = [
      { status: 'error', displayName: 'Bad' },
      { status: 'created', displayName: 'Cliente 0', appointmentId: 'a0' },
      { status: 'skipped', displayName: 'Cliente 1', appointmentId: 'a1' },
    ]

    const rows = sequentialTickerRowsFromBatch(batchResults)
    expect(rows.map((row) => row.displayName)).toEqual(['Cliente 0', 'Cliente 1'])
  })

  it('appendTickerRowsCapped keeps only the first rows up to cap', () => {
    const cap = 4
    let buffer = appendTickerRowsCapped([], [{ id: '1' }, { id: '2' }, { id: '3' }], cap)
    buffer = appendTickerRowsCapped(buffer, [{ id: '4' }, { id: '5' }], cap)
    expect(buffer.map((row) => row.id)).toEqual(['1', '2', '3', '4'])
    buffer = appendTickerRowsCapped(buffer, [{ id: '6' }], cap)
    expect(buffer.map((row) => row.id)).toEqual(['1', '2', '3', '4'])
  })

  it('carousel loops after the last window', () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({ id: String(index) }))
    expect(getTickerWindow(rows, 0, TICKER_VISIBLE_COUNT).map((row) => row.id)).toEqual(['0', '1', '2'])
    expect(nextTickerStartIndex(rows, 0)).toBe(1)
    expect(getTickerWindow(rows, 2, TICKER_VISIBLE_COUNT).map((row) => row.id)).toEqual(['2', '3', '4'])
    expect(nextTickerStartIndex(rows, 2)).toBe(0)
  })

  it('exports sensible max row constant', () => {
    expect(TICKER_MAX_ROWS).toBe(30)
  })
})
