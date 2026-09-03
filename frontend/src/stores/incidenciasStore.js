import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEMO_SNAPSHOT } from '@/data/generated/demoSnapshot'
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
const DEMO_BRANCH_IDS = {
  HQ: 'charm-dn',
  NORTH: 'charm-santiago',
  DOWNTOWN: 'charm-dn',
  EAST: 'charm-este',
}
const DEMO_ASSET_IDS = {
  'north-laser-machine': 'act-seed-4',
  'east-cooling-system': 'act-seed-4',
  'north-pos-tablet': 'act-seed-5',
}

const demoUsersBySeedKey = new Map(
  DEMO_SNAPSHOT.iam.users.map((user) => [user.seedKey, user])
)
const demoEmployeesBySeedKey = new Map(
  DEMO_SNAPSHOT.employees.items.map((employee) => [employee.seedKey, employee])
)

const SEED = DEMO_SNAPSHOT.incidents.items.map((incident) => {
  const attachments = (incident.attachments || []).map((attachment) => ({
    id: `demo:${incident.seedKey}:${attachment.seedKey}`,
    name: attachment.originalFilename,
    contentType: attachment.contentType,
    sizeBytes: 0,
    checksum: null,
    previewUrl: null,
    previewObjectUrl: `data:${attachment.contentType};base64,${attachment.contentBase64}`,
    createdAt: attachment.createdAt,
  }))
  return {
    id: `demo:${incident.seedKey}`,
    code: incident.code,
    title: incident.title,
    description: incident.description || '',
    type: incident.type,
    priority: incident.priority,
    status: incident.status,
    branchId: DEMO_BRANCH_IDS[incident.branchCode] || incident.branchCode,
    activoId: DEMO_ASSET_IDS[incident.assetSeedKey] || null,
    employee: incident.employeeSeedKey
      ? {
        id: incident.employeeSeedKey,
        name: [
          demoEmployeesBySeedKey.get(incident.employeeSeedKey)?.firstName,
          demoEmployeesBySeedKey.get(incident.employeeSeedKey)?.lastName,
        ].filter(Boolean).join(' ') || incident.employeeSeedKey,
      }
      : null,
    employeeId: incident.employeeSeedKey || null,
    employeeIncidentKind: incident.employeeIncidentKind || null,
    reporter: {
      id: `demo:${incident.reporterUserSeedKey}`,
      name: demoUsersBySeedKey.get(incident.reporterUserSeedKey)?.displayName || 'Sistema demo',
    },
    intervenientes: incident.participantUserSeedKeys.map((seedKey) => ({
      id: `demo:${seedKey}`,
      name: demoUsersBySeedKey.get(seedKey)?.displayName || seedKey,
    })),
    attachments,
    images: attachments.map((attachment) => attachment.previewObjectUrl),
    activity: incident.activities.map((activity) => ({
      id: `demo:${incident.seedKey}:${activity.seedKey}`,
      type: activity.type,
      authorId: `demo:${activity.authorUserSeedKey}`,
      author: demoUsersBySeedKey.get(activity.authorUserSeedKey)?.displayName || 'Sistema demo',
      message: activity.message,
      createdAt: activity.createdAt,
    })),
    version: 1,
    createdAt: incident.createdAt,
    updatedAt: incident.updatedAt,
    apiSynced: false,
  }
})

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

function localIncident(data) {
  const createdAt = now()
  const id = genId()
  return {
    id,
    code: `INC-${Date.now().toString().slice(-6)}`,
    title: data.title,
    description: data.description || '',
    type: data.type || 'activo',
    priority: data.priority || 'media',
    status: 'abierta',
    branchId: data.branchId || null,
    activoId: data.activoId || null,
    employee: data.employeeId
      ? { id: data.employeeId, name: data.employeeName || data.employeeId }
      : null,
    employeeId: data.employeeId || null,
    employeeIncidentKind: data.employeeIncidentKind || null,
    reporter: { id: null, name: data.reportedBy || 'Sistema local' },
    intervenientes: data.intervenientes || [],
    attachments: [],
    images: data.images || [],
    activity: [
      {
        id: genId('activity'),
        type: 'created',
        authorId: null,
        author: data.reportedBy || 'Sistema local',
        message: 'Incidencia reportada y abierta.',
        createdAt,
      },
    ],
    version: 1,
    createdAt,
    updatedAt: createdAt,
    apiSynced: false,
  }
}

export const useIncidenciasStore = create(
  persist(
    (set, get) => ({
      incidencias: SEED,
      selectedId: SEED[0]?.id || null,
      stats: deriveIncidentStats(SEED),
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
        if (!isOnline) {
          const incident = localIncident(data)
          set((state) => {
            const incidencias = [incident, ...state.incidencias]
            return {
              incidencias,
              selectedId: incident.id,
              stats: deriveIncidentStats(incidencias),
            }
          })
          return incident
        }
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
        if (isOnline && !get().apiContext.hydrated) await get().hydrateFromApi()
        const current = get().incidencias.find((incident) => incident.id === id)
        if (!current) throw new Error('La incidencia no existe.')
        if (isOnline) {
          const incident = mapIncidentFromApi(
            await incidentsApi.updateStatus(id, { status, version: current.version }),
            current
          )
          set((state) => {
            const incidencias = replaceIncident(state.incidencias, incident)
            return { incidencias, stats: deriveIncidentStats(incidencias), error: null }
          })
          return incident
        }

        const updatedAt = now()
        const incident = {
          ...current,
          status,
          version: current.version + 1,
          updatedAt,
          activity: [
            {
              id: genId('activity'),
              type: 'status_changed',
              authorId: null,
              author,
              message: `Estado cambiado a ${statusMeta(status).name.toLowerCase()}.`,
              createdAt: updatedAt,
            },
            ...current.activity,
          ],
        }
        set((state) => {
          const incidencias = replaceIncident(state.incidencias, incident)
          return { incidencias, stats: deriveIncidentStats(incidencias) }
        })
        return incident
      },

      addComment: async (id, author, message, { isOnline = false } = {}) => {
        const normalized = message?.trim()
        if (!normalized) return null
        if (isOnline && !get().apiContext.hydrated) await get().hydrateFromApi()
        const current = get().incidencias.find((incident) => incident.id === id)
        if (!current) throw new Error('La incidencia no existe.')
        if (isOnline) {
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
        }

        const updatedAt = now()
        const incident = {
          ...current,
          version: current.version + 1,
          updatedAt,
          activity: [
            {
              id: genId('activity'),
              type: 'comment',
              authorId: null,
              author,
              message: normalized,
              createdAt: updatedAt,
            },
            ...current.activity,
          ],
        }
        set((state) => ({ incidencias: replaceIncident(state.incidencias, incident) }))
        return incident
      },

      addImages: async (id, files, { isOnline = false } = {}) => {
        if (!files?.length) return null
        if (isOnline && !get().apiContext.hydrated) await get().hydrateFromApi()
        const current = get().incidencias.find((incident) => incident.id === id)
        if (!current) throw new Error('La incidencia no existe.')
        if (isOnline) {
          const response = await incidentsApi.uploadAttachments(id, current.version, files)
          const incident = await loadMissingPreviews(mapIncidentFromApi(response, current))
          set((state) => ({
            incidencias: replaceIncident(state.incidencias, incident),
            error: null,
          }))
          return incident
        }

        const images = await Promise.all(files.map(fileToDataUrl))
        const updatedAt = now()
        const incident = {
          ...current,
          images: [...current.images, ...images],
          version: current.version + 1,
          updatedAt,
        }
        set((state) => ({ incidencias: replaceIncident(state.incidencias, incident) }))
        return incident
      },

      getStats: () => get().stats || deriveIncidentStats(get().incidencias),

      clearSensitive: () => {
        storeGeneration += 1
        releaseAllPreviews()
        set({
          incidencias: SEED,
          selectedId: SEED[0]?.id || null,
          stats: deriveIncidentStats(SEED),
          apiContext: { hydrated: false },
          hydrating: false,
          error: null,
        })
      },
    }),
    {
      name: 'diedo-incidencias',
      storage: ephemeralJsonStorage,
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
