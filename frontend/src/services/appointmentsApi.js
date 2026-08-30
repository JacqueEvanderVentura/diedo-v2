import { apiClient } from './apiClient'
import { createModuleGateway } from './dataGateway'
import { demoRepository, DEMO_SEED_ENABLED } from './demoRepository'
import { useSessionStore } from '@/stores/sessionStore'
import {
  appointmentPatchToApiPayload,
  appointmentStatusToApi,
  appointmentToApiPayload,
  mapAppointmentFromApi,
  mapAppointmentResourceFromApi,
} from './adapters/appointments'

const PAGE_SIZE = 200

const idempotencyOptions = () => ({
  headers: { 'Idempotency-Key': crypto.randomUUID() },
})

async function listAllAppointments(params = {}) {
  const requestParams = {
    ...params,
    status: params.status ? appointmentStatusToApi(params.status) : undefined,
  }
  const first = await apiClient.get('/api/v1/appointments', {
    ...requestParams,
    page: 1,
    pageSize: PAGE_SIZE,
  })
  const totalPages = Math.max(1, Number(first.totalPages) || 1)
  const remaining = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          apiClient.get('/api/v1/appointments', {
            ...requestParams,
            page: index + 2,
            pageSize: PAGE_SIZE,
          })
        )
      )
    : []
  return [first, ...remaining].flatMap((page) => page.items || []).map(mapAppointmentFromApi)
}

export const appointmentsApi = {
  appointments: listAllAppointments,
  appointmentResources: async ({ branchId }) => {
    const response = await apiClient.get('/api/v1/appointment-resources', { branchId })
    return (response.items || []).map((item) => mapAppointmentResourceFromApi(item, branchId))
  },
  createAppointment: async (payload) => {
    const response = await apiClient.post(
      '/api/v1/appointments',
      appointmentToApiPayload(payload),
      idempotencyOptions()
    )
    return (response.items || []).map(mapAppointmentFromApi)
  },
  updateAppointment: async (id, payload, version) => mapAppointmentFromApi(
    await apiClient.patch(
      `/api/v1/appointments/${id}`,
      appointmentPatchToApiPayload(payload, version)
    )
  ),
  cancelAppointment: async (id, version) => mapAppointmentFromApi(
    await apiClient.patch(`/api/v1/appointments/${id}`, { status: 'cancelled', version })
  ),
}

export const appointmentsGateway = createModuleGateway({
  module: 'appointments',
  apiRepository: appointmentsApi,
  demoRepository,
  demoEnabled: DEMO_SEED_ENABLED,
  demoActive: () => useSessionStore.getState().status === 'demo',
})
