/** Branch filter helpers shared across modules. */

export function isAllBranches(branchId) {
  return branchId == null || branchId === '' || branchId === 'all'
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

export function filterByBranch(items, branchId, getBranchIds = getRowBranchIds) {
  if (isAllBranches(branchId)) return items
  return items.filter((item) => getBranchIds(item).includes(branchId))
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
