import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PRODUCTS, SUPPLIES } from '@/data/products'
import { useCatalogStore } from '@/stores/catalogStore'

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

export const useInventarioStore = create(
  persist(
    (set, get) => ({
      movements: SEED_MOVEMENTS,

      recordSalidaMultiple: ({ items, employeeId, employeeName, appointmentId, appointmentLabel, comment, branchId }) => {
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
    }),
    {
      name: 'diedo-inventario',
      partialize: (s) => ({ movements: s.movements }),
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
