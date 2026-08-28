import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const genId = () => `ntf-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const now = () => new Date().toISOString()

const SEED_NOTIFICATIONS = [
  {
    id: 'ntf-seed-1',
    userId: 'u1',
    type: 'mention',
    title: 'María Recepción te mencionó',
    body: 'INC-1193: Revisa el estado de la máquina de vapor.',
    read: false,
    createdAt: now(),
    link: { path: '/incidencias', incidenciaId: 'inc-seed-1' },
  },
]

export const useNotificationsStore = create(
  persist(
    (set, get) => ({
      notifications: SEED_NOTIFICATIONS,

      addMentionNotifications: ({ authorId, authorName, userIds, incidenciaId, incidenciaCode, messagePreview }) => {
        const unique = [...new Set(userIds)].filter((id) => id && id !== authorId)
        if (!unique.length) return

        const items = unique.map((userId) => ({
          id: genId(),
          userId,
          type: 'mention',
          title: `${authorName} te mencionó`,
          body: `${incidenciaCode}: ${messagePreview}`,
          read: false,
          createdAt: now(),
          link: { path: '/incidencias', incidenciaId },
        }))

        set((s) => ({ notifications: [...items, ...s.notifications] }))
      },

      markRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),

      markAllRead: (userId) =>
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.userId === userId ? { ...n, read: true } : n
          ),
        })),

      getForUser: (userId) =>
        get()
          .notifications.filter((n) => n.userId === userId)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),

      getUnreadCount: (userId) =>
        get().notifications.filter((n) => n.userId === userId && !n.read).length,
    }),
    {
      name: 'diedo-notifications',
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted || {}) }
        if (!Array.isArray(state.notifications) || state.notifications.length === 0) {
          state.notifications = SEED_NOTIFICATIONS
        }
        return state
      },
    }
  )
)
