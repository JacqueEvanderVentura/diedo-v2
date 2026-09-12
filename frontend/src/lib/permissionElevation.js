export const ELEVATION_DURATION_MS = 3 * 60 * 1000

export const DEMO_ELEVATION_PASSWORD = 'demo-supervisor'

const DEMO_GATED_PERMISSIONS = new Set(['sales.invoice.void'])

export function isDemoGatedPermission(code) {
  return DEMO_GATED_PERMISSIONS.has(code)
}

export function resolveDemoApproverPermissions(email, snapshot) {
  const normalized = String(email || '').trim().toLowerCase()
  const user = snapshot?.iam?.users?.find((item) => item.email?.toLowerCase() === normalized)
  if (!user) return null
  const rolePermissions = snapshot?.iam?.rolePermissions?.[user.roleCode] || []
  return rolePermissions
}

export function buildDemoElevation({ approverName, approverPermissions = [], basePermissions = [] }) {
  const expiresAt = new Date(Date.now() + ELEVATION_DURATION_MS).toISOString()
  const effectivePermissionCodes = [...new Set([
    ...basePermissions.filter((code) => code !== '*'),
    ...approverPermissions,
  ])]
  return {
    grantedByName: approverName,
    expiresAt,
    effectivePermissionCodes,
  }
}
