import { expect, test } from '@playwright/test'

const ready = {
  status: 'ready',
  database: 'ok',
  schemaStatus: 'compatible',
  schemaRevision: '20260829_0006',
}

const me = {
  userId: '01900000-0000-7000-8000-000000000001',
  membershipId: '01900000-0000-7000-8000-000000000002',
  workspaceId: '01900000-0000-7000-8000-000000000003',
  displayName: 'Alex API',
  email: 'alex.api@example.com',
  workspace: {
    id: '01900000-0000-7000-8000-000000000003',
    slug: 'e2e',
    name: 'Workspace E2E',
    defaultCurrency: 'DOP',
    timezone: 'America/Santo_Domingo',
    locale: 'es-DO',
    version: 1,
  },
  roleAssignments: [
    {
      id: '01900000-0000-7000-8000-000000000010',
      role: {
        id: '01900000-0000-7000-8000-000000000004',
        code: 'workspace_admin',
        name: 'Administrador',
      },
      scope: { type: 'workspace', legalEntityId: null, branchId: null },
    },
  ],
  primaryRole: {
    id: '01900000-0000-7000-8000-000000000004',
    code: 'workspace_admin',
    name: 'Administrador',
  },
  visibleBranches: [
    {
      id: '01900000-0000-7000-8000-000000000005',
      legalEntityId: '01900000-0000-7000-8000-000000000006',
      code: 'HQ',
      name: 'Principal',
    },
  ],
  effectiveScope: { workspaceWide: true, legalEntityIds: [], branchIds: [] },
  effectivePermissionCodes: [
    'workspace.read',
    'workspace.update',
    'branch.read',
    'branch.manage',
    'membership.read',
    'membership.manage',
    'role.read',
    'role.manage',
    'catalog.read',
    'catalog.manage',
    'customer.read',
    'customer.manage',
    'employee.read',
    'employee.manage',
    'employee.schedule.manage',
  ],
  workspacePermissionCodes: [
    'workspace.read',
    'workspace.update',
    'branch.read',
    'branch.manage',
    'membership.read',
    'membership.manage',
    'role.read',
    'role.manage',
    'catalog.read',
    'catalog.manage',
    'customer.read',
    'customer.manage',
    'employee.read',
    'employee.manage',
    'employee.schedule.manage',
  ],
  enabledModules: ['foundation', 'iam', 'catalog', 'crm', 'hr'],
}

const adminRoleId = '01900000-0000-7000-8000-000000000004'
const viewerRoleId = '01900000-0000-7000-8000-000000000007'
const roleReadPermissionId = '01900000-0000-7000-8000-000000000008'
const roleManagePermissionId = '01900000-0000-7000-8000-000000000009'
const categoryId = '01900000-0000-7000-8000-000000000011'

const category = {
  id: categoryId,
  name: 'Servicios',
  description: 'Servicios generales',
  status: 'active',
  version: 1,
  createdAt: '2026-08-29T12:00:00Z',
  updatedAt: '2026-08-29T12:00:00Z',
}

const permissionMatrix = {
  roles: [
    { id: adminRoleId, code: 'workspace_admin', name: 'Administrador', version: 3, isSystem: true, permissionCount: 2 },
    { id: viewerRoleId, code: 'viewer', name: 'Consulta', version: 2, isSystem: false, permissionCount: 1 },
  ],
  modules: [
    {
      code: 'iam',
      name: 'Identidad y acceso',
      permissions: [
        {
          id: roleReadPermissionId,
          code: 'role.read',
          action: 'read',
          name: 'Consultar roles',
          description: 'Permite consultar roles y permisos.',
          grantedRoleIds: [adminRoleId, viewerRoleId],
        },
        {
          id: roleManagePermissionId,
          code: 'role.manage',
          action: 'manage',
          name: 'Gestionar roles',
          description: 'Permite cambiar permisos de los roles.',
          grantedRoleIds: [adminRoleId],
        },
      ],
    },
  ],
  totalPermissions: 2,
}

async function mockOnline(page, {
  refreshStatus = 200,
  currentUser = me,
  metrics,
  batchStatus = 200,
} = {}) {
  await page.route('**/api-backend/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (pathname.endsWith('/health/ready')) return route.fulfill({ status: 200, json: ready })
    if (pathname.endsWith('/api/v1/auth/refresh')) {
      return route.fulfill({
        status: refreshStatus,
        json: refreshStatus === 200 ? { accessToken: 'e2e-access', tokenType: 'bearer', expiresIn: 900, refreshExpiresIn: 3600 } : { message: 'Sesión expirada' },
      })
    }
    if (pathname.endsWith('/api/v1/auth/me')) {
      if (metrics) metrics.me += 1
      return route.fulfill({ status: 200, json: currentUser })
    }
    if (pathname.endsWith('/api/v1/permissions/matrix')) {
      if (metrics) metrics.matrix += 1
      return route.fulfill({ status: 200, json: permissionMatrix })
    }
    if (pathname.endsWith('/api/v1/catalog/categories') && request.method() === 'GET') {
      if (metrics) metrics.categoryReads = (metrics.categoryReads || 0) + 1
      return route.fulfill({
        status: 200,
        json: { items: [category], page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      })
    }
    if (pathname.endsWith('/api/v1/catalog/categories') && request.method() === 'POST') {
      if (metrics) metrics.categoryCreates = [...(metrics.categoryCreates || []), request.postDataJSON()]
      return route.fulfill({
        status: 201,
        json: { ...category, id: '01900000-0000-7000-8000-000000000012', ...request.postDataJSON() },
      })
    }
    if (request.method() === 'PUT' && pathname.endsWith('/api/v1/roles/permissions:batch')) {
      if (metrics) {
        metrics.batch += 1
        metrics.batchPayloads.push(request.postDataJSON())
      }
      return route.fulfill({
        status: batchStatus,
        json: batchStatus === 200
          ? { roles: permissionMatrix.roles }
          : { message: 'La matriz cambió; vuelve a intentarlo.', parameter: 'version' },
      })
    }
    if (request.method() === 'PUT' && /\/api\/v1\/roles\/[^/]+\/permissions$/.test(pathname)) {
      if (metrics) metrics.single += 1
      return route.fulfill({ status: 500, json: { message: 'El frontend no debe usar el endpoint individual.' } })
    }
    if (['/api/v1/customers', '/api/v1/employees'].includes(pathname)) {
      return route.fulfill({
        status: 200,
        json: { items: [], page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
      })
    }
    return route.fulfill({ status: 404, json: { message: 'Mock no configurado' } })
  })
}

test('modo online recupera cookie, identidad y dashboard', async ({ page }) => {
  await mockOnline(page)
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: /Alex API/ })).toBeVisible()
})

test('modo online muestra módulos habilitados y conserva los aún no migrados', async ({ page }) => {
  await mockOnline(page)
  await page.goto('/dashboard')

  for (const testId of [
    'nav-group-pos',
    'nav-group-agenda',
    'nav-group-crm',
    'nav-group-rrhh',
    'nav-compras',
    'nav-incidencias',
    'nav-group-finanzas',
    'nav-group-reportes',
  ]) {
    await expect(page.getByTestId(testId)).toBeVisible()
  }

  await page.goto('/crm')
  await expect(page).toHaveURL(/\/crm$/)
  await expect(page.getByRole('heading', { name: 'CRM', exact: true, level: 1 })).toBeVisible()
})

test('refresh 401 no inventa usuario y redirige al login', async ({ page }) => {
  await mockOnline(page, { refreshStatus: 401 })
  await page.goto('/dashboard')
  await expect(page.getByTestId('login-page')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('API caída sin flag muestra estado degradado recuperable', async ({ page }) => {
  await page.route('**/api-backend/**', (route) => route.abort('failed'))
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Servicio temporalmente no disponible' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reintentar conexión' })).toBeVisible()
})

test('demo explícito usa el snapshot canónico si la API cae', async ({ page }) => {
  await page.route('**/api-backend/**', (route) => route.abort('failed'))
  await page.goto('http://127.0.0.1:3101/dashboard')
  await expect(page.getByRole('heading', { name: /Alex Demo/ })).toBeVisible()
})

test('permisos online renderiza únicamente la matriz API', async ({ page }) => {
  await mockOnline(page)
  await page.goto('/configuracion/permisos')

  await expect(page.getByTestId('api-perm-module-iam')).toBeVisible()
  await expect(page.getByText('Módulos locales (POS, Agenda, CRM…)')).toHaveCount(0)
  await expect(page.getByTestId('permisos-summary')).toHaveCount(0)
})

test('permisos demo renderiza únicamente la matriz local', async ({ page }) => {
  await page.route('**/api-backend/**', (route) => route.abort('failed'))
  await page.goto('http://127.0.0.1:3101/configuracion/permisos')

  await expect(page.getByText('Módulos locales (POS, Agenda, CRM…)')).toBeVisible()
  await expect(page.getByTestId('permisos-summary')).toBeVisible()
  await expect(page.locator('[data-testid^="api-perm-module-"]')).toHaveCount(0)
})

test('role.read sin role.manage mantiene la matriz API en solo lectura', async ({ page }) => {
  const metrics = { me: 0, matrix: 0, batch: 0, single: 0, batchPayloads: [] }
  const readOnlyUser = {
    ...me,
    effectivePermissionCodes: me.effectivePermissionCodes.filter((code) => code !== 'role.manage'),
    workspacePermissionCodes: me.workspacePermissionCodes.filter((code) => code !== 'role.manage'),
  }
  await mockOnline(page, { currentUser: readOnlyUser, metrics })
  await page.goto('/configuracion/permisos')

  const apiModule = page.getByTestId('api-perm-module-iam')
  await expect(apiModule).toBeVisible()
  await expect(apiModule.locator('button')).toHaveCount(4)
  await expect(apiModule.locator('button:not([disabled])')).toHaveCount(0)
  await expect(page.getByTestId('permisos-save')).toBeDisabled()
  await expect(page.getByTestId('permisos-access-note')).toHaveText(
    'Puedes consultar los permisos, pero no tienes acceso para modificarlos.'
  )
  expect(metrics.batch).toBe(0)
  expect(metrics.single).toBe(0)
})

test('role.manage limitado a sucursal no habilita mutaciones globales de permisos', async ({ page }) => {
  const metrics = { me: 0, matrix: 0, batch: 0, single: 0, batchPayloads: [] }
  const branchManager = {
    ...me,
    roleAssignments: [{
      ...me.roleAssignments[0],
      scope: {
        type: 'branch',
        legalEntityId: null,
        branchId: me.visibleBranches[0].id,
      },
    }],
    effectiveScope: {
      workspaceWide: false,
      legalEntityIds: [],
      branchIds: [me.visibleBranches[0].id],
    },
    workspacePermissionCodes: [],
  }
  await mockOnline(page, { currentUser: branchManager, metrics })
  await page.goto('/configuracion/permisos')

  const apiModule = page.getByTestId('api-perm-module-iam')
  await expect(apiModule).toBeVisible()
  await expect(apiModule.locator('button:not([disabled])')).toHaveCount(0)
  await expect(page.getByTestId('permisos-save')).toBeDisabled()
  await expect(page.getByTestId('permisos-access-note')).toHaveText(
    'Puedes consultar los permisos, pero gestionarlos requiere una asignación sobre todo el workspace.'
  )
  expect(metrics.batch).toBe(0)
})

test('categorías son de solo lectura fuera del workspace aunque catalog.manage sea efectivo', async ({ page }) => {
  const metrics = { categoryReads: 0, categoryCreates: [] }
  const legalEntityManager = {
    ...me,
    roleAssignments: [{
      ...me.roleAssignments[0],
      scope: {
        type: 'legal_entity',
        legalEntityId: me.visibleBranches[0].legalEntityId,
        branchId: null,
      },
    }],
    effectiveScope: {
      workspaceWide: false,
      legalEntityIds: [me.visibleBranches[0].legalEntityId],
      branchIds: [me.visibleBranches[0].id],
    },
    workspacePermissionCodes: [],
  }
  await mockOnline(page, { currentUser: legalEntityManager, metrics })
  await page.goto('/configuracion/categorias')

  await expect(page.getByTestId(`categoria-card-${categoryId}`)).toBeVisible()
  await expect(page.getByTestId('categorias-read-only')).toBeVisible()
  await expect(page.getByTestId('categoria-new-btn')).toHaveCount(0)
  await expect(page.getByTestId(`categoria-edit-${categoryId}`)).toHaveCount(0)
  await expect(page.getByTestId(`categoria-delete-${categoryId}`)).toHaveCount(0)
  await expect.poll(() => metrics.categoryReads).toBe(1)
  expect(metrics.categoryCreates).toEqual([])
})

test('catalog.manage con asignación workspace sí crea categorías', async ({ page }) => {
  const metrics = { categoryReads: 0, categoryCreates: [] }
  await mockOnline(page, { metrics })
  await page.goto('/configuracion/categorias')

  await expect(page.getByTestId(`categoria-card-${categoryId}`)).toBeVisible()
  await page.getByTestId('categoria-new-btn').click()
  await page.getByTestId('categoria-field-name').fill('Prueba')
  await page.getByTestId('categoria-save').click()

  await expect.poll(() => metrics.categoryCreates).toHaveLength(1)
  expect(metrics.categoryCreates[0]).toMatchObject({ name: 'Prueba', status: 'active' })
})

test('guardar permisos online envía dos roles sucios en un solo batch y reconcilia identidad', async ({ page }) => {
  const metrics = { me: 0, matrix: 0, batch: 0, single: 0, batchPayloads: [] }
  await mockOnline(page, { metrics })
  await page.goto('/configuracion/permisos')

  await expect(page.getByTestId('api-perm-module-iam')).toBeVisible()
  await page.getByTestId(`api-perm-${adminRoleId}-${roleReadPermissionId}`).click()
  await page.getByTestId(`api-perm-${viewerRoleId}-${roleManagePermissionId}`).click()
  await expect(page.getByTestId('permisos-save')).toBeEnabled()
  await page.getByTestId('permisos-save').click()

  await expect(page.getByText('Permisos IAM guardados')).toBeVisible()
  await expect.poll(() => metrics.batch).toBe(1)
  expect(metrics.single).toBe(0)
  expect(metrics.batchPayloads).toEqual([{ roles: [
    {
      roleId: adminRoleId,
      permissionIds: [roleManagePermissionId],
      version: 3,
    },
    {
      roleId: viewerRoleId,
      permissionIds: [roleReadPermissionId, roleManagePermissionId],
      version: 2,
    },
  ] }])
  await expect.poll(() => metrics.matrix).toBe(2)
  await expect.poll(() => metrics.me).toBe(2)
})

test('un batch stale no deja estado parcial, recarga la matriz y no muestra éxito', async ({ page }) => {
  const metrics = { me: 0, matrix: 0, batch: 0, single: 0, batchPayloads: [] }
  await mockOnline(page, { metrics, batchStatus: 409 })
  await page.goto('/configuracion/permisos')

  await expect(page.getByTestId('api-perm-module-iam')).toBeVisible()
  await page.getByTestId(`api-perm-${adminRoleId}-${roleReadPermissionId}`).click()
  await page.getByTestId(`api-perm-${viewerRoleId}-${roleManagePermissionId}`).click()
  await page.getByTestId('permisos-save').click()

  await expect(page.getByText('La matriz cambió; vuelve a intentarlo.')).toBeVisible()
  await expect(page.getByText('Permisos IAM guardados')).toHaveCount(0)
  await expect(page.getByText('Permisos locales guardados correctamente')).toHaveCount(0)
  await expect.poll(() => metrics.batch).toBe(1)
  expect(metrics.single).toBe(0)
  expect(metrics.batchPayloads[0].roles).toHaveLength(2)
  await expect.poll(() => metrics.matrix).toBe(2)
  await expect(page.getByTestId('permisos-save')).toBeDisabled()
})

test('/agendar permanece público aun con la API caída', async ({ page }) => {
  await page.route('**/api-backend/**', (route) => route.abort('failed'))
  await page.goto('/agendar')
  await expect(page.getByText('Agenda en línea')).toBeVisible()
  await expect(page.getByTestId('self-doc-lookup')).toBeVisible()
})
