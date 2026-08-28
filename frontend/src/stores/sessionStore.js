import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CURRENT_USER } from '@/data/dashboard'
import { bindSessionHandlers } from '@/services/apiClient'
import { authApi } from '@/services/authApi'
import { checkHealthReady } from '@/services/healthApi'
import { mapSessionUser } from '@/services/adapters/iam'

export const useSessionStore = create(
  persist(
    (set, get) => ({
      status: 'unknown',
      initialized: false,
      accessToken: null,
      refreshToken: null,
      user: null,
      bootError: null,

      setTokens: ({ accessToken, refreshToken }) => set({ accessToken, refreshToken }),

      clearSession: () => set({ accessToken: null, refreshToken: null, user: null }),

      isAuthenticated: () => Boolean(get().accessToken && get().user),

      isOnline: () => get().status === 'online',

      getDisplayUser: () => {
        const { status, user } = get()
        if (status === 'online' && user) return user
        return { ...CURRENT_USER, email: '', active: true, branchIds: [] }
      },

      bootstrap: async () => {
        if (get().initialized) return
        set({ bootError: null })

        const ready = await checkHealthReady()
        if (!ready) {
          set({ status: 'offline', initialized: true, user: null })
          return
        }

        set({ status: 'online' })

        const { accessToken } = get()
        if (accessToken) {
          try {
            const me = await authApi.me()
            set({ user: mapSessionUser(me), initialized: true })
            return
          } catch {
            set({ accessToken: null, refreshToken: null, user: null })
          }
        }

        set({ initialized: true })
      },

      login: async (email, password) => {
        const tokens = await authApi.login(email, password)
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          status: 'online',
        })
        const me = await authApi.me()
        const user = mapSessionUser(me)
        set({ user })
        return user
      },

      logout: async () => {
        const { status, accessToken } = get()
        if (status === 'online' && accessToken) {
          try {
            await authApi.logout()
          } catch {
            /* ignore */
          }
        }
        set({ accessToken: null, refreshToken: null, user: null })
      },
    }),
    {
      name: 'diedo-session',
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
      }),
    }
  )
)

bindSessionHandlers({
  getAccessToken: () => useSessionStore.getState().accessToken,
  getRefreshToken: () => useSessionStore.getState().refreshToken,
  setTokens: (tokens) => useSessionStore.getState().setTokens(tokens),
  clearSession: () => useSessionStore.getState().clearSession(),
})
