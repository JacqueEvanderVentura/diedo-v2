import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage, registerSensitiveStateCleaner } from '@/services/storagePolicy'
import { inventoryApi } from '@/services/inventoryApi'
import {
  assetToApiPayload,
  mapAssetCategoryFromApi,
  mapAssetFromApi,
  mapAssetSummaryFromApi,
} from '@/services/adapters/inventory'

const genId = () => `act-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`

// Categorías de activos (distintas al catálogo vendible)
export const ACTIVO_CATEGORIES = [
  { id: 'mobiliario', name: 'Mobiliario' },
  { id: 'equipos', name: 'Equipos' },
  { id: 'tecnologia', name: 'Tecnología' },
  { id: 'vehiculos', name: 'Vehículos' },
  { id: 'herramientas', name: 'Herramientas' },
  { id: 'otros', name: 'Otros' },
]

// Estados operativos del activo
export const ACTIVO_STATUSES = [
  { id: 'activo', name: 'Activo', tone: 'success' },
  { id: 'reparacion', name: 'En reparación', tone: 'warning' },
  { id: 'baja', name: 'Dado de baja', tone: 'danger' },
]

export const statusMeta = (id) => ACTIVO_STATUSES.find((s) => s.id === id) || ACTIVO_STATUSES[0]
export const catName = (id, categories = ACTIVO_CATEGORIES) =>
  categories.find((c) => c.id === id)?.name || id

const SEED = [
  { id: 'act-seed-1', name: 'Silla ergonómica de recepción', code: 'MOB-001', category: 'mobiliario', value: 8500, status: 'activo', location: 'Recepción', branchId: 'charm-dn', purchaseDate: '2024-03-12', notes: '' },
  { id: 'act-seed-2', name: 'Laptop administración', code: 'TEC-014', category: 'tecnologia', value: 42000, status: 'activo', location: 'Oficina', branchId: 'charm-dn', purchaseDate: '2023-11-05', notes: 'MacBook Air M2' },
  { id: 'act-seed-3', name: 'Esterilizador UV', code: 'EQP-003', category: 'equipos', value: 15600, status: 'reparacion', location: 'Sala 2', branchId: 'charm-este', purchaseDate: '2024-01-20', notes: 'En taller externo' },
  { id: 'act-seed-4', name: 'Aire acondicionado 24k BTU', code: 'EQP-009', category: 'equipos', value: 38000, status: 'activo', location: 'Sala principal', branchId: 'charm-santiago', purchaseDate: '2022-06-18', notes: '' },
  { id: 'act-seed-5', name: 'Impresora térmica antigua', code: 'TEC-002', category: 'tecnologia', value: 4200, status: 'baja', location: 'Almacén', branchId: 'charm-dn', purchaseDate: '2020-02-10', notes: 'Reemplazada' },
]

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

export const useActivosStore = create(
  persist(
    (set, get) => ({
      activos: SEED,
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
            const activos = (assetsResponse.items || []).map(mapAssetFromApi)
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
        if (!isOnline) {
          if (existing) {
            get().updateActivo(existing.id, data)
            return get().activos.find((activo) => activo.id === existing.id)
          }
          return get().addActivo(data)
        }

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
        const asset = mapAssetFromApi(response)
        set((state) => {
          const activos = replaceAsset(state.activos, asset, target?.id || existing?.id)
          return { activos, summary: deriveAssetStats(activos) }
        })
        return asset
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

        if (!isOnline || !current.apiSynced) {
          get().updateActivo(current.id, { status: 'baja' })
          return get().activos.find((activo) => activo.id === current.id)
        }

        const response = await inventoryApi.updateAsset(id, {
          version: current.version,
          status: 'baja',
        })
        const asset = mapAssetFromApi(response)
        set((state) => {
          const activos = replaceAsset(state.activos, asset)
          return { activos, summary: deriveAssetStats(activos) }
        })
        return asset
      },

      addActivo: (data) => {
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
              ? { ...a, ...data, value: Number.isFinite(Number(data.value)) ? Number(data.value) : a.value }
              : a
          )
          return { activos, summary: deriveAssetStats(activos) }
        }),

      getStats: () => get().summary || deriveAssetStats(get().activos),

      clearSensitive: () => set({
        activos: SEED,
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
      partialize: (state) => ({ activos: state.activos, apiContext: { hydrated: false } }),
    }
  )
)

registerSensitiveStateCleaner(() => useActivosStore.getState().clearSensitive())
