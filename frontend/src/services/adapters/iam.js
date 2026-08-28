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

export function mapUserFromApi(item) {
  return {
    id: item.id,
    userId: item.userId,
    name: item.displayName,
    email: item.email,
    role: item.role?.name || '—',
    roleId: item.role?.id,
    active: item.status === 'active',
    branchIds: (item.branches || []).map((b) => b.id),
    branchLabels: (item.branches || []).map((b) => b.name),
    lastAccess: formatLastAccess(item.lastAccessAt),
    initials: item.initials,
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
  return {
    id: me.membershipId || me.userId,
    userId: me.userId,
    membershipId: me.membershipId,
    workspaceId: me.workspaceId,
    name: me.displayName,
    email: me.email,
    role: me.role?.name || 'Miembro',
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
