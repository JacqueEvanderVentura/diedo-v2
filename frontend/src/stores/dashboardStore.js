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
      dateFrom: null,
      dateTo: null,
      branchId: 'all',
      branchIds: [],
      summary: EMPTY_SUMMARY,
      trend: EMPTY_TREND,
      stockAlerts: [],
      appointments: [],
      activity: [],
      loading: false,
      error: null,
      dataState: dashboardGateway.getState(),

      setPeriod: (period) => set({ period, dateFrom: null, dateTo: null }),
      setPeriodFilter: ({ period, dateFrom = null, dateTo = null }) =>
        set({ period, dateFrom, dateTo }),
      setBranchId: (branchId) =>
        set({
          branchId,
          branchIds: branchId && branchId !== 'all' ? [branchId] : [],
        }),
      setBranchIds: (branchIds) =>
        set({
          branchIds: branchIds || [],
          branchId: branchIds?.length === 1 ? branchIds[0] : 'all',
        }),

      hydrate: async (filters = {}) => {
        const requestId = ++latestRequest
        const period = filters.period ?? get().period
        const dateFrom = filters.dateFrom ?? get().dateFrom
        const dateTo = filters.dateTo ?? get().dateTo
        const branchId = filters.branchId ?? get().branchId
        const branchIds = filters.branchIds ?? get().branchIds
        set({ loading: true, error: null })
        try {
          const result = await dashboardGateway.read('dashboard', {
            period,
            dateFrom,
            dateTo,
            branchId,
            branchIds,
          })
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
      version: 3,
      migrate: (persisted) => ({
        period: persisted?.period ?? 'week',
        dateFrom: persisted?.dateFrom ?? null,
        dateTo: persisted?.dateTo ?? null,
        branchId: persisted?.branchId ?? 'all',
        branchIds: persisted?.branchIds ?? (
          persisted?.branchId && persisted.branchId !== 'all' ? [persisted.branchId] : []
        ),
      }),
      partialize: (state) => ({
        period: state.period,
        dateFrom: state.dateFrom,
        dateTo: state.dateTo,
        branchId: state.branchId,
        branchIds: state.branchIds,
      }),
    }
  )
)
