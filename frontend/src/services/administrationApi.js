import { apiClient } from './apiClient'
import { createModuleGateway } from './dataGateway'
import { demoRepository, DEMO_SEED_ENABLED } from './demoRepository'
import { useSessionStore } from '@/stores/sessionStore'

export const administrationApi = {
  workspaceSettings: () => apiClient.get('/api/v1/workspace/settings'),
  updateWorkspaceSettings: (payload) => apiClient.patch('/api/v1/workspace/settings', payload),
  legalEntity: (id) => apiClient.get(`/api/v1/legal-entities/${id}`),
  legalEntities: () => apiClient.get('/api/v1/legal-entities'),
  updateLegalEntity: (id, payload) => apiClient.patch(`/api/v1/legal-entities/${id}`, payload),
  updateFiscalProfile: (id, payload) => apiClient.put(`/api/v1/legal-entities/${id}/fiscal-profile`, payload),
  branches: () => apiClient.get('/api/v1/branches'),
  createBranch: (payload) => apiClient.post('/api/v1/branches', payload),
  updateBranch: (id, payload) => apiClient.patch(`/api/v1/branches/${id}`, payload),
  assignBranchLegalEntity: (id, payload) =>
    apiClient.put(`/api/v1/branches/${id}/legal-entity-assignment`, payload),
  archiveBranch: (id, version) => apiClient.delete(`/api/v1/branches/${id}`, { version }),
  paymentMethods: () => apiClient.get('/api/v1/payment-methods'),
  createPaymentMethod: (payload) => apiClient.post('/api/v1/payment-methods', payload),
  updatePaymentMethod: (id, payload) => apiClient.patch(`/api/v1/payment-methods/${id}`, payload),
  archivePaymentMethod: (id, version) => apiClient.delete(`/api/v1/payment-methods/${id}`, { version }),
}

export const administrationGateway = createModuleGateway({
  module: 'administration',
  apiRepository: administrationApi,
  demoRepository,
  demoEnabled: DEMO_SEED_ENABLED,
  demoActive: () => useSessionStore.getState().status === 'demo',
})
