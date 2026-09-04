import { describe, expect, it } from 'vitest'
import {
  isWorkspaceAdmin,
  mapSessionUser,
  mapUserFromApi,
  roleAssignmentsToPayload,
  validateRoleAssignments,
} from '@/services/adapters/iam'

const options = {
  roles: [
    { id: 'role-admin', code: 'workspace_admin', name: 'Administrador' },
    { id: 'role-seller', code: 'seller', name: 'Vendedor' },
  ],
  legalEntities: [{ id: 'entity-main', code: 'MAIN', name: 'Comercial Principal' }],
  branches: [
    { id: 'branch-main', legalEntityId: 'entity-main', code: 'HQ', name: 'Principal' },
    { id: 'branch-north', legalEntityId: 'entity-main', code: 'NORTH', name: 'Norte' },
  ],
}

describe('IAM user adapters', () => {
  it('detecta workspace_admin tanto en sesiones como en usuarios de la lista', () => {
    expect(isWorkspaceAdmin({
      roleAssignments: [{ role: { code: 'workspace_admin' }, scope: { type: 'workspace' } }],
    })).toBe(true)
    expect(isWorkspaceAdmin({
      roleAssignments: [{ roleCode: 'workspace_admin', scopeType: 'workspace' }],
    })).toBe(true)
    expect(isWorkspaceAdmin({
      roleAssignments: [{ roleCode: 'workspace_admin', scopeType: 'branch' }],
    })).toBe(false)
  })

  it('conserva separadas las capacidades workspace del union efectivo', () => {
    const user = mapSessionUser({
      userId: 'user-1',
      membershipId: 'membership-1',
      workspaceId: 'workspace-1',
      displayName: 'Ada Admin',
      email: 'ada@example.com',
      roleAssignments: [],
      visibleBranches: [],
      effectiveScope: { workspaceWide: false, legalEntityIds: [], branchIds: ['branch-main'] },
      effectivePermissionCodes: ['catalog.read', 'catalog.manage'],
      workspacePermissionCodes: ['catalog.read'],
      enabledModules: ['catalog'],
    })

    expect(user.effectivePermissionCodes).toEqual(['catalog.read', 'catalog.manage'])
    expect(user.workspacePermissionCodes).toEqual(['catalog.read'])
  })

  it('serializa únicamente el target correspondiente a cada scope', () => {
    expect(roleAssignmentsToPayload([
      {
        roleId: 'role-admin',
        scopeType: 'workspace',
        legalEntityId: 'stale-entity',
        branchId: 'stale-branch',
        clientId: 'ui-only',
      },
      {
        roleId: 'role-seller',
        scopeType: 'legalEntity',
        legalEntityId: 'entity-main',
        branchId: 'stale-branch',
      },
      {
        roleId: 'role-seller',
        scopeType: 'branch',
        legalEntityId: 'stale-entity',
        branchId: 'branch-north',
      },
    ])).toEqual([
      { roleId: 'role-admin', scopeType: 'workspace' },
      { roleId: 'role-seller', scopeType: 'legalEntity', legalEntityId: 'entity-main' },
      { roleId: 'role-seller', scopeType: 'branch', branchId: 'branch-north' },
    ])
  })

  it('distingue administrador global de un rol por sucursal y conserva branches derivadas', () => {
    const user = mapUserFromApi({
      id: 'membership-1',
      userId: 'user-1',
      displayName: 'Ada Admin',
      email: 'ada@example.com',
      initials: 'AA',
      role: options.roles[0],
      roleAssignments: [
        {
          id: 'assignment-workspace',
          roleId: 'role-admin',
          roleCode: 'workspace_admin',
          roleName: 'Administrador',
          scopeType: 'workspace',
        },
        {
          id: 'assignment-branch',
          roleId: 'role-seller',
          roleCode: 'seller',
          roleName: 'Vendedor',
          scopeType: 'branch',
          branchId: 'branch-north',
        },
      ],
      branches: options.branches,
      lastAccessAt: null,
      status: 'active',
      version: 4,
    }, options)

    expect(user.roleAssignmentLabels).toEqual([
      'Administrador · Workspace completo',
      'Vendedor · Sucursal: Norte',
    ])
    expect(user.branchIds).toEqual(['branch-main', 'branch-north'])
    expect(user.branchLabels).toEqual(['Principal', 'Norte'])
  })

  it('rechaza filas incompletas y asignaciones duplicadas antes del request', () => {
    expect(validateRoleAssignments([])).toContain('al menos una')
    expect(validateRoleAssignments([{ roleId: 'role-admin', scopeType: 'branch', branchId: '' }]))
      .toContain('sucursal')
    expect(validateRoleAssignments([
      { roleId: 'role-admin', scopeType: 'workspace' },
      { roleId: 'role-admin', scopeType: 'workspace' },
    ])).toContain('repetida')
    expect(validateRoleAssignments([
      { roleId: 'role-admin', scopeType: 'branch', branchId: 'branch-main' },
    ], options.roles)).toContain('todo el workspace')
  })
})
