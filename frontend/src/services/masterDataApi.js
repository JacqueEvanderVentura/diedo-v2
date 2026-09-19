import { apiClient } from './apiClient'
import { createCrmIdempotencyKey } from './crmApi'
import { readAllPages } from './pagination'
import { createModuleGateway } from './dataGateway'
import { demoRepository, DEMO_SEED_ENABLED } from './demoRepository'
import { useSessionStore } from '@/stores/sessionStore'

export const masterDataApi = {
  customersPage: (params = {}) => apiClient.get('/api/v1/customers', params),
  customers: async (params = {}) => (await readAllPages((query) => apiClient.get('/api/v1/customers', query), { pageSize: 100, ...params })).items,
  createCustomer: (payload) => apiClient.post('/api/v1/customers', payload),
  importCustomers: (payload, key) => apiClient.post(
    '/api/v1/customers/import',
    payload,
    { headers: { 'Idempotency-Key': key || createCrmIdempotencyKey() } },
  ),
  updateCustomer: (id, payload) => apiClient.patch(`/api/v1/customers/${id}`, payload),
  deleteCustomersBatch: (payload) => apiClient.post('/api/v1/customers/batch-delete', payload),
  customerTimeline: (id) => apiClient.get(`/api/v1/customers/${id}/timeline`),
  employees: async (params = {}) => (await apiClient.get('/api/v1/employees', { pageSize: 100, ...params })).items,
  createEmployee: (payload) => apiClient.post('/api/v1/employees', payload),
  updateEmployee: (id, payload) => apiClient.patch(`/api/v1/employees/${id}`, payload),
  employeeSchedule: (id) => apiClient.get(`/api/v1/employees/${id}/schedule`),
  updateEmployeeSchedule: (id, payload) => apiClient.put(`/api/v1/employees/${id}/schedule`, payload),
  customerAttachments: (id) => apiClient.get(`/api/v1/customers/${id}/attachments`),
  employeeAttachments: (id) => apiClient.get(`/api/v1/employees/${id}/attachments`),
  uploadCustomerAttachment: (id, formData) => apiClient.upload(`/api/v1/customers/${id}/attachments`, formData),
  uploadEmployeeAttachment: (id, formData) => apiClient.upload(`/api/v1/employees/${id}/attachments`, formData),
}

export const customersGateway = createModuleGateway({
  module: 'customers',
  apiRepository: masterDataApi,
  demoRepository,
  demoEnabled: DEMO_SEED_ENABLED,
  demoActive: () => useSessionStore.getState().status === 'demo',
})

export const employeesGateway = createModuleGateway({
  module: 'employees',
  apiRepository: masterDataApi,
  demoRepository,
  demoEnabled: DEMO_SEED_ENABLED,
  demoActive: () => useSessionStore.getState().status === 'demo',
})
