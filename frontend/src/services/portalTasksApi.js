import { apiClient } from '@/services/apiClient'

export const portalTasksApi = {
  listTemplates: () => apiClient.get('/api/v1/portal-tasks/templates'),
  createTemplate: (formData) => apiClient.upload('/api/v1/portal-tasks/templates', formData),
  updateTemplate: (templateId, formDataOrJson) => {
    if (formDataOrJson instanceof FormData) {
      return apiClient.patch(`/api/v1/portal-tasks/templates/${templateId}`, formDataOrJson)
    }
    return apiClient.patch(`/api/v1/portal-tasks/templates/${templateId}`, formDataOrJson)
  },
  templatePdfBlob: (templateId) => apiClient.blob(
    `/api/v1/portal-tasks/templates/${templateId}/content`,
  ),
  customerTasks: (customerId) => apiClient.get(`/api/v1/customers/${customerId}/portal-tasks`),
}