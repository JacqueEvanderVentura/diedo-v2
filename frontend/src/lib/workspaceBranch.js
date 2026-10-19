/** Active workspace branch (single sede) — not multi-select report/dashboard filters. */

export function getAllowedBranches(branches = [], userBranchIds = []) {
  const active = (branches || []).filter((branch) => branch.active !== false)
  if (!Array.isArray(userBranchIds) || userBranchIds.length === 0) return active
  const allowed = new Set(userBranchIds)
  const scoped = active.filter((branch) => allowed.has(branch.id))
  return scoped.length ? scoped : active
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ''),
  )
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

export function pickDefaultBranchId(branches = []) {
  const list = Array.isArray(branches) ? branches : []
  const active = list.find((b) => b?.active !== false && b?.id)
  return active?.id || list[0]?.id || ''
}

export function pickDefaultBranchIds(branches = []) {
  const id = pickDefaultBranchId(branches)
  return id ? [id] : []
}

export function resolveBranchId(value, branches = []) {
  if (value) return value
  return pickDefaultBranchId(branches)
}

export function resolveBranchIds(values, branches = []) {
  if (Array.isArray(values) && values.length) return values
  return pickDefaultBranchIds(branches)
}
