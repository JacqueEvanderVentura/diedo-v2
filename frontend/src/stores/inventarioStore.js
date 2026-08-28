import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useCatalogStore } from '@/stores/catalogStore'

const genId = () => `mov-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`

export const useInventarioStore = create(
  persist(
    (set, get) => ({
      movements: [],

      recordSalidaMultiple: ({ items, employee, comment, branchId }) => {
        const movement = {
          id: genId(),
          type: 'salida',
          items: items.map((i) => ({ id: i.id, name: i.name, qty: i.qty, sku: i.sku || null })),
          employee: employee || 'Sin asignar',
          comment: comment || '',
          branchId: branchId || 'all',
          createdAt: new Date().toISOString(),
        }
        useCatalogStore.getState().bulkDecrementStock(items)
        set((s) => ({ movements: [movement, ...s.movements] }))
        return movement
      },
    }),
    { name: 'diedo-inventario', partialize: (s) => ({ movements: s.movements }) }
  )
)
