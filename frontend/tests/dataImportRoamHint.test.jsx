// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import DataImportPanel from '@/modules/configuracion/components/DataImportPanel'
import { useImportJobStore } from '@/stores/importJobStore'

vi.mock('@/stores/configStore', () => ({
  useConfigStore: (selector) => selector({
    branches: [{ id: 'b1', name: 'HQ' }],
  }),
}))

describe('DataImportPanel roam hint', () => {
  afterEach(() => {
    cleanup()
    useImportJobStore.getState().clearJob()
  })

  it('shows roam hint while agenda import is running', () => {
    useImportJobStore.getState().startJob('agenda')
    useImportJobStore.getState().patchProgress({
      processed: 10,
      total: 50,
      batchIndex: 1,
      batchCount: 1,
      tickerSample: [],
    })

    render(<DataImportPanel embedded visibleBlockIds={null} />)

    expect(screen.getByTestId('data-import-roam-hint')).toBeTruthy()
    expect(screen.getByText(/Puedes continuar yendo a la app/)).toBeTruthy()
  })
})
