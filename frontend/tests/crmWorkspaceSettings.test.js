import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  workspaceSettings: vi.fn(),
  updateWorkspaceSettings: vi.fn(),
}))

vi.mock('@/services/crmApi', () => ({
  crmApi: {
    workspaceSettings: mocks.workspaceSettings,
    updateWorkspaceSettings: mocks.updateWorkspaceSettings,
  },
}))

import { useCrmStore } from '@/stores/crmStore'
import { useSessionStore } from '@/stores/sessionStore'

function versionConflictError() {
  return Object.assign(new Error('El registro cambió desde la última lectura.'), {
    status: 409,
    parameter: 'version',
  })
}

describe('crm workspace settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionStore.setState({ status: 'online', user: {} })
    useCrmStore.getState().clearSensitive()
  })

  it('reintenta updateUiMode tras un 409 de versión', async () => {
    useCrmStore.setState({
      uiMode: 'standard',
      uiModeVersion: 1,
      workspaceSettingsSynced: true,
      workspaceSettingsLoaded: true,
    })
    mocks.updateWorkspaceSettings
      .mockRejectedValueOnce(versionConflictError())
      .mockResolvedValueOnce({ uiMode: 'simplified', version: 3 })
    mocks.workspaceSettings.mockResolvedValue({ uiMode: 'standard', version: 2 })

    await useCrmStore.getState().updateUiMode('simplified')

    expect(mocks.workspaceSettings).toHaveBeenCalled()
    expect(mocks.updateWorkspaceSettings).toHaveBeenCalledTimes(2)
    expect(mocks.updateWorkspaceSettings).toHaveBeenLastCalledWith({
      version: 2,
      uiMode: 'simplified',
    })
    expect(useCrmStore.getState().uiMode).toBe('simplified')
    expect(useCrmStore.getState().uiModeVersion).toBe(3)
  })

  it('no repite PATCH si el refetch ya trae el modo pedido', async () => {
    useCrmStore.setState({
      uiMode: 'standard',
      uiModeVersion: 1,
      workspaceSettingsSynced: true,
      workspaceSettingsLoaded: true,
    })
    mocks.updateWorkspaceSettings.mockRejectedValueOnce(versionConflictError())
    mocks.workspaceSettings.mockResolvedValue({ uiMode: 'simplified', version: 2 })

    await useCrmStore.getState().updateUiMode('simplified')

    expect(mocks.updateWorkspaceSettings).toHaveBeenCalledTimes(1)
    expect(useCrmStore.getState().uiMode).toBe('simplified')
    expect(useCrmStore.getState().uiModeVersion).toBe(2)
  })

  it('clearSensitive deja workspace settings sin sincronizar', () => {
    useCrmStore.setState({
      uiMode: 'simplified',
      uiModeVersion: 4,
      workspaceSettingsSynced: true,
      workspaceSettingsLoaded: true,
    })
    useCrmStore.getState().clearSensitive()
    expect(useCrmStore.getState().uiMode).toBe('standard')
    expect(useCrmStore.getState().uiModeVersion).toBe(1)
    expect(useCrmStore.getState().workspaceSettingsSynced).toBe(false)
    expect(useCrmStore.getState().workspaceSettingsLoaded).toBe(false)
  })

  it('ignora una hidratación de workspace con versión más antigua', async () => {
    useCrmStore.setState({
      uiMode: 'simplified',
      uiModeVersion: 5,
      workspaceSettingsSynced: true,
      workspaceSettingsLoaded: true,
    })
    mocks.workspaceSettings.mockResolvedValue({ uiMode: 'standard', version: 3 })

    await useCrmStore.getState().hydrateSection('workspace')

    expect(useCrmStore.getState().uiModeVersion).toBe(5)
    expect(useCrmStore.getState().uiMode).toBe('simplified')
  })
})
