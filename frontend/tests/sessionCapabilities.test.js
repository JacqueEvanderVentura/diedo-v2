import { describe, expect, it } from 'vitest'
import { hasWorkspacePermission, hasWorkspaceScope } from '@/lib/sessionCapabilities'

const manageCodes = ['catalog.read', 'catalog.manage', 'role.read', 'role.manage']

function sessionUser(scopeType, { workspaceWide = scopeType === 'workspace' } = {}) {
  return {
    roleAssignments: [{
      id: 'assignment-1',
      role: { id: 'role-1', code: 'manager', name: 'Gestor' },
      scope: { type: scopeType },
    }],
    effectiveScope: { workspaceWide, legalEntityIds: [], branchIds: [] },
    effectivePermissionCodes: manageCodes,
    workspacePermissionCodes: scopeType === 'workspace' ? manageCodes : [],
  }
}

describe('session capabilities', () => {
  it('acepta una capacidad global solo con permiso y asignación workspace real', () => {
    const user = sessionUser('workspace')

    expect(hasWorkspaceScope(user)).toBe(true)
    expect(hasWorkspacePermission(user, 'catalog.manage')).toBe(true)
    expect(hasWorkspacePermission(user, 'role.manage')).toBe(true)
  })

  it.each(['branch', 'legal_entity'])(
    'mantiene las mutaciones globales bloqueadas para alcance %s aunque el código sea efectivo',
    (scopeType) => {
      const user = sessionUser(scopeType, { workspaceWide: false })

      expect(hasWorkspaceScope(user)).toBe(false)
      expect(hasWorkspacePermission(user, 'catalog.manage')).toBe(false)
      expect(hasWorkspacePermission(user, 'role.manage')).toBe(false)
    }
  )

  it('falla cerrado cuando assignment y effectiveScope son inconsistentes', () => {
    const user = sessionUser('workspace', { workspaceWide: false })

    expect(hasWorkspacePermission(user, 'catalog.manage')).toBe(false)
  })

  it('no convierte un alcance workspace en un permiso inexistente', () => {
    const user = sessionUser('workspace')

    expect(hasWorkspacePermission(user, 'membership.manage')).toBe(false)
  })

  it('no lava un permiso branch mediante otra asignación workspace', () => {
    const user = {
      roleAssignments: [
        { role: { code: 'viewer' }, scope: { type: 'workspace' } },
        { role: { code: 'manager' }, scope: { type: 'branch', branchId: 'branch-1' } },
      ],
      effectiveScope: { workspaceWide: true, legalEntityIds: [], branchIds: ['branch-1'] },
      effectivePermissionCodes: manageCodes,
      workspacePermissionCodes: ['catalog.read', 'role.read'],
    }

    expect(hasWorkspacePermission(user, 'catalog.manage')).toBe(false)
    expect(hasWorkspacePermission(user, 'role.manage')).toBe(false)
  })
})
