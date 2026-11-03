// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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

  it('links to configuracion datos when running', () => {
    useImportJobStore.getState().startJob('agenda')
    useImportJobStore.getState().patchProgress({
      processed: 40,
      total: 100,
      batchIndex: 2,
      batchCount: 5,
      tickerSample: [],
    })

    renderBanner()

    const link = screen.getByTestId('import-job-banner')
    expect(link.getAttribute('href')).toBe('/configuracion?open=datos')
    expect(screen.getByText('Importando citas')).toBeTruthy()
    expect(screen.getByText('40 / 100')).toBeTruthy()
  })
})
