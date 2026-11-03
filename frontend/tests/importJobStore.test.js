import { afterEach, describe, expect, it, vi } from 'vitest'

import { useImportJobStore } from '@/stores/importJobStore'

describe('importJobStore', () => {
  afterEach(() => {
    useImportJobStore.getState().clearJob()
    vi.useRealTimers()
  })

  it('patchProgress appends ticker rows up to agenda cap', () => {
    const store = useImportJobStore.getState()
    store.startJob('agenda')
    store.setAgendaTickerCap(2)

    store.patchProgress({
      processed: 1,
      total: 10,
      batchIndex: 1,
      batchCount: 1,
      tickerSample: [{ id: 'a', displayName: 'A' }],
    })
    store.patchProgress({
      processed: 2,
      total: 10,
      batchIndex: 1,
      batchCount: 1,
      tickerSample: [{ id: 'b', displayName: 'B' }, { id: 'c', displayName: 'C' }],
    })

    const { tickerRows } = useImportJobStore.getState()
    expect(tickerRows.map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('finishJob clears running progress and schedules clearJob', () => {
    vi.useFakeTimers()
    const store = useImportJobStore.getState()
    store.startJob('customers')
    store.patchProgress({ processed: 5, total: 10, batchIndex: 1, batchCount: 2, tickerSample: [] })

    store.finishJob({
      report: { headline: '5/10 importados al sistema', rows: [] },
      headline: '5/10 importados al sistema',
    })

    expect(useImportJobStore.getState().status).toBe('done')
    expect(useImportJobStore.getState().progress).toBeNull()

    vi.advanceTimersByTime(8000)
    expect(useImportJobStore.getState().status).toBe('idle')
  })
})
