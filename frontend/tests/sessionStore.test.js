import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadSessionStore({ ready, demoEnabled, refreshed = false, me = null }) {
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
  vi.doMock('@/services/demoRepository', () => ({
    DEMO_SEED_ENABLED: demoEnabled,
    demoRepository: {
      session: () => ({ id: 'demo-user', name: 'Alex Demo', source: 'demo' }),
    },
  }))
  vi.doMock('@/services/dataGateway', () => ({ clearModuleGatewayCaches }))
  vi.doMock('@/services/configFacade', () => ({
    configFacade: { clearApiBranches },
  }))
  vi.doMock('@/services/storagePolicy', () => ({
    clearSensitiveLocalState,
    invalidateLegacySensitiveStorage: vi.fn(),
  }))
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
  it('queda online sin inventar identidad cuando refresh responde 401', async () => {
    const { store } = await loadSessionStore({
      ready: { status: 'ready', schemaRevision: '20260829_0006' },
      demoEnabled: false,
      refreshed: false,
    })
    await store.getState().bootstrap()
    expect(store.getState()).toMatchObject({ status: 'online', initialized: true, user: null })
  })

  it('muestra estado degradado recuperable cuando la API cae y demo está apagado', async () => {
    const { store } = await loadSessionStore({ ready: null, demoEnabled: false })
    await store.getState().bootstrap()
    expect(store.getState()).toMatchObject({ status: 'degraded', initialized: true, user: null })
    expect(store.getState().bootError).toContain('API no está disponible')
  })

  it('entra en demo solamente con el flag explícito', async () => {
    const { store } = await loadSessionStore({ ready: null, demoEnabled: true })
    await store.getState().bootstrap()
    expect(store.getState()).toMatchObject({
      status: 'demo',
      initialized: true,
      user: { id: 'demo-user', source: 'demo' },
    })
  })

  it('limpia caches, maestros y sucursales al perder la sesión', async () => {
    const loaded = await loadSessionStore({ ready: null, demoEnabled: false })

    loaded.store.getState().clearSession()

    expect(loaded.clearModuleGatewayCaches).toHaveBeenCalledOnce()
    expect(loaded.clearSensitiveLocalState).toHaveBeenCalledOnce()
    expect(loaded.clearApiBranches).toHaveBeenCalledOnce()
  })

  it('limpia el tenant anterior antes de instalar el workspace nuevo', async () => {
    const loaded = await loadSessionStore({
      ready: { status: 'ready', schemaRevision: '20260829_0007' },
      demoEnabled: false,
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
