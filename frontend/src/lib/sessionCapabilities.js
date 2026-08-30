function assignmentScopeType(assignment) {
  return assignment?.scope?.type || assignment?.scopeType || null
}

export function hasWorkspaceScope(user) {
  if (user?.effectiveScope?.workspaceWide !== true) return false
  return Boolean(
    user.roleAssignments?.some((assignment) => assignmentScopeType(assignment) === 'workspace')
  )
}

export function hasWorkspacePermission(user, permissionCode) {
  if (!permissionCode || !hasWorkspaceScope(user)) return false
  return Boolean(user.workspacePermissionCodes?.includes(permissionCode))
}
