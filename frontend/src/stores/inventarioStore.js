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
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

const SEED_MOVEMENTS = [
  {
    id: 'mov-seed-1',
    type: 'salida',
    items: [{ id: 'sup-1', name: 'Guantes de nitrilo (caja)', qty: 3, sku: 'INS-01' }],
    employeeId: 'emp1',
    employeeName: 'Jasmin Beltre Familia',
    employee: 'Jasmin Beltre Familia',
    appointmentId: 'apt-seed-1',
    appointmentLabel: 'María Fernández · 1 sesión axilas',
    comment: 'Sesión matutina',
    branchId: 'charm-dn',
    createdAt: daysAgo(0),
  },
  {
    id: 'mov-seed-2',
    type: 'salida',
    items: [
      { id: 'sup-1', name: 'Guantes de nitrilo (caja)', qty: 2, sku: 'INS-01' },
      { id: 'sup-2', name: 'Gel conductor láser', qty: 1, sku: 'INS-02' },
    ],
    employeeId: 'emp1',
    employeeName: 'Jasmin Beltre Familia',
    employee: 'Jasmin Beltre Familia',
    appointmentId: 'apt-seed-8',
    appointmentLabel: 'Nicole Sosa · Cuerpo completo',
    comment: '',
    branchId: 'charm-dn',
    createdAt: daysAgo(1),
  },
  {
    id: 'mov-seed-3',
    type: 'salida',
    items: [{ id: 'sup-3', name: 'Toallas desechables (paquete)', qty: 1, sku: 'INS-03' }],
    employeeId: 'emp3',
    employeeName: 'Criswaily Mesa',
    employee: 'Criswaily Mesa',
    appointmentId: 'apt-seed-2',
    appointmentLabel: 'Ana Cristina Vargas · Facial hidratante',
    comment: '',
    branchId: 'charm-dn',
    createdAt: daysAgo(0),
  },
]

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
      movements: SEED_MOVEMENTS,
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
        const { items, employeeId, employeeName, appointmentId, appointmentLabel, comment, branchId } = data
        if (isOnline) {
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
        }

        const movement = {
          id: genId(),
          type: 'salida',
          items: items.map((i) => ({ id: i.id, name: i.name, qty: i.qty, sku: i.sku || null })),
          employeeId: employeeId || null,
          employeeName: employeeName || 'Sin asignar',
          employee: employeeName || 'Sin asignar',
          appointmentId: appointmentId || null,
          appointmentLabel: appointmentLabel || null,
          comment: comment || '',
          branchId: branchId || 'all',
          createdAt: new Date().toISOString(),
        }
        useCatalogStore.getState().bulkDecrementStock(items)
        set((s) => ({ movements: [movement, ...s.movements] }))
        return movement
      },

      recordAdjustment: async (data, { isOnline }) => {
        if (isOnline) {
          const response = await inventoryApi.createAdjustmentMovement(
            adjustmentMovementToApiPayload(data)
          )
          const movement = mapInventoryMovementFromApi(response)
          movement.items.forEach((item) => useCatalogStore.getState().setStock(item.id, item.after))
          set((state) => ({ movements: [movement, ...state.movements] }))
          await refreshCatalogFromApi()
          return movement
        }

        const movement = {
          id: genId(),
          type: 'ajuste',
          movementType: 'adjustment',
          items: data.items.map((item) => {
            const before = Number(item.stock) || 0
            const after = Number(item.quantity) || 0
            useCatalogStore.getState().setStock(item.id, after)
            return {
              id: item.id,
              name: item.name,
              sku: item.sku || null,
              unit: item.unit || 'ud',
              qty: Math.abs(after - before),
              delta: after - before,
              before,
              after,
            }
          }),
          employeeId: null,
          employeeName: null,
          employee: null,
          appointmentId: null,
          appointmentLabel: null,
          comment: data.comment,
          branchId: data.branchId,
          createdBy: 'Usuario demo',
          createdAt: new Date().toISOString(),
        }
        set((state) => ({ movements: [movement, ...state.movements] }))
        return movement
      },

      clearSensitive: () => set({
        movements: SEED_MOVEMENTS,
        usage: [],
        apiContext: { hydrated: false },
        hydrating: false,
        error: null,
      }),
    }),
    {
      name: 'diedo-inventario',
      storage: ephemeralJsonStorage,
      partialize: (s) => ({ movements: s.movements, apiContext: { hydrated: false } }),
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted || {}) }
        if (!Array.isArray(state.movements) || state.movements.length === 0) {
          state.movements = SEED_MOVEMENTS
        }
        return state
      },
    }
  )
)

registerSensitiveStateCleaner(() => useInventarioStore.getState().clearSensitive())
