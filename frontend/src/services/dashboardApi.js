import { branchQueryParams } from '@/lib/branches'
import { apiClient } from './apiClient'
import { createModuleGateway } from './dataGateway'
import { demoRepository, DEMO_SEED_ENABLED } from './demoRepository'
import { ENDPOINTS } from './endpoints'
import { useSessionStore } from '@/stores/sessionStore'

const STATUS_FROM_API = {
  confirmed: 'confirmada',
  fulfilled: 'cumplida',
  no_show: 'noshow',
  cancelled: 'cancelada',
  completed: 'cumplida',
  attended: 'cumplida',
  pending: 'confirmada',
  delayed: 'confirmada',
  rescheduled: 'confirmada',
}

const requestParams = ({ period, branchId, branchIds, dateFrom, dateTo } = {}) => {
  const useCustomRange = period === 'custom' && dateFrom
  return {
    period: useCustomRange ? undefined : period,
    dateFrom: useCustomRange ? dateFrom : undefined,
    dateTo: useCustomRange ? (dateTo || dateFrom) : undefined,
    ...branchQueryParams(branchId, branchIds),
  }
}

export function mapDashboardResponse({ summary, trend, stockAlerts, appointments, activity }) {
  return {
    summary: {
      ...summary,
      revenue: Number(summary?.revenue) || 0,
      activeLeads: Number(summary?.activeLeads) || 0,
      appointmentsToday: Number(summary?.appointmentsToday) || 0,
      openTasks: Number(summary?.openTasks) || 0,
    },
    trend: {
      ...trend,
      total: Number(trend?.total) || 0,
      points: (trend?.points || []).map((point) => ({
        ...point,
        value: Number(point.value) || 0,
      })),
    },
    stockAlerts: (stockAlerts?.items || []).map((item) => ({
      ...item,
      sku: item.sku || 'N/A',
      units: Number(item.units) || 0,
      minimumUnits: Number(item.minimumUnits) || 0,
    })),
    appointments: (appointments?.items || []).map((item) => ({
      ...item,
      status: STATUS_FROM_API[item.status] || item.status,
    })),
    activity: (activity?.items || []).map((item) => ({
      ...item,
      occurredAt: item.occurredAt || null,
    })),
  }
}

export const dashboardApi = {
  dashboard: async (filters = {}) => {
    const params = requestParams(filters)
    const branchParams = {
      ...(params.branchId ? { branchId: params.branchId } : {}),
      ...(params.branchIds?.length ? { branchIds: params.branchIds } : {}),
    }
    const [summary, trend, stockAlerts, appointments, activity] = await Promise.all([
      apiClient.get(ENDPOINTS.dashboard.summary, params),
      apiClient.get(ENDPOINTS.dashboard.salesTrend, params),
      apiClient.get(ENDPOINTS.dashboard.stockAlerts, branchParams),
      apiClient.get(ENDPOINTS.dashboard.appointments, branchParams),
      apiClient.get(ENDPOINTS.dashboard.activity, { ...params, limit: 10 }),
    ])
    return mapDashboardResponse({ summary, trend, stockAlerts, appointments, activity })
  },
}

export const dashboardGateway = createModuleGateway({
  module: 'dashboard',
  apiRepository: dashboardApi,
  demoRepository: {
    dashboard: (filters) => demoRepository.dashboard(filters),
  },
  demoEnabled: DEMO_SEED_ENABLED,
  demoActive: () => useSessionStore.getState().status === 'demo',
})
