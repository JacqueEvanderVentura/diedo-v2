// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import DataImportPanel from '@/modules/configuracion/components/DataImportPanel'

const runImportJob = vi.fn()

vi.mock('@/stores/configStore', () => ({
  useConfigStore: (selector) => selector({
    branches: [{ id: 'b1', name: 'HQ' }],
  }),
}))

vi.mock('@/modules/configuracion/lib/runImportJob', () => ({
  runImportJob: (...args) => runImportJob(...args),
}))

describe('DataImportPanel agenda sync modal', () => {
  afterEach(() => {
    cleanup()
    runImportJob.mockReset()
  })

  it('asks whether to sync CRM clients before starting agenda import', async () => {
    render(<DataImportPanel embedded visibleBlockIds={null} />)

    const input = screen.getByTestId('data-import-file-agenda')
    const file = new File(['x'], 'agenda.csv', { type: 'text/csv' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(screen.getByTestId('data-import-agenda-sync-modal')).toBeTruthy()
    fireEvent.click(screen.getByTestId('data-import-agenda-sync-customers'))

    await waitFor(() => {
      expect(runImportJob).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'agenda',
        targetBranchId: 'b1',
        syncCustomers: true,
      }))
    })
  })
})
