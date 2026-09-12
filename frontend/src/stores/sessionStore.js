import { create } from 'zustand'
import { bindSessionHandlers } from '@/services/apiClient'
import { authApi } from '@/services/authApi'
import { demoRepository, DEMO_SEED_ENABLED } from '@/services/demoRepository'
import { DEMO_SNAPSHOT } from '@/data/generated/demoSnapshot'
import { clearModuleGatewayCaches } from '@/services/dataGateway'
import { configFacade } from '@/services/configFacade'
import { checkHealthReady } from '@/services/healthApi'
import { isModuleAvailable } from '@/services/moduleAvailability'
import { mapSessionUser } from '@/services/adapters/iam'
import { clearSensitiveLocalState, invalidateLegacySensitiveStorage } from '@/services/storagePolicy'
import { hasWorkspacePermission } from '@/lib/sessionCapabilities'
import {
  buildDemoElevation,
  DEMO_ELEVATION_PASSWORD,
  isDemoGatedPermission,
  resolveDemoApproverPermissions,
} from '@/lib/permissionElevation'

const DEMO_USER = demoRepository.session()

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

  isDemo: () => get().status === 'demo',

  getDisplayUser: () => get().user,

  hasPermission: (code) => {
    const { status, user, elevation } = get()
    if (status === 'demo') {
      if (!isDemoGatedPermission(code) && user?.effectivePermissionCodes?.includes('*')) return true
      const codes = new Set(elevation?.effectivePermissionCodes || [])
      return codes.has(code)
    }
    return Boolean(user?.effectivePermissionCodes?.includes(code))
  },

  hasWorkspacePermission: (code) => {
    const { status, user } = get()
    if (status === 'demo') return true
    return hasWorkspacePermission(user, code)
  },

  hasModule: (code) => {
    const { status, user } = get()
    if (status === 'demo') return true
    return Boolean(user && isModuleAvailable(code, user.enabledModules))
  },

  bootstrap: async ({ force = false } = {}) => {
    if (get().bootstrapping || (get().initialized && !force)) return
    invalidateLegacySensitiveStorage()
    set({ bootstrapping: true, bootError: null, initialized: false })

    const ready = await checkHealthReady()
    if (!ready) {
      clearTenantState()
      if (DEMO_SEED_ENABLED) {
        set({
          status: 'demo',
          initialized: true,
          bootstrapping: false,
          accessToken: null,
          user: DEMO_USER,
          elevation: null,
        })
      } else {
        set({
          status: 'degraded',
          initialized: true,
          bootstrapping: false,
          accessToken: null,
          user: null,
          elevation: null,
          bootError: 'La API no está disponible. Los cambios están bloqueados.',
        })
      }
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
    const me = await authApi.me()
    const user = mapSessionUser(me)
    set(applySessionUser(user))
    return user
  },

  elevateSession: async ({ email, password, permissionCode }) => {
    const { status } = get()
    if (status === 'demo') {
      if (password !== DEMO_ELEVATION_PASSWORD) {
        throw new Error('Credenciales del supervisor incorrectas.')
      }
      const approverPermissions = resolveDemoApproverPermissions(email, DEMO_SNAPSHOT)
      if (!approverPermissions?.length) {
        throw new Error('Credenciales del supervisor incorrectas.')
      }
      if (permissionCode && !approverPermissions.includes(permissionCode)) {
        throw new Error('El supervisor no tiene permiso para autorizar esta acción.')
      }
      const approver = DEMO_SNAPSHOT.iam?.users?.find(
        (item) => item.email?.toLowerCase() === email.trim().toLowerCase()
      )
      const elevation = buildDemoElevation({
        approverName: approver?.displayName || email,
        approverPermissions,
      })
      set({ elevation })
      return elevation
    }

    const me = await authApi.elevate({ email, password, permissionCode })
    const user = mapSessionUser(me)
    set(applySessionUser(user))
    return user.elevation
  },

  revokeElevation: async () => {
    const { status } = get()
    if (status === 'demo') {
      set({ elevation: null })
      return null
    }
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
    if (status !== 'demo') clearTenantState()
    set({
      accessToken: null,
      user: status === 'demo' ? DEMO_USER : null,
      elevation: null,
    })
  },
}))

bindSessionHandlers({
  getAccessToken: () => useSessionStore.getState().accessToken,
  setTokens: (tokens) => useSessionStore.getState().setTokens(tokens),
  clearSession: () => useSessionStore.getState().clearSession(),
})
