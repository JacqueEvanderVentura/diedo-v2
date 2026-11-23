// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AgendarPage from '@/modules/agenda/pages/AgendarPage'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { publicBookingApi } from '@/services/publicBookingApi'

vi.mock('@/services/publicBookingApi', () => ({
  publicBookingApi: { getContext: vi.fn(), getEntryContext: vi.fn() },
}))

beforeEach(() => {
  vi.resetAllMocks()
  useSessionStore.setState({ status: 'anonymous', user: null })
  useConfigStore.setState({ branches: [] })
})
afterEach(cleanup)

function openLink(url) {
  return render(React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(AgendarPage)))
}

it('loads a shared branch without an administrator session or local branches', async () => {
  publicBookingApi.getEntryContext.mockResolvedValue({
    workspaceName: 'Comercio',
    workspaceBranches: [{ id: 'public-branch', name: 'Sucursal pública' }],
  })
  openLink('/agendar?branch=public-branch')
  expect(await screen.findByText('Elige tu sucursal')).toBeTruthy()
  expect(screen.getByTestId('branch-option-public-branch').textContent).toContain('Sucursal pública')
  expect(publicBookingApi.getEntryContext).toHaveBeenCalledWith('public-branch')
  expect(publicBookingApi.getContext).not.toHaveBeenCalled()
  expect(useConfigStore.getState().branches).toEqual([])
})

it('lists sibling branches when the link branch is not selectable', async () => {
  publicBookingApi.getEntryContext.mockResolvedValue({
    workspaceName: 'Comercio',
    workspaceBranches: [
      { id: 'branch-b', name: 'Sucursal Centro' },
      { id: 'branch-c', name: 'Sucursal Este' },
    ],
  })
  openLink('/agendar?branch=branch-disabled')
  expect(await screen.findByText('Elige tu sucursal')).toBeTruthy()
  expect(screen.getByTestId('branch-option-branch-b').textContent).toContain('Sucursal Centro')
  expect(screen.queryByText('Sucursal')).toBeNull()
  expect(publicBookingApi.getContext).not.toHaveBeenCalled()
})

it('does not flash the placeholder when switching branches', async () => {
  publicBookingApi.getEntryContext.mockResolvedValue({
    workspaceName: 'Comercio',
    workspaceBranches: [
      { id: 'branch-a', name: 'Sucursal Centro' },
      { id: 'branch-b', name: 'Sucursal Este' },
    ],
  })
  openLink('/agendar?branch=branch-a')
  await screen.findByTestId('branch-option-branch-a')
  fireEvent.click(screen.getByTestId('branch-option-branch-b'))
  expect(screen.getByTestId('branch-option-branch-b').className).toContain('bg-slate-900')
  expect(screen.queryByText(/^Sucursal$/)).toBeNull()
  expect(publicBookingApi.getContext).not.toHaveBeenCalled()
})

it('does not book against a local fallback branch when the shared link is invalid', async () => {
  useConfigStore.setState({ branches: [{ id: 'another-branch', name: 'Otra sucursal' }] })
  publicBookingApi.getEntryContext.mockRejectedValue(new Error('Not found'))
  openLink('/agendar?branch=missing')
  expect((await screen.findByRole('alert')).textContent).toContain('No se pudo cargar la sucursal')
  expect(screen.queryByText('Identifícate')).toBeNull()
  expect(publicBookingApi.getEntryContext).toHaveBeenCalledWith('missing')
  expect(publicBookingApi.getContext).not.toHaveBeenCalled()
})

it('shows an error when no branch was provided', async () => {
  openLink('/agendar')
  expect((await screen.findByRole('alert')).textContent).toContain('Indica una sucursal')
  expect(publicBookingApi.getEntryContext).not.toHaveBeenCalled()
  expect(publicBookingApi.getContext).not.toHaveBeenCalled()
})