function formatLastAccess(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('es-DO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return null
  }
}

export function normalizeRoleAssignments(assignments = []) {
  return assignments.map((assignment) => ({
    id: assignment.id || null,
    roleId: assignment.roleId || assignment.role?.id || '',
    roleCode: assignment.roleCode || assignment.role?.code || '',
    roleName: assignment.roleName || assignment.role?.name || '',
    scopeType: assignment.scopeType || 'branch',
    legalEntityId: assignment.legalEntityId || '',
    branchId: assignment.branchId || '',
  }))
}

export function roleAssignmentsToPayload(assignments = []) {
  return assignments.map((assignment) => {
    const payload = {
      roleId: assignment.roleId,
      scopeType: assignment.scopeType,
    }
    if (assignment.scopeType === 'legalEntity') payload.legalEntityId = assignment.legalEntityId
    if (assignment.scopeType === 'branch') payload.branchId = assignment.branchId
    return payload
  })
}

export function validateRoleAssignments(assignments = [], roles = []) {
  if (assignments.length === 0) return 'Agrega al menos una asignación de rol.'
  const seen = new Set()

  for (const [index, assignment] of assignments.entries()) {
    const row = index + 1
    if (!assignment.roleId) return `Selecciona un rol en la asignación ${row}.`
    if (!['workspace', 'legalEntity', 'branch'].includes(assignment.scopeType)) {
      return `Selecciona un alcance válido en la asignación ${row}.`
    }
    const roleCode = assignment.roleCode
      || roles.find((role) => role.id === assignment.roleId)?.code
    if (roleCode === 'workspace_admin' && assignment.scopeType !== 'workspace') {
      return `El rol Administrador requiere alcance sobre todo el workspace en la asignación ${row}.`
    }
    if (assignment.scopeType === 'legalEntity' && !assignment.legalEntityId) {
      return `Selecciona una entidad legal en la asignación ${row}.`
    }
    if (assignment.scopeType === 'branch' && !assignment.branchId) {
      return `Selecciona una sucursal en la asignación ${row}.`
    }

    const targetId = assignment.scopeType === 'workspace'
      ? 'workspace'
      : assignment.scopeType === 'legalEntity'
        ? assignment.legalEntityId
        : assignment.branchId
    const key = `${assignment.roleId}:${assignment.scopeType}:${targetId}`
    if (seen.has(key)) return `La asignación ${row} está repetida.`
    seen.add(key)
  }
  return null
}

export function describeRoleAssignment(assignment, options = {}) {
  const role = assignment.roleName
    || options.roles?.find((item) => item.id === assignment.roleId)?.name
    || 'Rol sin nombre'
  if (assignment.scopeType === 'workspace') return `${role} · Workspace completo`
  if (assignment.scopeType === 'legalEntity') {
    const entity = options.legalEntities?.find((item) => item.id === assignment.legalEntityId)
    return `${role} · Entidad legal: ${entity?.name || assignment.legalEntityId || 'Sin seleccionar'}`
  }
  const branch = options.branches?.find((item) => item.id === assignment.branchId)
  return `${role} · Sucursal: ${branch?.name || assignment.branchId || 'Sin seleccionar'}`
}

export function mapUserFromApi(item, formOptions = {}) {
  const roleAssignments = normalizeRoleAssignments(item.roleAssignments)
  const primaryRole = roleAssignments[0]
  return {
    id: item.id,
    userId: item.userId,
    name: item.displayName,
    email: item.email,
    role: primaryRole?.roleName || item.role?.name || '—',
    roleId: primaryRole?.roleId || item.role?.id,
    roleAssignments,
    roleAssignmentLabels: roleAssignments.length
      ? roleAssignments.map((assignment) => describeRoleAssignment(assignment, formOptions))
      : [item.role?.name || 'Sin asignaciones'],
    active: item.status === 'active',
    branchIds: (item.branches || []).map((b) => b.id),
    branchLabels: (item.branches || []).map((b) => b.name),
    lastAccess: formatLastAccess(item.lastAccessAt),
    initials: item.initials,
    version: item.version,
    api: true,
  }
}

export function mapUserSummary(summary) {
  return {
    total: summary.totalUsers,
    activos: summary.activeUsers,
    admins: summary.administrators,
    inactivos: summary.inactiveUsers,
  }
}

export function mapSessionUser(me) {
  const primaryRole = me.primaryRole || me.roleAssignments?.[0]?.role
  return {
    id: me.membershipId || me.userId,
    userId: me.userId,
    membershipId: me.membershipId,
    workspaceId: me.workspaceId,
    name: me.displayName,
    email: me.email,
    role: primaryRole?.name || 'Miembro',
    roleAssignments: me.roleAssignments || [],
    branchIds: (me.visibleBranches || []).map((branch) => branch.id),
    visibleBranches: me.visibleBranches || [],
    workspace: me.workspace,
    effectiveScope: me.effectiveScope,
    effectivePermissionCodes: me.effectivePermissionCodes || [],
    workspacePermissionCodes: me.workspacePermissionCodes || [],
    enabledModules: me.enabledModules || [],
    initials: me.displayName
      ?.split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
  }
}

export function mapApiMatrixToLocalOverlay(matrix) {
  const overlay = {}
  for (const mod of matrix.modules || []) {
    for (const perm of mod.permissions || []) {
      const actionKey = `${mod.code}:${perm.action}`
      overlay[actionKey] = {}
      for (const role of matrix.roles || []) {
        overlay[actionKey][role.name] = perm.grantedRoleIds.includes(role.id)
      }
    }
  }
  return overlay
}
