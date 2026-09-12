/** Active workspace branch (single sede) — not multi-select report/dashboard filters. */

export function getAllowedBranches(branches = [], userBranchIds = []) {
  const active = (branches || []).filter((branch) => branch.active !== false)
  if (!Array.isArray(userBranchIds) || userBranchIds.length === 0) return active
  const allowed = new Set(userBranchIds)
  const scoped = active.filter((branch) => allowed.has(branch.id))
  return scoped.length ? scoped : active
}

export function resolveActiveBranchId({
  branches = [],
  userBranchIds = [],
  currentId = null,
  fallbackId = null,
} = {}) {
  const allowed = getAllowedBranches(branches, userBranchIds)
  if (!allowed.length) return null

  const candidates = [currentId, fallbackId].filter(Boolean)
  for (const candidate of candidates) {
    if (allowed.some((branch) => branch.id === candidate)) return candidate
  }
  return allowed[0].id
}
