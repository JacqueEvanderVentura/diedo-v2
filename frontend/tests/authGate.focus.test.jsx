/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { sessionState } = vi.hoisted(() => ({
  sessionState: {
    initialized: true,
    status: 'online',
    user: {
      workspaceId: 'workspace-1',
      isPlatformOperator: false,
      subscriptionStatus: 'active',
      enabledModules: [],
      effectivePermissionCodes: [],
    },
    bootstrap: vi.fn(),
    isAuthenticated: () => true,
    refreshCurrentUser: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('@/stores/sessionStore', () => {
  const store = (selector) => selector(sessionState)
  store.getState = () => sessionState
  return { useSessionStore: store }
})

vi.mock('@/services/moduleAvailability', () => ({
  isModuleAvailable: () => true,
  routeRequirement: () => null,
}))

vi.mock('@/components/auth/SubscriptionAccessNotice', () => ({
  SubscriptionAccessNotice: () => <div data-testid="subscription-notice" />,
}))

import { AUTH_FOCUS_REFRESH_MS, AuthGate } from '@/components/auth/AuthGate'

describe('AuthGate focus refresh', () => {
  beforeEach(() => {
    sessionState.refreshCurrentUser.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('no pega /auth/me en cada focus; espera 5 minutos desde el bootstrap', async () => {
    vi.useFakeTimers()
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<AuthGate />}>
            <Route path="/" element={<div data-testid="outlet">ok</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('outlet')).toBeTruthy()

    await act(async () => { window.dispatchEvent(new Event('focus')) })
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(sessionState.refreshCurrentUser).toHaveBeenCalledTimes(0)

    await act(async () => { await vi.advanceTimersByTimeAsync(AUTH_FOCUS_REFRESH_MS) })
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(sessionState.refreshCurrentUser).toHaveBeenCalledTimes(1)

    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(sessionState.refreshCurrentUser).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(AUTH_FOCUS_REFRESH_MS) })
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(sessionState.refreshCurrentUser).toHaveBeenCalledTimes(2)
  })
})
