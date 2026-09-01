import { apiClient } from './apiClient'

const PAGE_SIZE = 100

const idempotencyOptions = () => ({
  headers: { 'Idempotency-Key': crypto.randomUUID() },
})

async function listAll(params = {}) {
  const first = await apiClient.get('/api/v1/incidents', {
    ...params,
    page: 1,
    pageSize: PAGE_SIZE,
  })
  const totalPages = Math.max(1, Number(first.totalPages) || 1)
  const remaining = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          apiClient.get('/api/v1/incidents', {
            ...params,
            page: index + 2,
            pageSize: PAGE_SIZE,
          })
        )
      )
    : []

  return {
    ...first,
    items: [first, ...remaining].flatMap((page) => page.items || []),
  }
}

function uploadAttachments(id, version, files) {
  const formData = new FormData()
  formData.append('version', String(version))
  files.forEach((file) => formData.append('files', file, file.name))
  return apiClient.upload(`/api/v1/incidents/${id}/attachments`, formData)
}

export const incidentsApi = {
  list: (params) => apiClient.get('/api/v1/incidents', params),
  listAll,
  stats: (params) => apiClient.get('/api/v1/incidents/stats', params),
  get: (id) => apiClient.get(`/api/v1/incidents/${id}`),
  create: (payload) => apiClient.post('/api/v1/incidents', payload, idempotencyOptions()),
  updateStatus: (id, payload) => apiClient.patch(`/api/v1/incidents/${id}/status`, payload),
  addComment: (id, payload) => apiClient.post(`/api/v1/incidents/${id}/comments`, payload),
  uploadAttachments,
  preview: (previewUrl) => apiClient.blob(previewUrl),
}
