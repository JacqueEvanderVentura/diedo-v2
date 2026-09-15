export const CORE_MODULES = new Set(['foundation', 'iam'])

export function toggleModuleSelection(selected, code, modules) {
  if (CORE_MODULES.has(code)) return selected
  const next = new Set(selected)
  const dependencies = new Map(modules.map((item) => [item.code, item.dependencyCodes || []]))
  if (next.has(code)) {
    next.delete(code)
    let removed
    do {
      removed = false
      for (const item of next) {
        if ((dependencies.get(item) || []).some((dependency) => !next.has(dependency))) {
          next.delete(item)
          removed = true
        }
      }
    } while (removed)
  } else {
    const add = (item) => {
      if (next.has(item)) return
      next.add(item)
      for (const dependency of dependencies.get(item) || []) add(dependency)
    }
    add(code)
  }
  for (const item of CORE_MODULES) next.add(item)
  return [...next].sort()
}

export function workspacePlanPayload(workspace, planCode, selectedModules) {
  return {
    version: workspace.version,
    ...(planCode && planCode !== workspace.planCode ? { planCode } : {}),
    enabledModules: selectedModules,
  }
}

export function assignmentPayload(assignments) {
  return assignments.map(({ roleId, scopeType, branchId, legalEntityId }) => ({
    roleId,
    scopeType,
    ...(scopeType === 'branch' ? { branchId } : {}),
    ...(scopeType === 'legalEntity' ? { legalEntityId } : {}),
  }))
}

export function positivePage(value, fallback = 1) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
