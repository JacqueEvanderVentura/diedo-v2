import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createPreviewObjectUrl, revokeObjectUrl, fileToDataUrl } from '@/lib/imageAttachments'
import { ephemeralJsonStorage, registerSensitiveStateCleaner } from '@/services/storagePolicy'
import { inventoryApi } from '@/services/inventoryApi'
import {
  assetToApiPayload,
  mapAssetCategoryFromApi,
  mapAssetFromApi,
  mapAssetSummaryFromApi,
} from '@/services/adapters/inventory'

const genId = () => `act-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`

export const ACTIVO_CATEGORIES = [
  { id: 'mobiliario', name: 'Mobiliario' },
  { id: 'equipos', name: 'Equipos' },
  { id: 'tecnologia', name: 'Tecnología' },
  { id: 'vehiculos', name: 'Vehículos' },
  { id: 'herramientas', name: 'Herramientas' },
  { id: 'otros', name: 'Otros' },
]

export const ACTIVO_STATUSES = [
  { id: 'activo', name: 'Activo', tone: 'success' },
  { id: 'reparacion', name: 'En reparación', tone: 'warning' },
  { id: 'baja', name: 'Dado de baja', tone: 'danger' },
]

export const statusMeta = (id) => ACTIVO_STATUSES.find((s) => s.id === id) || ACTIVO_STATUSES[0]
export const catName = (id, categories = ACTIVO_CATEGORIES) =>
  categories.find((c) => c.id === id)?.name || id

const API_UNAVAILABLE = 'La API no está disponible.'

let assetHydrationPromise = null

export function deriveAssetStats(activos) {
  return {
    count: activos.length,
    totalValue: activos
      .filter((activo) => activo.status !== 'baja')
      .reduce((sum, activo) => sum + (Number(activo.value) || 0), 0),
    operativos: activos.filter((activo) => activo.status === 'activo').length,
    reparacion: activos.filter((activo) => activo.status === 'reparacion').length,
    baja: activos.filter((activo) => activo.status === 'baja').length,
  }
}

function replaceAsset(activos, asset, previousId = asset.id) {
  const withoutPrevious = activos.filter((item) => item.id !== previousId && item.id !== asset.id)
  return [asset, ...withoutPrevious]
}

async function loadMissingAssetPreviews(asset, previous = null) {
  const previousPreviewById = new Map(
    (previous?.attachments || []).map((attachment) => [attachment.id, attachment.previewObjectUrl || null])
  )
  const attachments = await Promise.all(
    (asset.attachments || []).map(async (attachment) => {
      if (attachment.previewObjectUrl || previousPreviewById.get(attachment.id)) {
        return {
          ...attachment,
          previewObjectUrl: attachment.previewObjectUrl || previousPreviewById.get(attachment.id),
        }
      }
      if (!attachment.previewUrl) return attachment
      try {
        const blob = await inventoryApi.previewAssetAttachment(attachment.previewUrl)
        return { ...attachment, previewObjectUrl: createPreviewObjectUrl(blob) }
      } catch {
        return attachment
      }
    })
  )
  return {
    ...asset,
    attachments,
    images: attachments.map((attachment) => attachment.previewObjectUrl).filter(Boolean),
  }
}

export const useActivosStore = create(
  persist(
    (set, get) => ({
      activos: [],
      categories: ACTIVO_CATEGORIES,
      summary: null,
      apiContext: { hydrated: false },
      hydrating: false,
      error: null,

      hydrateFromApi: async () => {
        if (assetHydrationPromise) return assetHydrationPromise
        set({ hydrating: true, error: null })
        assetHydrationPromise = (async () => {
          try {
            const [assetsResponse, categoriesResponse, summaryResponse] = await Promise.all([
              inventoryApi.listAllAssets({ sortBy: 'name', sortDirection: 'asc' }),
              inventoryApi.listAssetCategories(),
              inventoryApi.getAssetSummary(),
            ])
            const previous = get().activos
            const previousById = new Map(previous.map((asset) => [asset.id, asset]))
            const mapped = (assetsResponse.items || []).map((asset) =>
              mapAssetFromApi(asset, previousById.get(asset.id))
            )
            const activos = await Promise.all(
              mapped.map((asset) => loadMissingAssetPreviews(asset, previousById.get(asset.id)))
            )
            const categories = categoriesResponse
              .filter((category) => category.status === 'active')
              .map(mapAssetCategoryFromApi)
            const summary = {
              count: activos.length,
              ...mapAssetSummaryFromApi(summaryResponse),
            }
            set({
              activos,
              categories,
              summary,
              apiContext: { hydrated: true },
              hydrating: false,
              error: null,
            })
            return activos
          } catch (error) {
            set({ hydrating: false, error: error.message || 'No se pudieron cargar los activos.' })
            throw error
          } finally {
            assetHydrationPromise = null
          }
        })()
        return assetHydrationPromise
      },

      saveActivo: async (data, existing, { isOnline }) => {
        if (!isOnline) throw new Error(API_UNAVAILABLE)

        if (!get().apiContext.hydrated || !get().categories.some((category) => category.apiSynced)) {
          await get().hydrateFromApi()
        }
        const target = existing?.apiSynced
          ? existing
          : get().activos.find((asset) =>
              asset.apiSynced && (
                (existing?.code && asset.code === existing.code)
                || asset.name.trim().toLowerCase() === existing?.name?.trim().toLowerCase()
              )
            )
        const payload = assetToApiPayload(data, get().categories)
        const response = target?.apiSynced
          ? await inventoryApi.updateAsset(target.id, { version: target.version, ...payload })
          : await inventoryApi.createAsset(payload)
        let asset = mapAssetFromApi(response, target || existing)
        asset = await loadMissingAssetPreviews(asset, target || existing)

        const pendingFiles = data.imageFiles || []
        if (pendingFiles.length && asset.apiSynced) {
          const uploadResponse = await inventoryApi.uploadAssetAttachments(
            asset.id,
            asset.version,
            pendingFiles
          )
          asset = await loadMissingAssetPreviews(
            mapAssetFromApi(uploadResponse, asset),
            asset
          )
        }

        set((state) => {
          const activos = replaceAsset(state.activos, asset, target?.id || existing?.id)
          return { activos, summary: deriveAssetStats(activos) }
        })
        return asset
      },

      addImages: async (id, files, { isOnline = false } = {}) => {
        if (!files?.length) return null
        const current = get().activos.find((activo) => activo.id === id)
        if (!current) throw new Error('El activo no existe.')

        if (!isOnline) throw new Error(API_UNAVAILABLE)
        if (current.apiSynced) {
          if (!get().apiContext.hydrated) await get().hydrateFromApi()
          const optimisticAttachments = files.map((file, index) => ({
            id: `pending-${genId()}-${index}`,
            name: file.name || `Foto ${index + 1}`,
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
          set((state) => ({ activos: replaceAsset(state.activos, optimistic) }))
          try {
            const response = await inventoryApi.uploadAssetAttachments(id, current.version, files)
            const asset = await loadMissingAssetPreviews(mapAssetFromApi(response, current), current)
            optimisticAttachments.forEach((attachment) => revokeObjectUrl(attachment.previewObjectUrl))
            set((state) => ({ activos: replaceAsset(state.activos, asset) }))
            return asset
          } catch (error) {
            optimisticAttachments.forEach((attachment) => revokeObjectUrl(attachment.previewObjectUrl))
            set((state) => ({ activos: replaceAsset(state.activos, current) }))
            throw error
          }
        }

        throw new Error(API_UNAVAILABLE)
      },

      retireActivo: async (id, { isOnline }) => {
        const requested = get().activos.find((activo) => activo.id === id)
        if (isOnline && !get().apiContext.hydrated) await get().hydrateFromApi()
        const current = get().activos.find((activo) => activo.id === id)
          || get().activos.find((asset) =>
            asset.apiSynced && (
              (requested?.code && asset.code === requested.code)
              || asset.name.trim().toLowerCase() === requested?.name?.trim().toLowerCase()
            )
          )
        if (!current) throw new Error('El activo no existe.')
        if (current.status === 'baja') return current

        if (!isOnline) throw new Error(API_UNAVAILABLE)
        if (!current.apiSynced) throw new Error(API_UNAVAILABLE)

        const response = await inventoryApi.updateAsset(id, {
          version: current.version,
          status: 'baja',
        })
        const asset = await loadMissingAssetPreviews(mapAssetFromApi(response, current), current)
        set((state) => {
          const activos = replaceAsset(state.activos, asset)
          return { activos, summary: deriveAssetStats(activos) }
        })
        return asset
      },

      addActivo: (data) => {
        const attachments = data.attachments || []
        const asset = {
          id: genId(),
          name: data.name,
          code: data.code || null,
          category: data.category || 'otros',
          value: Number(data.value) || 0,
          status: data.status || 'activo',
          location: data.location || '',
          branchId: data.branchId || 'charm-dn',
          purchaseDate: data.purchaseDate || '',
          notes: data.notes || '',
          attachments,
          images: attachments.map((attachment) => attachment.previewObjectUrl).filter(Boolean),
        }
        set((state) => {
          const activos = [asset, ...state.activos]
          return { activos, summary: deriveAssetStats(activos) }
        })
        return asset
      },

      updateActivo: (id, data) =>
        set((state) => {
          const activos = state.activos.map((a) =>
            a.id === id
              ? {
                  ...a,
                  ...data,
                  value: Number.isFinite(Number(data.value)) ? Number(data.value) : a.value,
                  images: (data.attachments || a.attachments || [])
                    .map((attachment) => attachment.previewObjectUrl)
                    .filter(Boolean),
                }
              : a
          )
          return { activos, summary: deriveAssetStats(activos) }
        }),

      getStats: () => get().summary || deriveAssetStats(get().activos),

      clearSensitive: () => set({
        activos: [],
        categories: ACTIVO_CATEGORIES,
        summary: null,
        apiContext: { hydrated: false },
        hydrating: false,
        error: null,
      }),
    }),
    {
      name: 'diedo-activos',
      storage: ephemeralJsonStorage,
      version: 2,
      migrate: (persisted) => persisted ?? {},
      partialize: (state) => ({ activos: state.activos, apiContext: { hydrated: false } }),
    }
  )
)

registerSensitiveStateCleaner(() => useActivosStore.getState().clearSensitive())
