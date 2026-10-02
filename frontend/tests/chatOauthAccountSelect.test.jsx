// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'

vi.mock('@/services/chatApi', () => ({
  chatApi: {
    listChannelAccounts: vi.fn().mockResolvedValue({ items: [] }),
    getOAuthPending: vi.fn(),
    completeOAuth: vi.fn(),
  },
}))

import { chatApi } from '@/services/chatApi'
import ChatChannelsPanel from '@/modules/configuracion/components/ChatChannelsPanel'

const candidates = [
  {
    providerAccountId: '1027333093792215',
    displayName: 'Somnus Systems',
    phoneNumber: '+1 829-742-6018',
  },
  {
    providerAccountId: '1403949019458708',
    displayName: 'Test Number',
    phoneNumber: '+1 555-151-3101',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  useSessionStore.setState({
    status: 'online',
    user: { effectivePermissionCodes: ['workspace.update'] },
  })
  chatApi.listChannelAccounts.mockResolvedValue({ items: [] })
  chatApi.getOAuthPending.mockResolvedValue({ channel: 'whatsapp', candidates })
})

afterEach(cleanup)

describe('Meta account picker', () => {
  it('ignores extra clicks while the selected account is connecting', async () => {
    let finish
    chatApi.completeOAuth.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )

    render(
      <MemoryRouter
        initialEntries={[
          '/configuracion?chatOauth=select&chatOauthState=state-1&chatChannel=whatsapp',
        ]}
      >
        <ChatChannelsPanel embedded />
      </MemoryRouter>,
    )

    const somnus = await screen.findByRole('button', { name: /Somnus Systems/ })
    const testNumber = screen.getByRole('button', { name: /Test Number/ })
    fireEvent.click(somnus)
    fireEvent.click(somnus)
    fireEvent.click(testNumber)

    expect(chatApi.completeOAuth).toHaveBeenCalledTimes(1)
    expect(somnus.getAttribute('aria-busy')).toBe('true')
    expect(somnus.disabled).toBe(true)
    expect(testNumber.disabled).toBe(true)
    expect(screen.queryByText('Asignar sucursales')).toBeNull()

    finish({
      id: 'account-1',
      channel: 'whatsapp',
      displayName: 'Somnus Systems',
      connectionStatus: 'connected',
      assignedBranchIds: [],
    })

    await waitFor(() => {
      expect(screen.getByText('Asignar sucursales')).toBeTruthy()
    })
    expect(screen.getAllByText('Asignar sucursales')).toHaveLength(1)
  })
})
