/** Branch filter helpers shared across modules. */

/** Consistent width for CRM list filters (avoids truncated Select labels). */
export const CRM_BRANCH_FILTER_CLASS = 'w-full min-w-[220px] sm:min-w-[240px] sm:max-w-sm'

export function isAllBranches(branchId) {
  return branchId == null || branchId === '' || branchId === 'all'
}

export function isAllBranchSelection(branchIds) {
  return !Array.isArray(branchIds) || branchIds.length === 0
}

export function normalizeBranchIds(branchId, branchIds) {
  if (Array.isArray(branchIds) && branchIds.length) return branchIds
  if (!isAllBranches(branchId)) return [branchId]
  return null
}

export function branchIdFromSelection(branchIds, branchId) {
  const normalized = normalizeBranchIds(branchId, branchIds)
  if (!normalized || normalized.length !== 1) return ''
  return normalized[0]
}

export function branchQueryParams(branchId, branchIds) {
  const normalized = normalizeBranchIds(branchId, branchIds)
  if (!normalized) return {}
  if (normalized.length === 1) return { branchId: normalized[0] }
  return { branchIds: normalized }
}

export function getRowBranchIds(row) {
  if (!row) return []
  if (Array.isArray(row.branchIds) && row.branchIds.length) return row.branchIds
  if (row.branchId) return [row.branchId]
  return []
}

export function matchesBranch(row, branchId) {
  if (isAllBranches(branchId)) return true
  return getRowBranchIds(row).includes(branchId)
}

export function matchesBranches(row, branchIds, getBranchIds = getRowBranchIds) {
  if (isAllBranchSelection(branchIds)) return true
  const rowIds = getBranchIds(row)
  return branchIds.some((branchId) => rowIds.includes(branchId))
}

export function filterByBranch(items, branchId, getBranchIds = getRowBranchIds) {
  if (isAllBranches(branchId)) return items
  return items.filter((item) => getBranchIds(item).includes(branchId))
}

export function filterByBranches(items, branchIds, getBranchIds = getRowBranchIds) {
  if (isAllBranchSelection(branchIds)) return items
  return items.filter((item) => matchesBranches(item, branchIds, getBranchIds))
}

export function applyBranchFilter(items, { branchId, branchIds } = {}, getBranchIds = getRowBranchIds) {
  const normalized = normalizeBranchIds(branchId, branchIds)
  if (!normalized) return items
  if (normalized.length === 1) return filterByBranch(items, normalized[0], getBranchIds)
  return filterByBranches(items, normalized, getBranchIds)
}

export function buildBranchFilterOptions(
  branches,
  { includeAll = true, allValue = 'all', allLabel = 'Todas las sucursales', activeOnly = true } = {}
) {
  const list = activeOnly ? branches.filter((b) => b.active !== false) : branches
  const opts = list.map((b) => ({ value: b.id, label: b.name }))
  if (includeAll) return [{ value: allValue, label: allLabel }, ...opts]
  return opts
}

export function branchName(branches, branchId) {
  if (!branchId) return '—'
  return branches.find((b) => b.id === branchId)?.name || '—'
}

export function branchIdsLabel(branches, branchIds, { allLabel = 'Todas las sucursales' } = {}) {
  if (isAllBranchSelection(branchIds)) return allLabel
  if (branchIds.length === 1) return branchName(branches, branchIds[0])
  const names = branchIds
    .map((branchId) => branchName(branches, branchId))
    .filter((name) => name !== '—')
  if (!names.length) return allLabel
  if (names.length <= 2) return names.join(', ')
  return `${names.length} sucursales`
}
