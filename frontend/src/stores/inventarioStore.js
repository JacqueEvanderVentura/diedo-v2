import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage, registerSensitiveStateCleaner } from '@/services/storagePolicy'
import { useCatalogStore } from '@/stores/catalogStore'
import { useConfigStore } from '@/stores/configStore'
import { inventoryApi } from '@/services/inventoryApi'
import {
  adjustmentMovementToApiPayload,
  mapInventoryMovementFromApi,
  mapInventoryStockItemFromApi,
  mapSupplyUsageFromApi,
  outboundMovementToApiPayload,
} from '@/services/adapters/inventory'

const genId = () => `mov-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`

let movementHydrationPromise = null

function localStockItems(branchId) {
  return useCatalogStore.getState().products
    .filter((item) => ['product', 'supply'].includes(item.type) && item.stock !== null)
    .filter((item) => branchId === 'all' || item.branchId === branchId)
}

async function refreshCatalogFromApi() {
  const catalog = useCatalogStore.getState()
  try {
    await catalog.hydrateFromApi(useConfigStore.getState().branches)
  } catch {
    // The movement already succeeded; the line snapshots below keep stock coherent until retry.
  }
}

export const useInventarioStore = create(
  persist(
    (set, get) => ({
      movements: [],
      usage: [],
      apiContext: { hydrated: false },
      hydrating: false,
      error: null,

      hydrateFromApi: async () => {
        if (movementHydrationPromise) return movementHydrationPromise
        set({ hydrating: true, error: null })
        movementHydrationPromise = (async () => {
          try {
            const [movementResponse, usageResponse] = await Promise.all([
              inventoryApi.listAllMovements({ sortBy: 'createdAt', sortDirection: 'desc' }),
              inventoryApi.getSupplyUsage(),
            ])
            const movements = (movementResponse.items || []).map(mapInventoryMovementFromApi)
            const usage = (usageResponse || []).map(mapSupplyUsageFromApi)
            set({
              movements,
              usage,
              apiContext: { hydrated: true },
              hydrating: false,
              error: null,
            })
            return movements
          } catch (error) {
            set({ hydrating: false, error: error.message || 'No se pudieron cargar los movimientos.' })
            throw error
          } finally {
            movementHydrationPromise = null
          }
        })()
        return movementHydrationPromise
      },

      loadStockItems: async (branchId, { isOnline }) => {
        if (!isOnline) return localStockItems(branchId)
        if (!branchId || branchId === 'all') return []
        const response = await inventoryApi.listAllItems({
          branchId,
          status: 'active',
          sortBy: 'name',
          sortDirection: 'asc',
        })
        return (response.items || [])
          .map(mapInventoryStockItemFromApi)
          .filter((item) => ['product', 'supply'].includes(item.type) && item.stock !== null)
      },

      recordSalidaMultiple: async (data, { isOnline }) => {
        if (!isOnline) throw new Error('La API no está disponible.')
        const response = await inventoryApi.createOutboundMovement(
          outboundMovementToApiPayload(data)
        )
        const movement = mapInventoryMovementFromApi(response)
        movement.items.forEach((item) => useCatalogStore.getState().setStock(item.id, item.after))
        set((state) => ({ movements: [movement, ...state.movements] }))
        await Promise.allSettled([
          refreshCatalogFromApi(),
          inventoryApi.getSupplyUsage().then((rows) =>
            set({ usage: (rows || []).map(mapSupplyUsageFromApi) })
          ),
        ])
        return movement
      },

      recordAdjustment: async (data, { isOnline }) => {
        if (!isOnline) throw new Error('La API no está disponible.')
        const response = await inventoryApi.createAdjustmentMovement(
          adjustmentMovementToApiPayload(data)
        )
        const movement = mapInventoryMovementFromApi(response)
        movement.items.forEach((item) => useCatalogStore.getState().setStock(item.id, item.after))
        set((state) => ({ movements: [movement, ...state.movements] }))
        await refreshCatalogFromApi()
        return movement
      },

      clearSensitive: () => set({
        movements: [],
        usage: [],
        apiContext: { hydrated: false },
        hydrating: false,
        error: null,
      }),
    }),
    {
      name: 'diedo-inventario',
      storage: ephemeralJsonStorage,
      version: 2,
      partialize: (s) => ({ movements: s.movements, apiContext: { hydrated: false } }),
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted || {}) }
        if (!Array.isArray(state.movements)) state.movements = []
        state.apiContext = { hydrated: false }
        return state
      },
    }
  )
)

registerSensitiveStateCleaner(() => useInventarioStore.getState().clearSensitive())
