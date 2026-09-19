export const ACL_LABELS = {
  none: 'Sin acceso',
  view: 'Solo ver',
  use: 'Ver y usar',
}

export function cycleResourceAccess(current) {
  if (!current || current === 'none') return 'view'
  if (current === 'view') return 'use'
  return null
}

export function accessButtonClass(access) {
  if (access === 'use') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (access === 'view') return 'border-blue-200 bg-blue-50 text-blue-800'
  return 'border-slate-200 bg-slate-50 text-slate-500'
}

export function sortResources(resources) {
  return [...resources].sort((left, right) => {
    const order = (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
    if (order !== 0) return order
    return String(left.name || '').localeCompare(String(right.name || ''))
  })
}
