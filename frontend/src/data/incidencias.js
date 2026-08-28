export const INCIDENCIA_PRIORITIES = [
  { id: 'baja', name: 'Baja', tone: 'neutral', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  { id: 'media', name: 'Media', tone: 'warning', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  { id: 'alta', name: 'Alta', tone: 'danger', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  { id: 'critica', name: 'Crítica', tone: 'danger', className: 'bg-red-100 text-red-700 border-red-200' },
]

export const INCIDENCIA_STATUSES = [
  { id: 'abierta', name: 'Abierta', tone: 'brand' },
  { id: 'en_proceso', name: 'En Proceso', tone: 'warning' },
  { id: 'resuelta', name: 'Resuelta', tone: 'success' },
  { id: 'cerrada', name: 'Cerrada', tone: 'neutral' },
]

export const INCIDENCIA_TYPES = [
  { id: 'activo', name: 'Activos / Equipos' },
  { id: 'infraestructura', name: 'Infraestructura' },
  { id: 'personal', name: 'Personal' },
]

export const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos los tipos' },
  ...INCIDENCIA_TYPES.map((t) => ({ value: t.id, label: t.name })),
]

export const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  ...INCIDENCIA_STATUSES.map((s) => ({ value: s.id, label: s.name })),
]

export const priorityMeta = (id) => INCIDENCIA_PRIORITIES.find((p) => p.id === id) || INCIDENCIA_PRIORITIES[1]
export const statusMeta = (id) => INCIDENCIA_STATUSES.find((s) => s.id === id) || INCIDENCIA_STATUSES[0]
export const typeMeta = (id) => INCIDENCIA_TYPES.find((t) => t.id === id) || INCIDENCIA_TYPES[0]

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('')
}
