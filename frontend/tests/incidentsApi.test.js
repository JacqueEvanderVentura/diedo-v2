import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  upload: vi.fn(),
  blob: vi.fn(),
}))

vi.mock('@/services/apiClient', () => ({ apiClient: mocks }))

import { incidentsApi } from '@/services/incidentsApi'

describe('cliente API de Incidencias', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue({ items: [], totalPages: 0 })
  })

  it('consulta listado completo, estadísticas y detalle', async () => {
    await incidentsApi.listAll({ status: 'abierta' })
    await incidentsApi.stats({ branchId: 'branch-id' })
    await incidentsApi.get('incident-id')

    expect(mocks.get).toHaveBeenCalledWith('/api/v1/incidents', {
      status: 'abierta',
      page: 1,
      pageSize: 100,
    })
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/incidents/stats', {
      branchId: 'branch-id',
    })
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/incidents/incident-id')
  })

  it('envía creación, estado y comentarios con idempotencia y versión', async () => {
    const payload = { title: 'Fuga de agua', branchId: 'branch-id' }
    await incidentsApi.create(payload)
    await incidentsApi.updateStatus('incident-id', { status: 'en_proceso', version: 2 })
    await incidentsApi.addComment('incident-id', { message: 'En revisión', version: 3 })

    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/incidents',
      payload,
      { headers: { 'Idempotency-Key': expect.any(String) } }
    )
    expect(mocks.patch).toHaveBeenCalledWith('/api/v1/incidents/incident-id/status', {
      status: 'en_proceso',
      version: 2,
    })
    expect(mocks.post).toHaveBeenCalledWith('/api/v1/incidents/incident-id/comments', {
      message: 'En revisión',
      version: 3,
    })
  })

  it('sube multipart y descarga el preview autenticado', async () => {
    const file = new File(['png'], 'evidencia.png', { type: 'image/png' })
    await incidentsApi.uploadAttachments('incident-id', 4, [file])
    await incidentsApi.preview('/api/v1/incidents/incident-id/attachments/image-id/content')

    expect(mocks.upload).toHaveBeenCalledWith(
      '/api/v1/incidents/incident-id/attachments',
      expect.any(FormData)
    )
    const formData = mocks.upload.mock.calls[0][1]
    expect(formData.get('version')).toBe('4')
    expect(formData.getAll('files')).toHaveLength(1)
    expect(mocks.blob).toHaveBeenCalledWith(
      '/api/v1/incidents/incident-id/attachments/image-id/content'
    )
  })
})
