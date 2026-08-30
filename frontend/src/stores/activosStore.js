import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage } from '@/services/storagePolicy'

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
export const catName = (id) => ACTIVO_CATEGORIES.find((c) => c.id === id)?.name || id

const SEED = [
  { id: 'act-seed-1', name: 'Silla ergonómica de recepción', code: 'MOB-001', category: 'mobiliario', value: 8500, status: 'activo', location: 'Recepción', branchId: 'charm-dn', purchaseDate: '2024-03-12', notes: '' },
  { id: 'act-seed-2', name: 'Laptop administración', code: 'TEC-014', category: 'tecnologia', value: 42000, status: 'activo', location: 'Oficina', branchId: 'charm-dn', purchaseDate: '2023-11-05', notes: 'MacBook Air M2' },
  { id: 'act-seed-3', name: 'Esterilizador UV', code: 'EQP-003', category: 'equipos', value: 15600, status: 'reparacion', location: 'Sala 2', branchId: 'charm-este', purchaseDate: '2024-01-20', notes: 'En taller externo' },
  { id: 'act-seed-4', name: 'Aire acondicionado 24k BTU', code: 'EQP-009', category: 'equipos', value: 38000, status: 'activo', location: 'Sala principal', branchId: 'charm-santiago', purchaseDate: '2022-06-18', notes: '' },
  { id: 'act-seed-5', name: 'Impresora térmica antigua', code: 'TEC-002', category: 'tecnologia', value: 4200, status: 'baja', location: 'Almacén', branchId: 'charm-dn', purchaseDate: '2020-02-10', notes: 'Reemplazada' },
]

export const useActivosStore = create(
  persist(
    (set, get) => ({
      activos: SEED,

      addActivo: (data) =>
        set((s) => ({
          activos: [
            {
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
            },
            ...s.activos,
          ],
        })),

      updateActivo: (id, data) =>
        set((s) => ({
          activos: s.activos.map((a) =>
            a.id === id
              ? { ...a, ...data, value: Number.isFinite(Number(data.value)) ? Number(data.value) : a.value }
              : a
          ),
        })),

      deleteActivo: (id) => set((s) => ({ activos: s.activos.filter((a) => a.id !== id) })),

      getStats: () => {
        const activos = get().activos
        const totalValue = activos
          .filter((a) => a.status !== 'baja')
          .reduce((sum, a) => sum + (Number(a.value) || 0), 0)
        return {
          count: activos.length,
          totalValue,
          operativos: activos.filter((a) => a.status === 'activo').length,
          reparacion: activos.filter((a) => a.status === 'reparacion').length,
          baja: activos.filter((a) => a.status === 'baja').length,
        }
      },
    }),
    { name: 'diedo-activos', storage: ephemeralJsonStorage, partialize: (s) => ({ activos: s.activos }) }
  )
)
