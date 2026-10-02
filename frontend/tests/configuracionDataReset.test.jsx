// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ConfiguracionPage from '@/modules/configuracion/pages/ConfiguracionPage'
import { useSessionStore } from '@/stores/sessionStore'
import { administrationApi } from '@/services/administrationApi'

vi.mock('@/services/administrationApi', () => ({
  administrationApi: {
    resetWorkspaceData: vi.fn(),
  },
}))

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

const adminUser = {
  workspace: { slug: 'acme-demo', name: 'Acme Demo' },
  roleAssignments: [{ roleCode: 'workspace_admin', scopeType: 'workspace' }],
  effectiveScope: { workspaceWide: true },
  workspacePermissionCodes: ['workspace.update'],
}

const sellerUser = {
  workspace: { slug: 'acme-demo', name: 'Acme Demo' },
  roleAssignments: [{ roleCode: 'seller', scopeType: 'branch', branchId: 'b1' }],
  effectiveScope: { workspaceWide: false },
  workspacePermissionCodes: [],
}

function seedSession(user) {
  useSessionStore.setState({
    status: 'online',
    user,
    accessToken: 'token',
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useSessionStore.setState({ status: 'demo', user: null, accessToken: null })
})

describe('Configuracion data reset', () => {
  it('muestra zona de peligro solo para workspace_admin online', () => {
    seedSession(adminUser)
    render(
      <MemoryRouter>
        <ConfiguracionPage />
      </MemoryRouter>
    )
    expect(screen.getByTestId('config-hub-zona-peligro')).toBeTruthy()
  })

  it('oculta zona de peligro para usuarios que no son admin', () => {
    seedSession(sellerUser)
    render(
      <MemoryRouter>
        <ConfiguracionPage />
      </MemoryRouter>
    )
    expect(screen.queryByTestId('config-hub-zona-peligro')).toBeNull()
  })

  it('exige slug y llama al API antes de cerrar sesión', async () => {
    seedSession(adminUser)
    administrationApi.resetWorkspaceData.mockResolvedValue({ workspaceId: 'w1' })
    const logout = vi.fn().mockResolvedValue(undefined)
    useSessionStore.setState({ logout })

    render(
      <MemoryRouter>
        <ConfiguracionPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByTestId('config-hub-zona-peligro'))
    fireEvent.click(await screen.findByTestId('config-data-reset-trigger'))

    const confirmButton = await screen.findByRole('button', { name: 'Reiniciar data' })
    expect(confirmButton.hasAttribute('disabled')).toBe(true)

    fireEvent.change(screen.getByTestId('config-data-reset-dialog-phrase-input'), {
      target: { value: 'acme-demo' },
    })
    fireEvent.click(confirmButton)

    await waitFor(() =>
      expect(administrationApi.resetWorkspaceData).toHaveBeenCalledWith({
        confirmationSlug: 'acme-demo',
      })
    )
    await waitFor(() => expect(logout).toHaveBeenCalled())
    expect(navigate).toHaveBeenCalledWith('/login', { replace: true })
  })
})
