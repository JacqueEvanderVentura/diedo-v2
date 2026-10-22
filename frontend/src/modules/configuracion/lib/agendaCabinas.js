export const ACL_LABELS = {
  none: 'Sin Acceso',
  view: 'Solo Ver',
  use: 'Ver y Usar',
  edit: 'Usar y Editar',
}

export function cycleResourceAccess(current) {
  if (!current || current === 'none') return 'view'
  if (current === 'view') return 'use'
  if (current === 'use') return 'edit'
  return null
}

export function canBookResource(access) {
  return access === 'use' || access === 'edit'
}

export function canEditResource(access) {
  return access === 'edit'
}

export function accessButtonClass(access) {
  if (access === 'edit') return 'border-amber-200 bg-amber-50 text-amber-900'
  if (access === 'use') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (access === 'view') return 'border-blue-200 bg-blue-50 text-blue-800'
  return 'border-slate-200 bg-slate-50 text-slate-500'
}

export function accessPillClass(access) {
  if (access === 'edit') {
    return 'bg-amber-100 text-amber-800 font-bold'
  }
  if (access === 'use') {
    return 'bg-emerald-100 text-emerald-700 font-bold'
  }
  if (access === 'view') {
    return 'bg-blue-100 text-blue-700 font-bold'
  }
  return 'bg-slate-100 text-slate-500'
}

export function accessRowHighlightClass(access) {
  if (access === 'use' || access === 'edit') {
    return 'bg-blue-50/80 hover:bg-blue-50'
  }
  return 'hover:bg-slate-50'
}

export function sortResources(resources) {
  return [...resources].sort((left, right) => {
    const order = (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
    if (order !== 0) return order
    return String(left.name || '').localeCompare(String(right.name || ''))
  })
}

export function platformUserId(user) {
  return user?.userId ?? user?.user_id ?? null
}

export function userAssignedToBranch(user, branchId) {
  if (!branchId) return false
  if ((user?.branches || []).some((branch) => branch.id === branchId)) return true
  return (user?.branchIds || []).includes(branchId)
}

export function aclPatchItems(userId, access) {
  if (!userId) return []
  return [{ userId, access }]
}

export function normalizeAclUserId(userId) {
  return userId ? String(userId).toLowerCase() : ''
}

export function aclRowsToMap(rows, into = {}) {
  const map = into
  ;(rows || []).forEach((row) => {
    const userId = normalizeAclUserId(row.userId ?? row.user_id)
    if (!userId) return
    map[userId] = row.access ?? null
  })
  return map
}

export async function fetchAllActiveUsers(usersApi) {
  const pageSize = 100
  let page = 1
  const items = []
  let totalPages = 1
  do {
    const response = await usersApi.list({ page, pageSize, status: 'active', sortBy: 'displayName' })
    items.push(...(response.items || []))
    totalPages = response.totalPages || 1
    page += 1
  } while (page <= totalPages)
  return items
}
