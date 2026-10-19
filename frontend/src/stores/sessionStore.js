import { create } from 'zustand'
import { bindSessionHandlers } from '@/services/apiClient'
import { authApi } from '@/services/authApi'
import { clearModuleGatewayCaches } from '@/services/dataGateway'
import { configFacade } from '@/services/configFacade'
import { checkHealthReady } from '@/services/healthApi'
import { isModuleAvailable } from '@/services/moduleAvailability'
import { mapSessionUser } from '@/services/adapters/iam'
import { clearSensitiveLocalState, invalidateLegacySensitiveStorage } from '@/services/storagePolicy'
import { hasWorkspacePermission } from '@/lib/sessionCapabilities'

export function clearTenantState() {
  clearModuleGatewayCaches()
  clearSensitiveLocalState()
  configFacade.clearApiBranches()
}

function applySessionUser(user) {
  return {
    user,
    elevation: user?.elevation || null,
  }
}

export const useSessionStore = create((set, get) => ({
  status: 'unknown',
  initialized: false,
  bootstrapping: false,
  accessToken: null,
  user: null,
  elevation: null,
  bootError: null,
  schemaRevision: null,

  setTokens: ({ accessToken }) => set({ accessToken: accessToken || null }),

  clearSession: () => {
    clearTenantState()
    set({ accessToken: null, user: null, elevation: null })
  },

  isAuthenticated: () => Boolean(get().accessToken && get().user),

  isOnline: () => get().status === 'online',

  isDemo: () => false,

  getDisplayUser: () => get().user,

  hasPermission: (code) => Boolean(get().user?.effectivePermissionCodes?.includes(code)),

  hasWorkspacePermission: (code) => {
    const { user } = get()
    return hasWorkspacePermission(user, code)
  },

  hasModule: (code) => {
    const { user } = get()
    return Boolean(user && isModuleAvailable(code, user.enabledModules))
  },

  bootstrap: async ({ force = false } = {}) => {
    if (get().bootstrapping || (get().initialized && !force)) return
    invalidateLegacySensitiveStorage()
    set({ bootstrapping: true, bootError: null, initialized: false })

    const ready = await checkHealthReady()
    if (!ready) {
      clearTenantState()
      set({
        status: 'degraded',
        initialized: true,
        bootstrapping: false,
        accessToken: null,
        user: null,
        elevation: null,
        bootError: 'La API no está disponible. Los cambios están bloqueados.',
      })
      return
    }

    set({ status: 'online', schemaRevision: ready.schemaRevision })
    try {
      const refreshed = await authApi.refresh()
      if (refreshed) {
        const me = await authApi.me()
        set(applySessionUser(mapSessionUser(me)))
      }
    } catch {
      clearTenantState()
      set({ accessToken: null, user: null, elevation: null })
    }
    set({ initialized: true, bootstrapping: false })
  },

  login: async (email, password) => {
    clearTenantState()
    const tokens = await authApi.login(email, password)
    set({ accessToken: tokens.accessToken, status: 'online' })
    const me = await authApi.me()
    const user = mapSessionUser(me)
    set({ ...applySessionUser(user), initialized: true })
    return user
  },

  switchWorkspace: async (workspaceId) => {
    const tokens = await authApi.switchWorkspace(workspaceId)
    clearTenantState()
    set({ accessToken: tokens.accessToken, user: null, elevation: null })
    const me = await authApi.me()
    const user = mapSessionUser(me)
    set(applySessionUser(user))
    return user
  },

  refreshCurrentUser: async () => {
    const token = get().accessToken
    const me = await authApi.me()
    if (get().accessToken !== token) return get().user
    const user = mapSessionUser(me)
    if (JSON.stringify(user) === JSON.stringify(get().user)) return get().user
    set(applySessionUser(user))
    return user
  },

  elevateSession: async ({ email, password, permissionCode }) => {
    const me = await authApi.elevate({ email, password, permissionCode })
    const user = mapSessionUser(me)
    set(applySessionUser(user))
    return user.elevation
  },

  revokeElevation: async () => {
    const me = await authApi.revokeElevation()
    const user = mapSessionUser(me)
    set(applySessionUser(user))
    return user
  },

  logout: async () => {
    const { status, accessToken } = get()
    if (status === 'online' && accessToken) {
      try {
        await authApi.logout()
      } catch {
        // Local cleanup remains mandatory even if the API is already unavailable.
      }
    }
    clearTenantState()
    set({
      accessToken: null,
      user: null,
      elevation: null,
    })
  },
}))

bindSessionHandlers({
  getAccessToken: () => useSessionStore.getState().accessToken,
  setTokens: (tokens) => useSessionStore.getState().setTokens(tokens),
  clearSession: () => useSessionStore.getState().clearSession(),
  refreshContext: async () => {
    const state = useSessionStore.getState()
    if (!state.user?.isPlatformOperator) await state.refreshCurrentUser()
  },
})
