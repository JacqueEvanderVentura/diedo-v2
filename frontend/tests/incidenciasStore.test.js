import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listAll: vi.fn(),
  stats: vi.fn(),
  preview: vi.fn(),
  create: vi.fn(),
  updateStatus: vi.fn(),
  addComment: vi.fn(),
  uploadAttachments: vi.fn(),
}))

vi.mock('@/services/incidentsApi', () => ({ incidentsApi: mocks }))

import { useIncidenciasStore } from '@/stores/incidenciasStore'

function apiIncident(overrides = {}) {
  return {
    id: 'incident-id',
    code: 'INC-1193',
    title: 'Fuga de agua',
    description: 'Humedad visible',
    type: 'infraestructura',
    priority: 'alta',
    status: 'abierta',
    branchId: 'branch-id',
    activoId: null,
    reporter: { id: 'membership-id', name: 'Alex Demo' },
    intervenientes: [{ id: 'membership-id', name: 'Alex Demo' }],
    attachments: [],
    images: [],
    activity: [{
      id: 'activity-id',
      type: 'created',
      authorId: 'membership-id',
      author: 'Alex Demo',
      message: 'Incidencia reportada y abierta.',
      createdAt: '2026-08-31T10:00:00Z',
    }],
    version: 1,
    createdAt: '2026-08-31T10:00:00Z',
    updatedAt: '2026-08-31T10:00:00Z',
    ...overrides,
  }
}

describe('store de Incidencias conectado a la API', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:authenticated-preview'),
      revokeObjectURL: vi.fn(),
    })
    useIncidenciasStore.setState({
      incidencias: [],
      selectedId: null,
      stats: null,
      apiContext: { hydrated: false },
      hydrating: false,
      error: null,
    })
  })

  it('hidrata incidencias, estadísticas y previews protegidos', async () => {
    mocks.listAll.mockResolvedValue({
      items: [apiIncident({
        attachments: [{
          id: 'attachment-id',
          originalFilename: 'evidencia.png',
          contentType: 'image/png',
          sizeBytes: 128,
          checksumSha256: 'a'.repeat(64),
          previewUrl: '/api/v1/incidents/incident-id/attachments/attachment-id/content',
          createdAt: '2026-08-31T10:05:00Z',
        }],
      })],
    })
    mocks.stats.mockResolvedValue({ total: 1, abiertas: 1, enProceso: 0, criticas: 0 })
    mocks.preview.mockResolvedValue(new Blob(['image'], { type: 'image/png' }))

    await useIncidenciasStore.getState().hydrateFromApi()

    expect(mocks.listAll).toHaveBeenCalledWith({
      sortBy: 'createdAt',
      sortDirection: 'desc',
    })
    expect(mocks.preview).toHaveBeenCalledOnce()
    expect(useIncidenciasStore.getState()).toMatchObject({
      incidencias: [expect.objectContaining({
        id: 'incident-id',
        images: ['blob:authenticated-preview'],
        version: 1,
        apiSynced: true,
      })],
      stats: { total: 1, abiertas: 1, enProceso: 0, criticas: 0 },
      apiContext: { hydrated: true },
    })
  })

  it('crea la incidencia y adjunta los File usando la versión devuelta', async () => {
    useIncidenciasStore.setState({ apiContext: { hydrated: true }, incidencias: [] })
    mocks.create.mockResolvedValue(apiIncident())
    mocks.uploadAttachments.mockResolvedValue(apiIncident({
      version: 2,
      attachments: [{
        id: 'attachment-id',
        originalFilename: 'evidencia.png',
        contentType: 'image/png',
        sizeBytes: 128,
        checksumSha256: 'a'.repeat(64),
        previewUrl: '/api/v1/incidents/incident-id/attachments/attachment-id/content',
        createdAt: '2026-08-31T10:05:00Z',
      }],
    }))
    mocks.preview.mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    const file = new File(['image'], 'evidencia.png', { type: 'image/png' })

    await useIncidenciasStore.getState().addIncidencia({
      title: 'Fuga de agua',
      description: 'Humedad visible',
      type: 'infraestructura',
      priority: 'alta',
      branchId: 'branch-id',
      activoId: null,
      intervenientes: [{ id: 'membership-id', name: 'Alex Demo' }],
      imageFiles: [file],
    }, { isOnline: true })

    expect(mocks.create).toHaveBeenCalledWith({
      title: 'Fuga de agua',
      description: 'Humedad visible',
      type: 'infraestructura',
      priority: 'alta',
      branchId: 'branch-id',
      activoId: null,
      participantIds: ['membership-id'],
    })
    expect(mocks.uploadAttachments).toHaveBeenCalledWith('incident-id', 1, [file])
    expect(useIncidenciasStore.getState().incidencias[0]).toMatchObject({
      id: 'incident-id',
      version: 2,
      images: ['blob:authenticated-preview'],
    })
  })

  it('envía mutaciones optimistas con la versión actual', async () => {
    useIncidenciasStore.setState({
      apiContext: { hydrated: true },
      incidencias: [apiIncident({ apiSynced: true })],
    })
    mocks.updateStatus.mockResolvedValue(apiIncident({ status: 'en_proceso', version: 2 }))
    mocks.addComment.mockResolvedValue(apiIncident({ status: 'en_proceso', version: 3 }))

    await useIncidenciasStore.getState().updateStatus(
      'incident-id',
      'en_proceso',
      'Alex Demo',
      { isOnline: true }
    )
    await useIncidenciasStore.getState().addComment(
      'incident-id',
      'Alex Demo',
      'Técnico asignado',
      { isOnline: true }
    )

    expect(mocks.updateStatus).toHaveBeenCalledWith('incident-id', {
      status: 'en_proceso',
      version: 1,
    })
    expect(mocks.addComment).toHaveBeenCalledWith('incident-id', {
      message: 'Técnico asignado',
      version: 2,
    })
    expect(useIncidenciasStore.getState().incidencias[0].version).toBe(3)
  })
})
