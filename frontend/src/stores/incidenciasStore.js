import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { statusMeta } from '@/data/incidencias'

const genId = () => `inc-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const now = () => new Date().toISOString()
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

const SEED = [
  {
    id: 'inc-seed-1',
    code: 'INC-1193',
    title: 'Solicitud para reparación de las maquina de vapor',
    description: '4 maquinas de valor para reparación',
    type: 'activo',
    priority: 'alta',
    status: 'en_proceso',
    branchId: 'charm-dn',
    activoId: 'act-seed-4',
    intervenientes: [
      { id: 'u2', name: 'Arali Jaquez' },
      { id: 'u1', name: 'Leonedis Hamburgo' },
    ],
    images: [],
    activity: [
      { id: 'a1', author: 'Arali Jaquez', message: 'Incidencia reportada y abierta.', createdAt: daysAgo(2) },
      { id: 'a2', author: 'Leonedis Hamburgo', message: 'Estado cambiado a en proceso.', createdAt: daysAgo(1) },
    ],
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1),
  },
  {
    id: 'inc-seed-2',
    code: 'INC-1188',
    title: 'Fuga de agua en baño de clientes',
    description: 'Se detectó humedad en el techo del baño principal.',
    type: 'infraestructura',
    priority: 'alta',
    status: 'abierta',
    branchId: 'charm-santiago',
    activoId: null,
    intervenientes: [{ id: 'u1', name: 'Leonedis Hamburgo' }],
    images: [],
    activity: [{ id: 'a3', author: 'Leonedis Hamburgo', message: 'Incidencia reportada y abierta.', createdAt: daysAgo(0) }],
    createdAt: daysAgo(0),
    updatedAt: daysAgo(0),
  },
  {
    id: 'inc-seed-3',
    code: 'INC-1175',
    title: 'Empleado ausente: Fiordaliza Fernandez',
    description: 'Ausencia no reportada en turno de mañana.',
    type: 'personal',
    priority: 'baja',
    status: 'cerrada',
    branchId: 'charm-dn',
    activoId: null,
    intervenientes: [{ id: 'u2', name: 'María Recepción' }],
    images: [],
    activity: [
      { id: 'a4', author: 'María Recepción', message: 'Incidencia reportada y abierta.', createdAt: daysAgo(5) },
      { id: 'a5', author: 'Leonedis Hamburgo', message: 'Estado cambiado a cerrada.', createdAt: daysAgo(4) },
    ],
    createdAt: daysAgo(5),
    updatedAt: daysAgo(4),
  },
  {
    id: 'inc-seed-4',
    code: 'INC-1162',
    title: 'Aire acondicionado sin enfriar en cabina 2',
    description: 'Temperatura elevada desde ayer por la tarde.',
    type: 'activo',
    priority: 'media',
    status: 'en_proceso',
    branchId: 'charm-este',
    activoId: 'act-seed-4',
    intervenientes: [{ id: 'u3', name: 'Carlos Cajero' }],
    images: [],
    activity: [{ id: 'a6', author: 'Carlos Cajero', message: 'Técnico programado para revisión.', createdAt: daysAgo(3) }],
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
  },
  {
    id: 'inc-seed-5',
    code: 'INC-1150',
    title: 'Luz intermitente en pasillo principal',
    description: 'Parpadeo constante en luminaria central.',
    type: 'infraestructura',
    priority: 'media',
    status: 'resuelta',
    branchId: 'charm-dn',
    activoId: null,
    intervenientes: [{ id: 'u1', name: 'Leonedis Hamburgo' }],
    images: [],
    activity: [{ id: 'a7', author: 'Leonedis Hamburgo', message: 'Luminaria reemplazada.', createdAt: daysAgo(7) }],
    createdAt: daysAgo(8),
    updatedAt: daysAgo(7),
  },
  {
    id: 'inc-seed-6',
    code: 'INC-1144',
    title: 'Impresora térmica fuera de servicio',
    description: 'No imprime tickets desde el cierre de caja.',
    type: 'activo',
    priority: 'critica',
    status: 'abierta',
    branchId: 'charm-dn',
    activoId: 'act-seed-5',
    intervenientes: [
      { id: 'u3', name: 'Carlos Cajero' },
      { id: 'u1', name: 'Leonedis Hamburgo' },
    ],
    images: [],
    activity: [{ id: 'a8', author: 'Carlos Cajero', message: 'Incidencia reportada y abierta.', createdAt: daysAgo(1) }],
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  },
]

function nextCode(incidencias) {
  const nums = incidencias
    .map((i) => Number(String(i.code).replace(/\D/g, '')))
    .filter((n) => Number.isFinite(n))
  const next = (nums.length ? Math.max(...nums) : 1193) + 1
  return `INC-${next}`
}

export const useIncidenciasStore = create(
  persist(
    (set, get) => ({
      incidencias: SEED,
      selectedId: SEED[0]?.id || null,

      setSelectedId: (selectedId) => set({ selectedId }),

      getStats: () => {
        const list = get().incidencias
        return {
          total: list.length,
          abiertas: list.filter((i) => i.status === 'abierta').length,
          enProceso: list.filter((i) => i.status === 'en_proceso').length,
          criticas: list.filter((i) => i.priority === 'critica' && i.status !== 'cerrada').length,
        }
      },

      addIncidencia: (data) => {
        const item = {
          id: genId(),
          code: nextCode(get().incidencias),
          title: data.title,
          description: data.description || '',
          type: data.type || 'activo',
          priority: data.priority || 'media',
          status: 'abierta',
          branchId: data.branchId || null,
          activoId: data.activoId || null,
          intervenientes: data.intervenientes || [],
          images: data.images || [],
          activity: [
            {
              id: genId(),
              author: data.reportedBy || 'Sistema',
              message: 'Incidencia reportada y abierta.',
              createdAt: now(),
            },
          ],
          createdAt: now(),
          updatedAt: now(),
        }
        set((s) => ({ incidencias: [item, ...s.incidencias], selectedId: item.id }))
        return item
      },

      updateStatus: (id, status, author = 'Sistema') => {
        const label = statusMeta(status).name.toLowerCase()
        set((s) => ({
          incidencias: s.incidencias.map((i) =>
            i.id === id
              ? {
                  ...i,
                  status,
                  updatedAt: now(),
                  activity: [
                    {
                      id: genId(),
                      author,
                      message: `Estado cambiado a ${label}.`,
                      createdAt: now(),
                    },
                    ...i.activity,
                  ],
                }
              : i
          ),
        }))
      },

      addComment: (id, author, message) => {
        if (!message?.trim()) return
        set((s) => ({
          incidencias: s.incidencias.map((i) =>
            i.id === id
              ? {
                  ...i,
                  updatedAt: now(),
                  activity: [
                    { id: genId(), author, message: message.trim(), createdAt: now() },
                    ...i.activity,
                  ],
                }
              : i
          ),
        }))
      },

      addImages: (id, images) => {
        if (!images?.length) return
        set((s) => ({
          incidencias: s.incidencias.map((i) =>
            i.id === id ? { ...i, images: [...i.images, ...images], updatedAt: now() } : i
          ),
        }))
      },
    }),
    { name: 'diedo-incidencias', partialize: (s) => ({ incidencias: s.incidencias, selectedId: s.selectedId }) }
  )
)
