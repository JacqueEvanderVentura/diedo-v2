import { expect, test } from '@playwright/test'

const ids = {
  membership: '01900000-0000-7000-8000-000000000101',
  user: '01900000-0000-7000-8000-000000000102',
  workspace: '01900000-0000-7000-8000-000000000103',
  adminRole: '01900000-0000-7000-8000-000000000104',
  sellerRole: '01900000-0000-7000-8000-000000000105',
  entity: '01900000-0000-7000-8000-000000000106',
  mainBranch: '01900000-0000-7000-8000-000000000107',
  northBranch: '01900000-0000-7000-8000-000000000108',
  workspaceAssignment: '01900000-0000-7000-8000-000000000109',
  branchAssignment: '01900000-0000-7000-8000-000000000110',
}

const ready = {
  status: 'ready',
  database: 'ok',
  schemaStatus: 'compatible',
  schemaRevision: '20260829_0006',
}

const formOptions = {
  roles: [
    { id: ids.adminRole, code: 'workspace_admin', name: 'Administrador' },
    { id: ids.sellerRole, code: 'seller', name: 'Vendedor' },
  ],
  legalEntities: [{ id: ids.entity, code: 'MAIN', name: 'Comercial Principal' }],
  branches: [
    { id: ids.mainBranch, legalEntityId: ids.entity, code: 'HQ', name: 'Principal' },
    { id: ids.northBranch, legalEntityId: ids.entity, code: 'NORTH', name: 'Norte' },
  ],
}

const userItem = {
  id: ids.membership,
  userId: ids.user,
  displayName: 'Ada Admin',
  email: 'ada@example.com',
  initials: 'AA',
  role: formOptions.roles[0],
  branches: formOptions.branches,
  roleAssignments: [
    {
      id: ids.workspaceAssignment,
      roleId: ids.adminRole,
      roleCode: 'workspace_admin',
      roleName: 'Administrador',
      scopeType: 'workspace',
      legalEntityId: null,
      branchId: null,
    },
    {
      id: ids.branchAssignment,
      roleId: ids.sellerRole,
      roleCode: 'seller',
      roleName: 'Vendedor',
      scopeType: 'branch',
      legalEntityId: null,
      branchId: ids.northBranch,
    },
  ],
  lastAccessAt: '2026-08-29T12:00:00Z',
  status: 'active',
  version: 7,
}

function sessionUser({ canManage = true } = {}) {
  return {
    userId: ids.user,
    membershipId: ids.membership,
    workspaceId: ids.workspace,
    displayName: 'Alex API',
    email: 'alex.api@example.com',
    workspace: {
      id: ids.workspace,
      slug: 'e2e',
      name: 'Workspace E2E',
      defaultCurrency: 'DOP',
      timezone: 'America/Santo_Domingo',
      locale: 'es-DO',
      version: 1,
    },
    roleAssignments: [{
      id: ids.workspaceAssignment,
      role: formOptions.roles[0],
      scope: { type: 'workspace', legalEntityId: null, branchId: null },
    }],
    primaryRole: formOptions.roles[0],
    visibleBranches: formOptions.branches,
    effectiveScope: { workspaceWide: true, legalEntityIds: [], branchIds: [] },
    effectivePermissionCodes: [
      'workspace.read',
      'membership.read',
      ...(canManage ? ['membership.manage'] : []),
    ],
    workspacePermissionCodes: [
      'workspace.read',
      'membership.read',
      ...(canManage ? ['membership.manage'] : []),
    ],
    enabledModules: ['foundation', 'iam'],
  }
}

async function mockUsersApi(page, { canManage = true, createStatus = 201 } = {}) {
  const calls = {
    create: [],
    update: [],
    invite: [],
    formOptions: 0,
    list: 0,
    status: [],
    password: [],
  }
  let currentVersion = userItem.version

  await page.route('**/api-backend/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    const method = request.method()

    if (pathname.endsWith('/health/ready')) return route.fulfill({ status: 200, json: ready })
    if (pathname.endsWith('/api/v1/auth/refresh')) {
      return route.fulfill({
        status: 200,
        json: { accessToken: 'e2e-access', tokenType: 'bearer', expiresIn: 900, refreshExpiresIn: 3600 },
      })
    }
    if (pathname.endsWith('/api/v1/auth/me')) {
      return route.fulfill({ status: 200, json: sessionUser({ canManage }) })
    }
    if (pathname.endsWith('/api/v1/users/summary')) {
      return route.fulfill({
        status: 200,
        json: { totalUsers: 1, activeUsers: 1, administrators: 1, inactiveUsers: 0 },
      })
    }
    if (pathname.endsWith('/api/v1/users/form-options')) {
      calls.formOptions += 1
      return route.fulfill({
        status: canManage ? 200 : 403,
        json: canManage ? formOptions : { message: 'No autorizado' },
      })
    }
    if (pathname.endsWith('/api/v1/users/invitations') && method === 'POST') {
      calls.invite.push(request.postDataJSON())
      return route.fulfill({
        status: 201,
        json: {
          id: '01900000-0000-7000-8000-000000000111',
          membershipId: '01900000-0000-7000-8000-000000000112',
          email: request.postDataJSON().email,
          expiresAt: '2026-08-30T12:00:00Z',
          status: 'pending',
          acceptToken: null,
        },
      })
    }
    if (pathname.endsWith('/api/v1/users') && method === 'POST') {
      calls.create.push(request.postDataJSON())
      return route.fulfill({
        status: createStatus,
        json: createStatus === 201 ? userItem : { message: 'El correo ya pertenece a otro usuario.' },
      })
    }
    if (pathname.endsWith('/api/v1/users') && method === 'GET') {
      calls.list += 1
      return route.fulfill({
        status: 200,
        json: {
          items: [{ ...userItem, version: currentVersion }],
          page: 1,
          pageSize: 100,
          totalItems: 1,
          totalPages: 1,
        },
      })
    }
    if (pathname.endsWith(`/api/v1/users/${ids.membership}`) && method === 'PATCH') {
      const payload = request.postDataJSON()
      if (payload.roleAssignments) calls.update.push(payload)
      else calls.status.push(payload)
      currentVersion += 1
      return route.fulfill({ status: 200, json: { ...userItem, version: currentVersion } })
    }
    if (pathname.endsWith(`/api/v1/users/${ids.membership}/password-reset`) && method === 'POST') {
      calls.password.push(request.postDataJSON())
      currentVersion += 1
      return route.fulfill({ status: 204 })
    }
    if (['/api/v1/customers', '/api/v1/employees'].includes(pathname)) {
      return route.fulfill({
        status: 200,
        json: { items: [], page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
      })
    }
    return route.fulfill({ status: 404, json: { message: `Mock no configurado: ${method} ${pathname}` } })
  })

  return calls
}

async function choose(page, testId, label) {
  await page.getByTestId(testId).click()
  await page.getByRole('option').filter({ hasText: label }).getByRole('button').click()
}

test('lista scopes explícitos y precarga todas las asignaciones al editar', async ({ page }) => {
  const calls = await mockUsersApi(page)
  await page.goto('/configuracion/usuarios')

  const summary = page.getByTestId(`usuario-role-scopes-table-${ids.membership}`)
  await expect(summary).toContainText('Administrador · Workspace completo')
  await expect(summary).toContainText('Vendedor · Sucursal: Norte')
  await expect(page.getByTestId(`usuario-row-${ids.membership}`)).toContainText('Principal')
  await expect(page.getByTestId(`usuario-row-${ids.membership}`)).toContainText('Norte')

  await page.getByTestId(`usuario-edit-${ids.membership}`).click()
  await expect(page.getByTestId('usuario-assignment-0')).toBeVisible()
  await expect(page.getByTestId('usuario-assignment-1')).toBeVisible()
  await expect(page.getByTestId('usuario-assignment-scope-0')).toContainText('Workspace completo (global)')
  await expect(page.getByTestId('usuario-assignment-scope-1')).toContainText('Sucursal específica')
  await expect(page.getByTestId('usuario-assignment-target-1')).toContainText('Norte')

  await page.getByTestId('usuario-submit').click()
  await expect.poll(() => calls.update.length).toBe(1)
  expect(calls.update[0]).toEqual({
    roleAssignments: [
      { roleId: ids.adminRole, scopeType: 'workspace' },
      { roleId: ids.sellerRole, scopeType: 'branch', branchId: ids.northBranch },
    ],
    status: 'active',
    version: 7,
  })
})

test('create envía múltiples roleAssignments sin campos legacy', async ({ page }) => {
  const calls = await mockUsersApi(page)
  await page.goto('/configuracion/usuarios')
  await page.getByTestId('usuario-new-btn').click()

  await page.getByTestId('usuario-name').fill('Nueva Persona')
  await page.getByTestId('usuario-email').fill('nueva@example.com')
  await page.getByTestId('usuario-password-input').fill('password-seguro-para-e2e')
  await choose(page, 'usuario-assignment-role-0', 'Vendedor')
  await choose(page, 'usuario-assignment-target-0', 'Principal')
  await page.getByTestId('usuario-assignment-add').click()
  await choose(page, 'usuario-assignment-role-1', 'Administrador')
  await expect(page.getByTestId('usuario-assignment-scope-1')).toContainText('Workspace completo (global)')
  await expect(page.getByTestId('usuario-assignment-scope-1')).toBeDisabled()
  await expect(page.getByTestId('usuario-assignment-workspace-only-1')).toContainText('todo el workspace')
  await page.getByTestId('usuario-submit').click()

  await expect.poll(() => calls.create.length).toBe(1)
  expect(calls.create[0]).toEqual({
    displayName: 'Nueva Persona',
    email: 'nueva@example.com',
    password: 'password-seguro-para-e2e',
    roleAssignments: [
      { roleId: ids.sellerRole, scopeType: 'branch', branchId: ids.mainBranch },
      { roleId: ids.adminRole, scopeType: 'workspace' },
    ],
  })
  expect(calls.create[0]).not.toHaveProperty('roleId')
  expect(calls.create[0]).not.toHaveProperty('branchIds')
})

test('invite envía scope legalEntity con su target', async ({ page }) => {
  const calls = await mockUsersApi(page)
  await page.goto('/configuracion/usuarios')
  await page.getByTestId('usuario-invite-btn').click()

  await page.getByTestId('usuario-name').fill('Persona Invitada')
  await page.getByTestId('usuario-email').fill('invitada@example.com')
  await choose(page, 'usuario-assignment-role-0', 'Vendedor')
  await choose(page, 'usuario-assignment-scope-0', 'Entidad legal específica')
  await choose(page, 'usuario-assignment-target-0', 'Comercial Principal')
  await page.getByTestId('usuario-submit').click()

  await expect.poll(() => calls.invite.length).toBe(1)
  expect(calls.invite[0]).toEqual({
    displayName: 'Persona Invitada',
    email: 'invitada@example.com',
    roleAssignments: [
      { roleId: ids.sellerRole, scopeType: 'legalEntity', legalEntityId: ids.entity },
    ],
  })
})

test('reset de contraseña recarga la versión antes de la siguiente edición', async ({ page }) => {
  const calls = await mockUsersApi(page)
  page.on('dialog', (dialog) => dialog.accept('password-temporal-seguro-2026'))
  await page.goto('/configuracion/usuarios')

  await page.getByTestId(`usuario-password-${ids.membership}`).click()

  await expect.poll(() => calls.password.length).toBe(1)
  await expect.poll(() => calls.list).toBeGreaterThanOrEqual(2)
  await page.getByTestId(`usuario-edit-${ids.membership}`).click()
  await page.getByTestId('usuario-submit').click()
  await expect.poll(() => calls.update.length).toBe(1)
  expect(calls.update[0].version).toBe(userItem.version + 1)
})

test('un error de submit conserva el editor abierto y muestra el error API', async ({ page }) => {
  const calls = await mockUsersApi(page, { createStatus: 409 })
  await page.goto('/configuracion/usuarios')
  await page.getByTestId('usuario-new-btn').click()

  await page.getByTestId('usuario-name').fill('Correo Duplicado')
  await page.getByTestId('usuario-email').fill('duplicado@example.com')
  await page.getByTestId('usuario-password-input').fill('password-seguro-para-e2e')
  await choose(page, 'usuario-assignment-role-0', 'Vendedor')
  await choose(page, 'usuario-assignment-target-0', 'Principal')
  await page.getByTestId('usuario-submit').click()

  await expect.poll(() => calls.create.length).toBe(1)
  await expect(page.getByTestId('usuario-modal')).toBeVisible()
  await expect(page.getByTestId('usuario-form-error')).toHaveText('El correo ya pertenece a otro usuario.')
  await expect(page.getByTestId('usuario-submit')).toBeEnabled()
})

test('membership.read sin membership.manage queda en consulta y no solicita form-options', async ({ page }) => {
  const calls = await mockUsersApi(page, { canManage: false })
  await page.goto('/configuracion/usuarios')

  await expect(page.getByText('Modo consulta')).toBeVisible()
  await expect(page.getByTestId(`usuario-row-${ids.membership}`)).toBeVisible()
  await expect(page.getByTestId('usuario-new-btn')).toHaveCount(0)
  await expect(page.getByTestId('usuario-invite-btn')).toHaveCount(0)
  await expect(page.getByTestId(`usuario-edit-${ids.membership}`)).toHaveCount(0)
  await expect(page.getByTestId(`usuario-password-${ids.membership}`)).toHaveCount(0)
  await expect(page.getByTestId(`usuario-status-${ids.membership}`)).toHaveCount(0)
  expect(calls.formOptions).toBe(0)
  expect(calls.create).toEqual([])
  expect(calls.update).toEqual([])
  expect(calls.invite).toEqual([])
})

test('modo demo conserva el editor legacy', async ({ page }) => {
  await page.route('**/api-backend/**', (route) => route.abort('failed'))
  await page.goto('http://127.0.0.1:3101/configuracion/usuarios')
  await page.getByTestId('usuario-new-btn').click()

  await expect(page.getByText('Sucursales Permitidas')).toBeVisible()
  await expect(page.getByTestId('usuario-role-assignments')).toHaveCount(0)
})
