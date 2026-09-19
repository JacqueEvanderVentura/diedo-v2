import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { intersectBranchIds } from '@/lib/branches'
import { dashboardGateway } from '@/services/dashboardApi'
import { registerSensitiveStateCleaner } from '@/services/storagePolicy'

let latestRequest = 0

const EMPTY_SUMMARY = Object.freeze({
  revenue: 0,
  activeLeads: 0,
  appointmentsToday: 0,
  openTasks: 0,
  currencyCode: 'DOP',
})
const EMPTY_TREND = Object.freeze({ total: 0, points: [] })

function dashboardPersistScope(workspaceId, userId) {
  if (!workspaceId || !userId) return null
  return `${workspaceId}:${userId}`
}

const defaultBranchFilters = () => ({
  branchId: 'all',
  branchIds: [],
})

export const useDashboardStore = create(
  persist(
    (set, get) => ({
      period: 'week',
      dateFrom: null,
      dateTo: null,
      branchId: 'all',
      branchIds: [],
      persistScope: null,
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

      ensureSessionScope: (workspaceId, userId) => {
        const nextScope = dashboardPersistScope(workspaceId, userId)
        if (!nextScope) return
        const { persistScope } = get()
        if (persistScope === nextScope) return
        const isLegacyUnscoped = persistScope == null
        if (isLegacyUnscoped) {
          set({ persistScope: nextScope })
          return
        }
        set({
          persistScope: nextScope,
          ...defaultBranchFilters(),
          error: null,
        })
      },

      reconcileBranchIds: (allowedBranchIds) => {
        const current = get().branchIds || []
        const next = intersectBranchIds(current, allowedBranchIds)
        if (next.length === current.length && next.every((id, i) => id === current[i])) return false
        set({
          branchIds: next,
          branchId: next.length === 1 ? next[0] : 'all',
          error: null,
        })
        return true
      },

      clearSensitive: () => {
        set({
          ...defaultBranchFilters(),
          persistScope: null,
          summary: EMPTY_SUMMARY,
          trend: EMPTY_TREND,
          stockAlerts: [],
          appointments: [],
          activity: [],
          loading: false,
          error: null,
        })
      },

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
      version: 4,
      migrate: (persisted) => ({
        period: persisted?.period ?? 'week',
        dateFrom: persisted?.dateFrom ?? null,
        dateTo: persisted?.dateTo ?? null,
        branchId: persisted?.branchId ?? 'all',
        branchIds: persisted?.branchIds ?? (
          persisted?.branchId && persisted.branchId !== 'all' ? [persisted.branchId] : []
        ),
        persistScope: persisted?.persistScope ?? null,
      }),
      partialize: (state) => ({
        period: state.period,
        dateFrom: state.dateFrom,
        dateTo: state.dateTo,
        branchId: state.branchId,
        branchIds: state.branchIds,
        persistScope: state.persistScope,
      }),
    }
  )
)

registerSensitiveStateCleaner(() => useDashboardStore.getState().clearSensitive())
