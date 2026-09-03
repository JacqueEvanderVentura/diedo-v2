import { expect, test } from '@playwright/test'

const ready = {
  status: 'ready',
  database: 'ok',
  schemaStatus: 'compatible',
  schemaRevision: '20260903_0017',
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
    'appointment.read',
    'appointment.manage',
    'appointment.delete',
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
    'appointment.read',
    'appointment.manage',
    'appointment.delete',
  ],
  enabledModules: ['foundation', 'iam', 'catalog', 'crm', 'hr', 'appointments'],
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

const catalogUnit = {
  id: '01900000-0000-7000-8000-000000000013',
  code: 'unit',
  name: 'Unidad',
  symbol: 'ud',
}

const appointmentService = {
  id: '01900000-0000-7000-8000-000000000014',
  itemType: 'service',
  name: 'Consulta terapéutica',
  description: null,
  sku: 'SVC-01',
  category: { id: categoryId, name: 'Servicios' },
  unitOfMeasure: catalogUnit,
  branches: [me.visibleBranches[0]],
  status: 'active',
  version: 1,
  createdAt: '2026-08-29T12:00:00Z',
  updatedAt: '2026-08-29T12:00:00Z',
}

const managedAppointment = {
  id: '01900000-0000-7000-8000-000000000030',
  branchId: me.visibleBranches[0].id,
  resource: {
    id: '01900000-0000-7000-8000-000000000020',
    branchId: me.visibleBranches[0].id,
    code: 'CAB-1',
    name: 'Cabina 1',
    resourceType: 'room',
    status: 'active',
    version: 1,
  },
  customer: null,
  employee: null,
  service: { id: appointmentService.id, name: appointmentService.name },
  date: '2026-09-10',
  time: '14:00',
  duration: 60,
  customerName: 'Cliente Agenda E2E',
  customerPhone: '8095550101',
  serviceName: appointmentService.name,
  price: 1500,
  status: 'pending',
  notes: null,
  pendingPayment: false,
  pendingAmount: 0,
  firstTime: false,
  freeTrial: false,
  reminderSent: true,
  source: 'staff',
  recurrence: 'none',
  repeatCount: 1,
  createdBy: 'Alex API',
  updatedBy: 'Alex API',
  createdAt: '2026-09-03T12:00:00Z',
  updatedAt: '2026-09-03T12:00:00Z',
  version: 1,
  history: [],
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
  appointmentCreateStatus = 201,
  catalogItems = [appointmentService],
  resourcesByBranch,
  appointmentItems = [],
} = {}) {
  let appointmentState = appointmentItems.map((appointment) => ({ ...appointment }))
  await page.route('**/api-backend/**', async (route) => {
    const request = route.request()
    const requestUrl = new URL(request.url())
    const pathname = requestUrl.pathname
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
    if (pathname.endsWith('/api/v1/catalog/products') && request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        json: {
          items: catalogItems,
          page: 1,
          pageSize: 100,
          totalItems: catalogItems.length,
          totalPages: catalogItems.length ? 1 : 0,
        },
      })
    }
    if (pathname.endsWith('/api/v1/catalog/units-of-measure')) {
      return route.fulfill({ status: 200, json: [catalogUnit] })
    }
    if (pathname.endsWith('/api/v1/lookups/branches')) {
      return route.fulfill({
        status: 200,
        json: currentUser.visibleBranches.map((branch) => ({ id: branch.id, name: branch.name })),
      })
    }
    if (pathname.endsWith('/api/v1/appointment-resources') && request.method() === 'GET') {
      const branchId = requestUrl.searchParams.get('branchId')
      const configuredResources = resourcesByBranch?.[branchId]
      return route.fulfill({
        status: 200,
        json: {
          items: configuredResources ?? [{
            id: '01900000-0000-7000-8000-000000000020',
            branchId,
            code: 'CAB-1',
            name: 'Cabina 1',
            resourceType: 'room',
            status: 'active',
            version: 1,
          }],
        },
      })
    }
    if (pathname.endsWith('/api/v1/appointments') && request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        json: {
          items: appointmentState,
          page: 1,
          pageSize: 200,
          totalItems: appointmentState.length,
          totalPages: appointmentState.length ? 1 : 0,
        },
      })
    }
    if (pathname.endsWith('/api/v1/appointments') && request.method() === 'POST') {
      if (metrics) {
        metrics.appointmentIdempotencyKeys = [
          ...(metrics.appointmentIdempotencyKeys || []),
          request.headers()['idempotency-key'],
        ]
        metrics.appointmentBodies = [
          ...(metrics.appointmentBodies || []),
          request.postDataJSON(),
        ]
      }
      return route.fulfill({
        status: appointmentCreateStatus,
        json: appointmentCreateStatus === 201
          ? { items: [] }
          : { message: 'Ese horario ya está ocupado por otra cita.', parameter: 'time' },
      })
    }
    const appointmentMatch = pathname.match(/\/api\/v1\/appointments\/([^/]+)$/)
    if (appointmentMatch && request.method() === 'PATCH') {
      const payload = request.postDataJSON()
      const current = appointmentState.find((appointment) => appointment.id === appointmentMatch[1])
      if (!current) return route.fulfill({ status: 404, json: { message: 'La cita no existe.' } })
      const updated = {
        ...current,
        status: payload.status ?? current.status,
        version: current.version + 1,
        updatedAt: '2026-09-03T12:05:00Z',
      }
      appointmentState = appointmentState.map((appointment) => (
        appointment.id === updated.id ? updated : appointment
      ))
      if (metrics) {
        metrics.appointmentPatches = [
          ...(metrics.appointmentPatches || []),
          { id: appointmentMatch[1], body: payload },
        ]
      }
      return route.fulfill({ status: 200, json: updated })
    }
    if (appointmentMatch && request.method() === 'DELETE') {
      if (metrics) {
        metrics.appointmentDeletes = [
          ...(metrics.appointmentDeletes || []),
          { id: appointmentMatch[1], version: requestUrl.searchParams.get('version') },
        ]
      }
      appointmentState = appointmentState.filter(
        (appointment) => appointment.id !== appointmentMatch[1]
      )
      return route.fulfill({ status: 204, body: '' })
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

test('Agenda conserva el modal abierto y muestra el conflicto transaccional de horario', async ({ page }) => {
  const metrics = { me: 0, matrix: 0 }
  await page.setViewportSize({ width: 1280, height: 1200 })
  await mockOnline(page, { appointmentCreateStatus: 409, metrics })
  await page.goto('/agenda/gestion')
  await page.getByTestId('gestion-new').click()

  await expect(page.getByTestId('appointment-form-modal')).toBeVisible()
  await expect(page.getByTestId('appointment-field-cabina')).toContainText('Cabina 1')
  await page.getByTestId('appointment-field-service').click()
  await page.getByRole('option', { name: /Consulta terapéutica/ }).click()
  await page.getByTestId('appointment-field-date').fill('2026-09-03')
  await page.getByTestId('appointment-field-time').fill('14:00')
  await page.getByTestId('appointment-form-save').click()

  await expect(page.getByTestId('appointment-form-error')).toHaveText('Ese horario ya está ocupado por otra cita.')
  await expect(page.getByTestId('appointment-form-modal')).toBeVisible()
  expect(metrics.appointmentIdempotencyKeys).toHaveLength(1)
  expect(metrics.appointmentIdempotencyKeys[0]).toMatch(/^.{8,128}$/)
  expect(metrics.appointmentBodies[0].serviceId).toBe(appointmentService.id)
})

test('Agenda filtra servicios por sucursal y bloquea sucursales sin cabinas', async ({ page }) => {
  const centerBranch = {
    id: '01900000-0000-7000-8000-000000000105',
    legalEntityId: me.visibleBranches[0].legalEntityId,
    code: 'CENTER',
    name: 'Centro',
  }
  const scopedUser = {
    ...me,
    visibleBranches: [me.visibleBranches[0], centerBranch],
  }
  const mainService = appointmentService
  const centerService = {
    ...appointmentService,
    id: '01900000-0000-7000-8000-000000000114',
    name: 'Servicio exclusivo Centro',
    sku: 'SVC-CENTER',
    branches: [centerBranch],
  }
  await page.setViewportSize({ width: 1280, height: 1200 })
  await mockOnline(page, {
    currentUser: scopedUser,
    catalogItems: [mainService, centerService],
    resourcesByBranch: {
      [me.visibleBranches[0].id]: [],
      [centerBranch.id]: [{
        id: '01900000-0000-7000-8000-000000000120',
        branchId: centerBranch.id,
        code: 'CENTER-1',
        name: 'Cabina Centro',
        resourceType: 'room',
        status: 'active',
        version: 1,
      }],
    },
  })
  await page.goto('/agenda/gestion')
  await page.getByTestId('gestion-new').click()

  await expect(page.getByTestId('appointment-no-resources')).toBeVisible()
  await page.getByTestId('appointment-field-service').click()
  await expect(page.getByRole('option', { name: /Consulta terapéutica/ })).toBeVisible()
  await expect(page.getByRole('option', { name: /Servicio exclusivo Centro/ })).toHaveCount(0)
  await page.getByRole('option', { name: /Consulta terapéutica/ }).click()

  await page.getByTestId('appointment-field-branch').click()
  await page.getByRole('option', { name: 'Centro' }).click()
  await expect(page.getByTestId('appointment-field-cabina')).toContainText('Cabina Centro')
  await page.getByTestId('appointment-field-service').click()
  await expect(page.getByRole('option', { name: /Servicio exclusivo Centro/ })).toBeVisible()
  await expect(page.getByRole('option', { name: /Consulta terapéutica/ })).toHaveCount(0)
})

test('Gestión de citas edita el estado en línea y confirma la eliminación lógica', async ({ page }) => {
  const metrics = { appointmentPatches: [], appointmentDeletes: [] }
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockOnline(page, { metrics, appointmentItems: [managedAppointment] })
  await page.goto('/agenda/gestion')

  const appointmentRow = page.getByTestId(`gestion-row-${managedAppointment.id}`)
  await expect(appointmentRow).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Precio' })).toHaveCount(0)

  await appointmentRow.getByTestId(`gestion-status-${managedAppointment.id}`).click()
  await page.getByRole('option', { name: 'Completada' }).click()
  await expect.poll(() => metrics.appointmentPatches).toHaveLength(1)
  expect(metrics.appointmentPatches[0]).toEqual({
    id: managedAppointment.id,
    body: { status: 'completed', version: 1 },
  })
  await expect(appointmentRow.getByTestId(`gestion-status-${managedAppointment.id}`)).toContainText('Completada')

  await appointmentRow.getByTestId(`gestion-delete-${managedAppointment.id}`).click()
  await expect(page.getByTestId('delete-appointment-modal')).toBeVisible()
  expect(metrics.appointmentDeletes).toHaveLength(0)
  await page.getByTestId('delete-appointment-cancel').click()
  await expect(page.getByTestId('delete-appointment-modal')).toHaveCount(0)
  expect(metrics.appointmentDeletes).toHaveLength(0)

  await appointmentRow.getByTestId(`gestion-delete-${managedAppointment.id}`).click()
  await page.getByTestId('delete-appointment-confirm').click()
  await expect.poll(() => metrics.appointmentDeletes).toHaveLength(1)
  expect(metrics.appointmentDeletes[0]).toEqual({
    id: managedAppointment.id,
    version: '2',
  })
  await expect(page.getByTestId(`gestion-row-${managedAppointment.id}`)).toHaveCount(0)
})

test('Gestión de citas oculta eliminar sin el permiso dedicado', async ({ page }) => {
  const scheduler = {
    ...me,
    effectivePermissionCodes: me.effectivePermissionCodes.filter(
      (permission) => permission !== 'appointment.delete'
    ),
    workspacePermissionCodes: me.workspacePermissionCodes.filter(
      (permission) => permission !== 'appointment.delete'
    ),
  }
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockOnline(page, { currentUser: scheduler, appointmentItems: [managedAppointment] })
  await page.goto('/agenda/gestion')

  const appointmentRow = page.getByTestId(`gestion-row-${managedAppointment.id}`)
  await expect(appointmentRow.getByTestId(`gestion-status-${managedAppointment.id}`)).toBeVisible()
  await expect(appointmentRow.getByTestId(`gestion-delete-${managedAppointment.id}`)).toHaveCount(0)
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
