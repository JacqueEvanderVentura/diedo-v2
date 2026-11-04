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

  it('finishJob keeps done state and progress at 100% until cleared', () => {
    const store = useImportJobStore.getState()
    store.startJob('customers')
    store.patchProgress({ processed: 5, total: 10, batchIndex: 1, batchCount: 2, tickerSample: [] })

    store.finishJob({
      report: { headline: '5/10 importados al sistema', rows: [], totalInFile: 10, processed: 10, summary: {} },
      headline: '5/10 importados al sistema',
    })

    const state = useImportJobStore.getState()
    expect(state.status).toBe('done')
    expect(state.progress).toMatchObject({ processed: 10, total: 10 })
    expect(state.report).toBeTruthy()
  })

  it('dismissBanner hides header pill but keeps report for the import page', () => {
    const store = useImportJobStore.getState()
    store.finishJob({
      report: { headline: 'ok', rows: [] },
      headline: 'ok',
    })
    store.dismissBanner()
    expect(useImportJobStore.getState().bannerDismissed).toBe(true)
    expect(useImportJobStore.getState().status).toBe('done')
    expect(useImportJobStore.getState().report).toBeTruthy()
  })
})
