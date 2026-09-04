import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { dashboardGateway } from '@/services/dashboardApi'

let latestRequest = 0

const EMPTY_SUMMARY = Object.freeze({
  revenue: 0,
  activeLeads: 0,
  appointmentsToday: 0,
  openTasks: 0,
  currencyCode: 'DOP',
})
const EMPTY_TREND = Object.freeze({ total: 0, points: [] })

export const useDashboardStore = create(
  persist(
    (set, get) => ({
      period: 'week',
      branchId: 'all',
      summary: EMPTY_SUMMARY,
      trend: EMPTY_TREND,
      stockAlerts: [],
      appointments: [],
      activity: [],
      loading: false,
      error: null,
      dataState: dashboardGateway.getState(),

      setPeriod: (period) => set({ period }),
      setBranchId: (branchId) => set({ branchId }),

      hydrate: async (filters = {}) => {
        const requestId = ++latestRequest
        const period = filters.period || get().period
        const branchId = filters.branchId || get().branchId
        set({ loading: true, error: null })
        try {
          const result = await dashboardGateway.read('dashboard', { period, branchId })
          if (requestId !== latestRequest) return result.data
          set({
            ...result.data,
            dataState: dashboardGateway.getState(),
            loading: false,
          })
          return result.data
        } catch (error) {
          if (requestId === latestRequest) {
            set({ error, dataState: dashboardGateway.getState(), loading: false })
          }
          throw error
        }
      },
    }),
    {
      name: 'diedo-dashboard',
      version: 2,
      migrate: (persisted) => ({
        period: persisted?.period ?? 'week',
        branchId: persisted?.branchId ?? 'all',
      }),
      partialize: (state) => ({ period: state.period, branchId: state.branchId }),
    }
  )
)
