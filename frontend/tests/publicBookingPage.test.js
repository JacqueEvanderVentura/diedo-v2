// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AgendarPage from '@/modules/agenda/pages/AgendarPage'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { publicBookingApi } from '@/services/publicBookingApi'

vi.mock('@/services/publicBookingApi', () => ({
  publicBookingApi: { getContext: vi.fn() },
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
  publicBookingApi.getContext.mockResolvedValue({
    branch: { branchId: 'public-branch', branchName: 'Sucursal pública' },
    services: [], specialists: [],
  })
  openLink('/agendar?branch=public-branch')
  expect(await screen.findByText('Sucursal pública')).toBeTruthy()
  expect(screen.getByText('Identifícate')).toBeTruthy()
  expect(publicBookingApi.getContext).toHaveBeenCalledWith('public-branch')
  expect(useConfigStore.getState().branches).toEqual([])
})

it('does not book against a local fallback branch when the shared link is invalid', async () => {
  useConfigStore.setState({ branches: [{ id: 'another-branch', name: 'Otra sucursal' }] })
  publicBookingApi.getContext.mockRejectedValue(new Error('Not found'))
  openLink('/agendar?branch=missing')
  expect((await screen.findByRole('alert')).textContent).toContain('No se pudo cargar la sucursal')
  expect(screen.queryByText('Identifícate')).toBeNull()
  expect(publicBookingApi.getContext).toHaveBeenCalledWith('missing')
})

it('requests a valid link when no branch was provided', async () => {
  openLink('/agendar')
  expect((await screen.findByRole('alert')).textContent).toContain('no contiene una sucursal')
  expect(publicBookingApi.getContext).not.toHaveBeenCalled()
})
