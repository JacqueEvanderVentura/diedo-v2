// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  ensureWorkspaceSettings: vi.fn(() => Promise.resolve()),
  updateUiMode: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/stores/crmStore', () => ({
  useCrmStore: (selector) =>
    selector({
      uiMode: 'standard',
      uiModeVersion: 2,
      ensureWorkspaceSettings: mocks.ensureWorkspaceSettings,
      updateUiMode: mocks.updateUiMode,
    }),
}))

import CrmModePanel from '@/modules/configuracion/components/CrmModePanel'
import { useSessionStore } from '@/stores/sessionStore'

describe('CrmModePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionStore.setState({
      hasPermission: (code) => code === 'crm.read',
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('describe la preferencia como personal del usuario', () => {
    render(
      <MemoryRouter>
        <CrmModePanel />
      </MemoryRouter>
    )
    const panel = screen.getByTestId('crm-mode-panel')
    expect(within(panel).getByText(/tu usuario/i)).toBeTruthy()
    expect(screen.queryByText(/todo el workspace/i)).toBeNull()
  })

  it('permite cambiar el modo con crm.read', () => {
    render(
      <MemoryRouter>
        <CrmModePanel />
      </MemoryRouter>
    )
    const panel = screen.getByTestId('crm-mode-panel')
    expect(within(panel).getByTestId('crm-mode-simplified').disabled).toBe(false)
    expect(screen.queryByText(/administración del CRM/i)).toBeNull()
  })
})
