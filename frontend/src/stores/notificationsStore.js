import { create } from 'zustand'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notificationsApi'

export const useNotificationsStore = create((set, get) => ({
  items: [],
  page: 1,
  pageSize: 10,
  total: 0,
  unreadCount: 0,
  loading: false,
  error: null,
  lastFetchedAt: null,

  fetch: async ({ page = 1, pageSize = 10 } = {}) => {
    set({ loading: true, error: null })
    try {
      const data = await listNotifications({ page, pageSize })
      set({
        items: data.items || [],
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
        total: data.total ?? 0,
        unreadCount: data.unreadCount ?? 0,
        loading: false,
        lastFetchedAt: Date.now(),
      })
      return data
    } catch (error) {
      set({
        loading: false,
        error: error?.message || 'No se pudieron cargar las notificaciones.',
      })
      throw error
    }
  },

  markRead: async (id) => {
    await markNotificationRead(id)
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
      unreadCount: Math.max(
        0,
        state.unreadCount - (state.items.find((item) => item.id === id && !item.read) ? 1 : 0)
      ),
    }))
  },

  markAllRead: async () => {
    const result = await markAllNotificationsRead()
    set((state) => ({
      items: state.items.map((item) => ({ ...item, read: true })),
      unreadCount: 0,
    }))
    return result?.updated ?? 0
  },

  refreshUnreadBadge: async () => {
    const { pageSize, page } = get()
    try {
      await get().fetch({ page, pageSize })
    } catch {
      // badge refresh is best-effort
    }
  },
}))