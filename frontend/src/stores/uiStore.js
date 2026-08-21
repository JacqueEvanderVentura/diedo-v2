import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Global UI state: sidebar/drawer visibility. Persisted so the collapse
// preference survives reloads.
export const useUiStore = create(
  persist(
    (set) => ({
      sidebarOpen: false, // mobile drawer
      sidebarCollapsed: false, // desktop rail collapse
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      openSidebar: () => set({ sidebarOpen: true }),
      closeSidebar: () => set({ sidebarOpen: false }),
      toggleCollapse: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: 'diedo-ui',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    }
  )
)
