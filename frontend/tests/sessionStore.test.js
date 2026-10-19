import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadSessionStore({ ready, refreshed = false, me = null }) {
  vi.resetModules()
  const clearModuleGatewayCaches = vi.fn()
  const clearSensitiveLocalState = vi.fn()
  const clearApiBranches = vi.fn()
  vi.doMock('@/services/healthApi', () => ({ checkHealthReady: vi.fn().mockResolvedValue(ready) }))
  vi.doMock('@/services/authApi', () => ({
    authApi: {
      refresh: vi.fn().mockResolvedValue(refreshed),
      me: vi.fn().mockResolvedValue(me),
      switchWorkspace: vi.fn().mockResolvedValue({ accessToken: 'workspace-access' }),
    },
  }))
  vi.doMock('@/services/dataGateway', () => ({ clearModuleGatewayCaches }))
  vi.doMock('@/services/configFacade', () => ({
    configFacade: { clearApiBranches },
  }))
  vi.doMock('@/services/storagePolicy', async (importOriginal) => {
    const actual = await importOriginal()
    return {
      ...actual,
      clearSensitiveLocalState,
      invalidateLegacySensitiveStorage: vi.fn(),
    }
  })
  const { useSessionStore } = await import('@/stores/sessionStore')
  return {
    store: useSessionStore,
    clearModuleGatewayCaches,
    clearSensitiveLocalState,
    clearApiBranches,
  }
}

afterEach(() => vi.clearAllMocks())

describe('session bootstrap', () => {
  it('conserva la identidad del contexto si no cambió para evitar recargas repetidas', async () => {
    const loaded = await loadSessionStore({ ready: null, me: {
      userId: 'user-a', workspaceId: 'workspace-a', membershipId: 'member-a', displayName: 'Usuario', visibleBranches: [], enabledModules: ['foundation'],
    } })
    loaded.store.setState({ accessToken: 'access' })
    await loaded.store.getState().refreshCurrentUser()
    const user = loaded.store.getState().user
    await loaded.store.getState().refreshCurrentUser()
    expect(loaded.store.getState().user).toBe(user)
  })
  it('queda online sin inventar identidad cuando refresh responde 401', async () => {
    const { store } = await loadSessionStore({
      ready: { status: 'ready', schemaRevision: '20260829_0006' },
      refreshed: false,
    })
    await store.getState().bootstrap()
    expect(store.getState()).toMatchObject({ status: 'online', initialized: true, user: null })
  })

  it('muestra estado degradado recuperable cuando la API cae', async () => {
    const { store } = await loadSessionStore({ ready: null })
    await store.getState().bootstrap()
    expect(store.getState()).toMatchObject({ status: 'degraded', initialized: true, user: null })
    expect(store.getState().bootError).toContain('API no está disponible')
  })

  it('limpia caches, maestros y sucursales al perder la sesión', async () => {
    const loaded = await loadSessionStore({ ready: null })

    loaded.store.getState().clearSession()

    expect(loaded.clearModuleGatewayCaches).toHaveBeenCalledOnce()
    expect(loaded.clearSensitiveLocalState).toHaveBeenCalledOnce()
    expect(loaded.clearApiBranches).toHaveBeenCalledOnce()
  })

  it('limpia el tenant anterior antes de instalar el workspace nuevo', async () => {
    const loaded = await loadSessionStore({
      ready: { status: 'ready', schemaRevision: '20260829_0007' },
      me: {
        userId: 'user-b',
        membershipId: 'membership-b',
        workspaceId: 'workspace-b',
        displayName: 'Usuario B',
        email: 'b@example.com',
        visibleBranches: [],
      },
    })

    await loaded.store.getState().switchWorkspace('workspace-b')

    expect(loaded.clearSensitiveLocalState).toHaveBeenCalledOnce()
    expect(loaded.store.getState().user.workspaceId).toBe('workspace-b')
  })
})
