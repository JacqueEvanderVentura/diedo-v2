import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { statusMeta } from '@/data/incidencias'
import { incidentsApi } from '@/services/incidentsApi'
import {
  incidentToApiPayload,
  mapIncidentFromApi,
  mapIncidentStatsFromApi,
} from '@/services/adapters/incidents'
import {
  ephemeralJsonStorage,
  registerSensitiveStateCleaner,
} from '@/services/storagePolicy'

const genId = (prefix = 'inc') =>
  `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const now = () => new Date().toISOString()
const API_UNAVAILABLE = 'La API no está disponible.'

let incidentHydrationPromise = null
let storeGeneration = 0
const objectUrls = new Set()

export function deriveIncidentStats(incidents) {
  return {
    total: incidents.length,
    abiertas: incidents.filter((incident) => incident.status === 'abierta').length,
    enProceso: incidents.filter((incident) => incident.status === 'en_proceso').length,
    criticas: incidents.filter(
      (incident) => incident.priority === 'critica' && incident.status !== 'cerrada'
    ).length,
  }
}

function replaceIncident(incidents, next) {
  return incidents.map((incident) => (incident.id === next.id ? next : incident))
}

function createPreviewObjectUrl(blob) {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null
  const objectUrl = URL.createObjectURL(blob)
  objectUrls.add(objectUrl)
  return objectUrl
}

function revokeObjectUrl(objectUrl) {
  if (!objectUrl || !objectUrls.has(objectUrl)) return
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(objectUrl)
  }
  objectUrls.delete(objectUrl)
}

function releaseIncidentPreviews(incident) {
  ;(incident?.attachments || []).forEach((attachment) =>
    revokeObjectUrl(attachment.previewObjectUrl)
  )
}

function releaseAllPreviews() {
  for (const objectUrl of objectUrls) revokeObjectUrl(objectUrl)
}

async function loadMissingPreviews(incident) {
  const attachments = await Promise.all(
    (incident.attachments || []).map(async (attachment) => {
      if (attachment.previewObjectUrl || !attachment.previewUrl) return attachment
      try {
        const blob = await incidentsApi.preview(attachment.previewUrl)
        return { ...attachment, previewObjectUrl: createPreviewObjectUrl(blob) }
      } catch {
        return attachment
      }
    })
  )
  return {
    ...incident,
    attachments,
    images: attachments.map((attachment) => attachment.previewObjectUrl).filter(Boolean),
  }
}

function releaseUnusedPreviews(previous, next) {
  const retained = new Set(
    next.flatMap((incident) =>
      (incident.attachments || []).map((attachment) => attachment.previewObjectUrl)
    )
  )
  previous.forEach((incident) => {
    ;(incident.attachments || []).forEach((attachment) => {
      if (!retained.has(attachment.previewObjectUrl)) revokeObjectUrl(attachment.previewObjectUrl)
    })
  })
}

function fileToDataUrl(file) {
  if (typeof file === 'string') return Promise.resolve(file)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name || 'la imagen'}.`))
    reader.readAsDataURL(file)
  })
}

export const useIncidenciasStore = create(
  persist(
    (set, get) => ({
      incidencias: [],
      selectedId: null,
      stats: deriveIncidentStats([]),
      apiContext: { hydrated: false },
      hydrating: false,
      error: null,

      setSelectedId: (selectedId) => set({ selectedId }),

      hydrateFromApi: async ({ force = false } = {}) => {
        if (incidentHydrationPromise) return incidentHydrationPromise
        if (get().apiContext.hydrated && !force) return get().incidencias

        const requestGeneration = storeGeneration
        set((state) => ({
          hydrating: true,
          error: null,
          ...(state.apiContext.hydrated
            ? {}
            : { incidencias: [], selectedId: null, stats: deriveIncidentStats([]) }),
        }))
        incidentHydrationPromise = (async () => {
          try {
            const [response, statsResponse] = await Promise.all([
              incidentsApi.listAll({ sortBy: 'createdAt', sortDirection: 'desc' }),
              incidentsApi.stats(),
            ])
            const previous = get().incidencias
            const previousById = new Map(previous.map((incident) => [incident.id, incident]))
            const mapped = (response.items || []).map((incident) =>
              mapIncidentFromApi(incident, previousById.get(incident.id))
            )
            const incidencias = await Promise.all(mapped.map(loadMissingPreviews))
            if (requestGeneration !== storeGeneration) {
              incidencias.forEach(releaseIncidentPreviews)
              return []
            }
            releaseUnusedPreviews(previous, incidencias)
            set((state) => ({
              incidencias,
              selectedId:
                incidencias.find((incident) => incident.id === state.selectedId)?.id
                || incidencias[0]?.id
                || null,
              stats: mapIncidentStatsFromApi(statsResponse),
              apiContext: { hydrated: true },
              hydrating: false,
              error: null,
            }))
            return incidencias
          } catch (error) {
            if (requestGeneration === storeGeneration) {
              set({
                hydrating: false,
                error: error.message || 'No se pudieron cargar las incidencias.',
              })
            }
            throw error
          } finally {
            incidentHydrationPromise = null
          }
        })()
        return incidentHydrationPromise
      },

      addIncidencia: async (data, { isOnline = false } = {}) => {
        if (!isOnline) throw new Error(API_UNAVAILABLE)
        if (!get().apiContext.hydrated) await get().hydrateFromApi()

        const created = mapIncidentFromApi(
          await incidentsApi.create(incidentToApiPayload(data))
        )
        set((state) => {
          const incidencias = [created, ...state.incidencias]
          return {
            incidencias,
            selectedId: created.id,
            stats: deriveIncidentStats(incidencias),
            error: null,
          }
        })

        const files = data.imageFiles || []
        if (!files.length) return created
        try {
          const response = await incidentsApi.uploadAttachments(
            created.id,
            created.version,
            files
          )
          const incident = await loadMissingPreviews(mapIncidentFromApi(response, created))
          set((state) => ({
            incidencias: replaceIncident(state.incidencias, incident),
            selectedId: incident.id,
            error: null,
          }))
          return incident
        } catch (error) {
          const uploadError = new Error(
            `${created.code} fue creada, pero no se pudieron adjuntar las imágenes: ${error.message}`
          )
          uploadError.incidentCreated = true
          throw uploadError
        }
      },

      updateStatus: async (id, status, author = 'Sistema', { isOnline = false } = {}) => {
        if (!isOnline) throw new Error(API_UNAVAILABLE)
        if (!get().apiContext.hydrated) await get().hydrateFromApi()
        const current = get().incidencias.find((incident) => incident.id === id)
        if (!current) throw new Error('La incidencia no existe.')
        const incident = mapIncidentFromApi(
          await incidentsApi.updateStatus(id, { status, version: current.version }),
          current
        )
        set((state) => {
          const incidencias = replaceIncident(state.incidencias, incident)
          return { incidencias, stats: deriveIncidentStats(incidencias), error: null }
        })
        return incident
      },

      addComment: async (id, author, message, { isOnline = false } = {}) => {
        const normalized = message?.trim()
        if (!normalized) return null
        if (!isOnline) throw new Error(API_UNAVAILABLE)
        if (!get().apiContext.hydrated) await get().hydrateFromApi()
        const current = get().incidencias.find((incident) => incident.id === id)
        if (!current) throw new Error('La incidencia no existe.')
        const updatedAt = now()
        const optimisticActivity = {
          id: genId('activity'),
          type: 'comment',
          authorId: null,
          author,
          message: normalized,
          createdAt: updatedAt,
          pending: true,
        }
        const optimistic = {
          ...current,
          activity: [optimisticActivity, ...current.activity],
        }
        set((state) => ({
          incidencias: replaceIncident(state.incidencias, optimistic),
        }))
        try {
          const incident = mapIncidentFromApi(
            await incidentsApi.addComment(id, {
              message: normalized,
              version: current.version,
            }),
            current
          )
          set((state) => ({
            incidencias: replaceIncident(state.incidencias, incident),
            error: null,
          }))
          return incident
        } catch (error) {
          set((state) => ({
            incidencias: replaceIncident(state.incidencias, current),
          }))
          throw error
        }
      },

      addImages: async (id, files, { isOnline = false } = {}) => {
        if (!files?.length) return null
        if (!isOnline) throw new Error(API_UNAVAILABLE)
        if (!get().apiContext.hydrated) await get().hydrateFromApi()
        const current = get().incidencias.find((incident) => incident.id === id)
        if (!current) throw new Error('La incidencia no existe.')
        const optimisticAttachments = files.map((file, index) => ({
          id: `pending-${genId('att')}-${index}`,
          name: file.name || `Evidencia ${index + 1}`,
          contentType: file.type || 'image/jpeg',
          previewObjectUrl: createPreviewObjectUrl(file),
          pending: true,
        }))
        const optimistic = {
          ...current,
          attachments: [...(current.attachments || []), ...optimisticAttachments],
          images: [
            ...(current.images || []),
            ...optimisticAttachments.map((attachment) => attachment.previewObjectUrl).filter(Boolean),
          ],
        }
        set((state) => ({ incidencias: replaceIncident(state.incidencias, optimistic) }))
        try {
          const response = await incidentsApi.uploadAttachments(id, current.version, files)
          const incident = await loadMissingPreviews(mapIncidentFromApi(response, current))
          optimisticAttachments.forEach((attachment) => revokeObjectUrl(attachment.previewObjectUrl))
          set((state) => ({
            incidencias: replaceIncident(state.incidencias, incident),
            error: null,
          }))
          return incident
        } catch (error) {
          releaseIncidentPreviews(optimistic)
          set((state) => ({ incidencias: replaceIncident(state.incidencias, current) }))
          throw error
        }
      },

      getStats: () => get().stats || deriveIncidentStats(get().incidencias),

      clearSensitive: () => {
        storeGeneration += 1
        releaseAllPreviews()
        set({
          incidencias: [],
          selectedId: null,
          stats: deriveIncidentStats([]),
          apiContext: { hydrated: false },
          hydrating: false,
          error: null,
        })
      },
    }),
    {
      name: 'diedo-incidencias',
      storage: ephemeralJsonStorage,
      version: 2,
      partialize: (state) => ({
        incidencias: state.incidencias,
        selectedId: state.selectedId,
        stats: state.stats,
        apiContext: { hydrated: false },
      }),
    }
  )
)

registerSensitiveStateCleaner(() => useIncidenciasStore.getState().clearSensitive())
