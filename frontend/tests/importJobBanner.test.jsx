// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { ImportJobBanner } from '@/components/layout/ImportJobBanner'
import { useImportJobStore } from '@/stores/importJobStore'

function renderBanner() {
  return render(
    <MemoryRouter>
      <ImportJobBanner />
    </MemoryRouter>,
  )
}

describe('ImportJobBanner', () => {
  afterEach(() => {
    cleanup()
    useImportJobStore.getState().clearJob()
  })

  it('shows running progress in the header pill', () => {
    useImportJobStore.getState().startJob('agenda')
    useImportJobStore.getState().patchProgress({
      processed: 40,
      total: 100,
      batchIndex: 2,
      batchCount: 5,
      tickerSample: [],
    })

    renderBanner()

    expect(screen.getByTestId('import-job-banner')).toBeTruthy()
    expect(screen.getByText('Importando citas')).toBeTruthy()
    expect(screen.getByText('40 / 100')).toBeTruthy()
  })

  it('stays at 100% when done and opens summary modal on click', () => {
    useImportJobStore.getState().startJob('agenda')
    useImportJobStore.getState().finishJob({
      report: {
        headline: '10/10 importados',
        totalInFile: 10,
        processed: 10,
        summary: { created: 10, updated: 0, skipped: 0, error: 0 },
        rows: [],
      },
      headline: '10/10 importados',
    })

    renderBanner()

    fireEvent.click(screen.getByTitle('Ver resumen de importación'))
    expect(screen.getByTestId('import-job-report-modal')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Resumen de importación' })).toBeTruthy()
  })

  it('dismisses only the header pill', () => {
    useImportJobStore.getState().startJob('customers')
    useImportJobStore.getState().finishJob({
      report: { headline: 'ok', rows: [], summary: {}, totalInFile: 1, processed: 1 },
      headline: 'ok',
    })

    renderBanner()
    fireEvent.click(screen.getByTestId('import-job-banner-dismiss'))

    expect(screen.queryByTestId('import-job-banner')).toBeNull()
    expect(useImportJobStore.getState().report).toBeTruthy()
  })
})
