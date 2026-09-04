import { apiClient } from './apiClient'
import { createModuleGateway } from './dataGateway'
import { demoRepository, DEMO_SEED_ENABLED } from './demoRepository'
import { ENDPOINTS } from './endpoints'
import { useSessionStore } from '@/stores/sessionStore'

const STATUS_FROM_API = {
  pending: 'pendiente',
  confirmed: 'confirmada',
  completed: 'completada',
  attended: 'asistio',
  no_show: 'noshow',
  cancelled: 'cancelada',
  delayed: 'retrasada',
  rescheduled: 'reprogramada',
}

const requestParams = ({ period, branchId } = {}) => ({
  period,
  branchId: branchId && branchId !== 'all' ? branchId : undefined,
})

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
    const branchParams = { branchId: params.branchId }
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
