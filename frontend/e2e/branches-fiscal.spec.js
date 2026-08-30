import { expect, test } from '@playwright/test'

const ids = {
  user: '01900000-0000-7000-8000-000000000201',
  membership: '01900000-0000-7000-8000-000000000202',
  workspace: '01900000-0000-7000-8000-000000000203',
  role: '01900000-0000-7000-8000-000000000204',
  entityShared: '01900000-0000-7000-8000-000000000205',
  entityOther: '01900000-0000-7000-8000-000000000206',
  branchMain: '01900000-0000-7000-8000-000000000207',
  branchNorth: '01900000-0000-7000-8000-000000000208',
  branchOther: '01900000-0000-7000-8000-000000000209',
}

const ready = {
  status: 'ready',
  database: 'ok',
  schemaStatus: 'compatible',
  schemaRevision: '20260829_0007',
}

function branchReference(branch) {
  return { id: branch.id, code: branch.code, name: branch.name }
}

function createState() {
  const branches = [
    {
      id: ids.branchMain,
      legalEntityId: ids.entityShared,
      code: 'MAIN',
      name: 'Principal',
      status: 'active',
      timezone: 'America/Santo_Domingo',
      version: 3,
      details: {
        address: 'Av. Principal 1',
        phone: '809-555-0101',
        email: 'principal@example.com',
        manager: 'Ada',
        schedule: '09:00 - 18:00',
        independentBusiness: false,
        partners: [{ name: 'Ada Socia', share: 60 }],
      },
    },
    {
      id: ids.branchNorth,
      legalEntityId: ids.entityShared,
      code: 'NORTH',
      name: 'Norte',
      status: 'active',
      timezone: 'America/Santo_Domingo',
      version: 2,
      details: {
        address: 'Av. Norte 2',
        phone: '809-555-0102',
        email: null,
        manager: 'Grace',
        schedule: '08:00 - 17:00',
        independentBusiness: false,
        partners: [],
      },
    },
    {
      id: ids.branchOther,
      legalEntityId: ids.entityOther,
      code: 'OTHER',
      name: 'Este',
      status: 'active',
      timezone: 'America/Santo_Domingo',
      version: 5,
      details: {
        address: 'Av. Este 3',
        phone: '',
        email: null,
        manager: '',
        schedule: '09:00 - 18:00',
        independentBusiness: true,
        partners: [],
      },
    },
  ]
  const entities = [
    {
      id: ids.entityShared,
      code: 'SHARED',
      legalName: 'Comercial Compartida SRL',
      displayName: 'Comercial Compartida',
      status: 'active',
      version: 7,
      taxIdentity: {
        id: '01900000-0000-7000-8000-000000000210',
        jurisdictionCode: 'DO',
        identifierType: 'RNC',
        identifierValue: '132908902',
        registeredName: 'Comercial Compartida SRL',
        validFrom: '2026-01-01',
        validTo: null,
      },
    },
    {
      id: ids.entityOther,
      code: 'OTHER',
      legalName: 'Comercial Este SRL',
      displayName: 'Comercial Este',
      status: 'active',
      version: 4,
      taxIdentity: {
        id: '01900000-0000-7000-8000-000000000211',
        jurisdictionCode: 'DO',
        identifierType: 'RNC',
        identifierValue: '132908903',
        registeredName: 'Comercial Este SRL',
        validFrom: '2026-01-01',
        validTo: null,
      },
    },
  ]
  return { branches, entities, nextId: 300 }
}

function legalEntityResponse(state, entity) {
  const attached = state.branches.filter((branch) => branch.legalEntityId === entity.id && branch.status !== 'archived')
  return {
    ...entity,
    branches: attached.map(branchReference),
    sharing: { branchCount: attached.length, shared: attached.length > 1 },
  }
}

function sessionUser({
  canManage = true,
  canReadWorkspace = true,
  canReadLegalEntity = true,
  canManageLegalEntity = canManage && canReadLegalEntity,
} = {}) {
  return {
    userId: ids.user,
    membershipId: ids.membership,
    workspaceId: ids.workspace,
    displayName: 'Alex Fiscal',
    email: 'alex.fiscal@example.com',
    workspace: {
      id: ids.workspace,
      slug: 'fiscal-e2e',
      name: 'Workspace Fiscal',
      defaultCurrency: 'DOP',
      timezone: 'America/Santo_Domingo',
      locale: 'es-DO',
      version: 1,
    },
    roleAssignments: [],
    primaryRole: { id: ids.role, code: 'workspace_admin', name: 'Administrador' },
    visibleBranches: [
      { id: ids.branchMain, legalEntityId: ids.entityShared, code: 'MAIN', name: 'Principal' },
      { id: ids.branchNorth, legalEntityId: ids.entityShared, code: 'NORTH', name: 'Norte' },
      { id: ids.branchOther, legalEntityId: ids.entityOther, code: 'OTHER', name: 'Este' },
    ],
    effectiveScope: { workspaceWide: true, legalEntityIds: [], branchIds: [] },
    effectivePermissionCodes: [
      'branch.read',
      ...(canReadWorkspace ? ['workspace.read'] : []),
      ...(canReadLegalEntity ? ['legal_entity.read'] : []),
      ...(canManage ? ['branch.manage'] : []),
      ...(canManage && canReadWorkspace ? ['workspace.update'] : []),
      ...(canManageLegalEntity ? ['legal_entity.manage'] : []),
    ],
    enabledModules: ['foundation'],
  }
}

async function mockAdministration(page, {
  canManage = true,
  canReadWorkspace = true,
  canReadLegalEntity = true,
  canManageLegalEntity = canManage && canReadLegalEntity,
  fiscalConflict = false,
} = {}) {
  const state = createState()
  const calls = {
    branchGets: 0,
    workspaceGets: 0,
    entityGets: 0,
    patches: [],
    fiscal: [],
    assignments: [],
    creates: [],
  }

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
      return route.fulfill({
        status: 200,
        json: sessionUser({ canManage, canReadWorkspace, canReadLegalEntity, canManageLegalEntity }),
      })
    }
    if (pathname.endsWith('/api/v1/workspace/settings') && method === 'GET') {
      calls.workspaceGets += 1
      if (!canReadWorkspace) return route.fulfill({ status: 403, json: { message: 'No autorizado' } })
      return route.fulfill({
        status: 200,
        json: {
          id: ids.workspace,
          name: 'Workspace Fiscal',
          defaultCurrency: 'DOP',
          timezone: 'America/Santo_Domingo',
          locale: 'es-DO',
          taxDefaultRate: 18,
          version: 1,
        },
      })
    }
    if (pathname.endsWith('/api/v1/branches') && method === 'GET') {
      calls.branchGets += 1
      return route.fulfill({ status: 200, json: structuredClone(state.branches.filter((branch) => branch.status !== 'archived')) })
    }
    if (pathname.endsWith('/api/v1/legal-entities') && method === 'GET') {
      calls.entityGets += 1
      if (!canReadLegalEntity) return route.fulfill({ status: 403, json: { message: 'No autorizado' } })
      return route.fulfill({
        status: 200,
        json: structuredClone(state.entities.map((entity) => legalEntityResponse(state, entity))),
      })
    }
    const branchMatch = pathname.match(/\/api\/v1\/branches\/([^/]+)$/)
    if (branchMatch && method === 'PATCH') {
      const payload = request.postDataJSON()
      calls.patches.push({ id: branchMatch[1], payload })
      const branch = state.branches.find((item) => item.id === branchMatch[1])
      Object.assign(branch, {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.status !== undefined ? { status: payload.status } : {}),
        ...(payload.timezone !== undefined ? { timezone: payload.timezone } : {}),
        details: { ...branch.details, ...(payload.details || {}) },
        version: branch.version + 1,
      })
      return route.fulfill({ status: 200, json: structuredClone(branch) })
    }
    const fiscalMatch = pathname.match(/\/api\/v1\/legal-entities\/([^/]+)\/fiscal-profile$/)
    if (fiscalMatch && method === 'PUT') {
      const payload = request.postDataJSON()
      calls.fiscal.push({ id: fiscalMatch[1], payload })
      if (fiscalConflict) {
        return route.fulfill({
          status: 409,
          json: {
            message: 'El RNC ya está asignado a otra entidad legal del workspace.',
            parameter: 'taxIdentity.identifierValue',
          },
        })
      }
      const entity = state.entities.find((item) => item.id === fiscalMatch[1])
      entity.legalName = payload.legalName
      entity.displayName = payload.displayName
      entity.version += 1
      entity.taxIdentity = payload.taxIdentity
        ? {
            id: entity.taxIdentity?.id || `tax-${state.nextId++}`,
            ...payload.taxIdentity,
            registeredName: payload.legalName,
            validFrom: payload.effectiveFrom || entity.taxIdentity?.validFrom || '2026-08-29',
            validTo: null,
          }
        : null
      const affectedBranchIds = state.branches
        .filter((branch) => branch.legalEntityId === entity.id)
        .map((branch) => branch.id)
      return route.fulfill({
        status: 200,
        json: { ...legalEntityResponse(state, entity), affectedBranchIds },
      })
    }
    const assignmentMatch = pathname.match(/\/api\/v1\/branches\/([^/]+)\/legal-entity-assignment$/)
    if (assignmentMatch && method === 'PUT') {
      const payload = request.postDataJSON()
      calls.assignments.push({ id: assignmentMatch[1], payload })
      const branch = state.branches.find((item) => item.id === assignmentMatch[1])
      const previousLegalEntityId = branch.legalEntityId
      let entity
      if (payload.assignment.type === 'existing') {
        entity = state.entities.find((item) => item.id === payload.assignment.legalEntityId)
      } else {
        const profile = payload.assignment.fiscalProfile
        entity = {
          id: `01900000-0000-7000-8000-${String(state.nextId++).padStart(12, '0')}`,
          code: `NEW-${state.nextId}`,
          legalName: profile.legalName,
          displayName: profile.displayName,
          status: 'active',
          version: 1,
          taxIdentity: {
            id: `tax-${state.nextId++}`,
            ...profile.taxIdentity,
            registeredName: profile.legalName,
            validFrom: profile.effectiveFrom || '2026-08-29',
            validTo: null,
          },
        }
        state.entities.push(entity)
      }
      branch.legalEntityId = entity.id
      branch.details.independentBusiness = payload.assignment.type === 'new'
      branch.version += 1
      return route.fulfill({
        status: 200,
        json: {
          branch: structuredClone(branch),
          legalEntity: legalEntityResponse(state, entity),
          previousLegalEntityId,
        },
      })
    }
    if (pathname.endsWith('/api/v1/branches') && method === 'POST') {
      const payload = request.postDataJSON()
      calls.creates.push(payload)
      let entity
      if (payload.legalEntityAssignment.type === 'existing') {
        entity = state.entities.find((item) => item.id === payload.legalEntityAssignment.legalEntityId)
      } else {
        const profile = payload.legalEntityAssignment.fiscalProfile
        entity = {
          id: `01900000-0000-7000-8000-${String(state.nextId++).padStart(12, '0')}`,
          code: `CREATE-${state.nextId}`,
          legalName: profile.legalName,
          displayName: profile.displayName,
          status: 'active',
          version: 1,
          taxIdentity: {
            id: `tax-${state.nextId++}`,
            ...profile.taxIdentity,
            registeredName: profile.legalName,
            validFrom: profile.effectiveFrom || '2026-08-29',
            validTo: null,
          },
        }
        state.entities.push(entity)
      }
      const branch = {
        id: `01900000-0000-7000-8000-${String(state.nextId++).padStart(12, '0')}`,
        legalEntityId: entity.id,
        code: payload.code,
        name: payload.name,
        status: 'active',
        timezone: payload.timezone,
        version: 1,
        details: { ...payload.details, independentBusiness: payload.legalEntityAssignment.type === 'new' },
      }
      state.branches.push(branch)
      return route.fulfill({ status: 201, json: structuredClone(branch) })
    }
    return route.fulfill({ status: 404, json: { message: `Mock no configurado: ${method} ${pathname}` } })
  })

  return calls
}

async function choose(page, testId, label) {
  await page.getByTestId(testId).click()
  await page.getByRole('option').filter({ hasText: label }).getByRole('button').click()
}

async function openBranch(page, branchId) {
  await page.getByTestId(`sucursal-edit-${branchId}`).click()
  await expect(page.getByTestId('sucursal-modal')).toBeVisible()
}

test('un usuario online recibe únicamente visibleBranches antes de visitar Sucursales', async ({ page }) => {
  await mockAdministration(page)
  await page.goto('/dashboard')

  await page.getByTestId('dashboard-branch-filter').click()
  await expect(page.getByRole('option').filter({ hasText: 'Principal' })).toBeVisible()
  await expect(page.getByRole('option').filter({ hasText: 'Norte' })).toBeVisible()
  await expect(page.getByRole('option').filter({ hasText: 'Este' })).toBeVisible()
  await expect(page.getByRole('option').filter({ hasText: 'Charm DN' })).toHaveCount(0)
})

test('PATCH general hace merge y PUT fiscal versionado refresca todas las tarjetas compartidas', async ({ page }) => {
  const calls = await mockAdministration(page)
  await page.goto('/configuracion/sucursales')

  await expect(page.getByTestId(`sucursal-fiscal-${ids.branchMain}`)).toContainText('Comercial Compartida SRL')
  await expect(page.getByTestId(`sucursal-fiscal-${ids.branchNorth}`)).toContainText('Comercial Compartida SRL')

  await openBranch(page, ids.branchMain)
  await page.getByTestId('branch-address').fill('Av. Principal Actualizada 99')
  await page.getByTestId('branch-phone').fill('809-555-0199')
  await page.getByTestId('branch-submit').click()
  await expect(page.getByTestId('sucursal-modal')).toHaveCount(0)

  await expect.poll(() => calls.patches.length).toBe(1)
  expect(calls.patches[0].payload).toEqual({
    name: 'Principal',
    status: 'active',
    timezone: 'America/Santo_Domingo',
    details: {
      address: 'Av. Principal Actualizada 99',
      phone: '809-555-0199',
      email: 'principal@example.com',
      manager: 'Ada',
      schedule: '09:00 - 18:00',
    },
    version: 3,
  })
  expect(calls.patches[0].payload.details).not.toHaveProperty('partners')
  expect(calls.patches[0].payload.details).not.toHaveProperty('independentBusiness')

  await openBranch(page, ids.branchMain)
  await page.getByTestId('branch-tab-socios').click()
  await expect(page.getByText('Ada Socia')).toBeVisible()
  await page.getByTestId('modal-close').click()

  await openBranch(page, ids.branchMain)
  await page.getByTestId('branch-tab-fiscal').click()
  await expect(page.getByText('Relación fiscal')).toHaveCount(0)
  await expect(page.getByTestId('branch-entity-action')).toHaveCount(0)
  await expect(page.getByTestId('branch-shared-warning')).toContainText('2 sucursales')
  await expect(page.getByTestId('branch-fiscal-change')).toBeVisible()
  await page.getByTestId('branch-legal-name').fill('Comercial Compartida Renovada SRL')
  await page.getByTestId('branch-rnc').fill('1-32-90890-4')
  await page.getByTestId('branch-submit').click()

  await expect.poll(() => calls.fiscal.length).toBe(1)
  expect(calls.fiscal[0].payload.version).toBe(7)
  expect(calls.fiscal[0].payload.taxIdentity.identifierValue).toBe('1-32-90890-4')
  await expect(page.getByTestId(`sucursal-fiscal-${ids.branchMain}`)).toContainText('Comercial Compartida Renovada SRL')
  await expect(page.getByTestId(`sucursal-fiscal-${ids.branchNorth}`)).toContainText('Comercial Compartida Renovada SRL')
  await expect.poll(() => calls.branchGets).toBeGreaterThanOrEqual(3)
  await expect.poll(() => calls.entityGets).toBeGreaterThanOrEqual(3)
})

test('separar y volver a compartir usa únicamente el assignment transaccional', async ({ page }) => {
  const calls = await mockAdministration(page)
  await page.goto('/configuracion/sucursales')

  await openBranch(page, ids.branchNorth)
  await page.getByTestId('branch-tab-fiscal').click()
  await page.getByTestId('branch-fiscal-change').click()
  await expect(page.getByTestId('branch-fiscal-assignment-options')).toContainText('solo si la sucursal')
  await page.getByTestId('branch-fiscal-create-own').click()
  await expect(page.getByTestId('branch-fiscal-change-summary')).toContainText('propios datos fiscales')
  await page.getByTestId('branch-legal-name').fill('Norte Independiente SRL')
  await page.getByTestId('branch-display-name').fill('Norte Independiente')
  await page.getByTestId('branch-rnc').fill('132908905')
  await page.getByTestId('branch-submit').click()

  await expect.poll(() => calls.assignments.length).toBe(1)
  expect(calls.assignments[0].payload).toMatchObject({
    assignment: {
      type: 'new',
      fiscalProfile: {
        legalName: 'Norte Independiente SRL',
        displayName: 'Norte Independiente',
        taxIdentity: { identifierValue: '132908905' },
      },
    },
    version: 2,
  })
  await expect(page.getByTestId(`sucursal-fiscal-${ids.branchNorth}`)).toContainText('Norte Independiente SRL')
  await expect(page.getByTestId(`sucursal-fiscal-${ids.branchMain}`)).toContainText('Comercial Compartida SRL')

  await openBranch(page, ids.branchNorth)
  await page.getByTestId('branch-tab-fiscal').click()
  await page.getByTestId('branch-fiscal-change').click()
  await page.getByTestId('branch-fiscal-use-existing').click()
  await choose(page, 'branch-entity-target', 'Comercial Compartida SRL')
  await page.getByTestId('branch-submit').click()

  await expect.poll(() => calls.assignments.length).toBe(2)
  expect(calls.assignments[1].payload.assignment).toEqual({
    type: 'existing',
    legalEntityId: ids.entityShared,
  })
  await expect(page.getByTestId(`sucursal-fiscal-${ids.branchMain}`)).toContainText('2 sucursales')
  await expect(page.getByTestId(`sucursal-fiscal-${ids.branchNorth}`)).toContainText('2 sucursales')
})

test('crear con entidad nueva hace un solo POST atómico y sincroniza el store global sin localStorage', async ({ page }) => {
  const calls = await mockAdministration(page)
  await page.goto('/configuracion/sucursales')

  await page.getByTestId('sucursal-new').click()
  await page.getByTestId('branch-name').fill('Sucursal Atómica')
  await page.getByTestId('branch-address').fill('Av. Atomicidad 1')
  await page.getByTestId('branch-tab-fiscal').click()
  await expect(page.getByTestId('branch-entity-mode')).toHaveCount(0)
  await expect(page.getByText('Datos fiscales que usará la sucursal')).toBeVisible()
  await page.getByTestId('branch-fiscal-create-own').click()
  await page.getByTestId('branch-legal-name').fill('Entidad Atómica SRL')
  await page.getByTestId('branch-display-name').fill('Entidad Atómica')
  await page.getByTestId('branch-rnc').fill('132908906')
  await page.getByTestId('branch-submit').click()

  await expect.poll(() => calls.creates.length).toBe(1)
  expect(calls.assignments).toEqual([])
  expect(calls.creates[0]).not.toHaveProperty('legalEntityId')
  expect(calls.creates[0].legalEntityAssignment).toMatchObject({
    type: 'new',
    fiscalProfile: {
      legalName: 'Entidad Atómica SRL',
      displayName: 'Entidad Atómica',
      taxIdentity: { identifierValue: '132908906' },
    },
  })
  await expect(page.getByText('Sucursal Atómica', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('diedo-config'))).toBeNull()

  await page.getByTestId('nav-dashboard').click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.getByTestId('dashboard-branch-filter').click()
  await expect(page.getByRole('option').filter({ hasText: 'Sucursal Atómica' })).toBeVisible()
})

test('un 409 fiscal conserva modal, pestaña, campo y evita éxito falso', async ({ page }) => {
  const calls = await mockAdministration(page, { fiscalConflict: true })
  await page.goto('/configuracion/sucursales')

  await openBranch(page, ids.branchMain)
  await page.getByTestId('branch-tab-fiscal').click()
  await page.getByTestId('branch-rnc').fill('132908903')
  await page.getByTestId('branch-submit').click()

  await expect.poll(() => calls.fiscal.length).toBe(1)
  await expect(page.getByTestId('sucursal-modal')).toBeVisible()
  await expect(page.getByTestId('branch-tab-fiscal')).toHaveClass(/text-blue-600/)
  await expect(page.getByTestId('branch-rnc')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByTestId('branch-form-error')).toContainText('El RNC ya está asignado')
  await expect(page.getByTestId('branch-submit')).toBeEnabled()
  await expect(page.getByText('Datos fiscales actualizados')).toHaveCount(0)
  expect(calls.branchGets).toBe(1)
  expect(calls.entityGets).toBe(1)
})

test('branch.read y legal_entity.read sin manage permiten consulta pero ninguna mutación', async ({ page }) => {
  const calls = await mockAdministration(page, { canManage: false })
  await page.goto('/configuracion/sucursales')

  await expect(page.getByTestId('sucursal-new')).toBeDisabled()
  await openBranch(page, ids.branchMain)
  await expect(page.getByTestId('branch-name')).toBeDisabled()
  await expect(page.getByTestId('branch-submit')).toBeDisabled()
  await expect(page.getByTestId('branch-read-only-notice')).toBeVisible()
  await page.getByTestId('branch-tab-fiscal').click()
  await expect(page.getByTestId('branch-entity-action')).toHaveCount(0)
  await expect(page.getByTestId('branch-fiscal-change')).toHaveCount(0)
  await expect(page.getByTestId('branch-legal-name')).toBeDisabled()
  await expect(page.getByTestId('branch-submit')).toBeDisabled()
  expect(calls.patches).toEqual([])
  expect(calls.fiscal).toEqual([])
  expect(calls.assignments).toEqual([])
  expect(calls.creates).toEqual([])
})

test('branch.read mínimo carga sucursales sin solicitar workspace ni perfiles fiscales', async ({ page }) => {
  const calls = await mockAdministration(page, {
    canManage: false,
    canReadWorkspace: false,
    canReadLegalEntity: false,
  })
  await page.goto('/configuracion/sucursales')

  await expect(page.getByText('Estado: ready · fuente: api')).toBeVisible()
  await expect(page.getByTestId(`sucursal-card-${ids.branchMain}`)).toBeVisible()
  await expect(page.getByTestId('config-general-card')).toHaveCount(0)
  await expect(page.locator('[data-testid^="sucursal-fiscal-"]')).toHaveCount(0)
  expect(calls.workspaceGets).toBe(0)
  expect(calls.entityGets).toBe(0)

  await openBranch(page, ids.branchMain)
  await page.getByTestId('branch-tab-fiscal').click()
  await expect(page.getByTestId('branch-fiscal-hidden-notice')).toBeVisible()
  await expect(page.getByTestId('branch-legal-name')).toHaveCount(0)
  await expect(page.getByTestId('branch-rnc')).toHaveCount(0)
})

test('branch.manage sin legal_entity.read crea contra una referencia existente sin revelar fiscal', async ({ page }) => {
  const calls = await mockAdministration(page, {
    canManage: true,
    canReadWorkspace: false,
    canReadLegalEntity: false,
    canManageLegalEntity: false,
  })
  await page.goto('/configuracion/sucursales')

  await page.getByTestId('sucursal-new').click()
  await page.getByTestId('branch-name').fill('Sucursal Scope Mínimo')
  await page.getByTestId('branch-address').fill('Av. Scope 1')
  await page.getByTestId('branch-tab-fiscal').click()
  await expect(page.getByTestId('branch-entity-target')).toContainText('Datos fiscales de')
  await expect(page.getByTestId('branch-target-summary')).toHaveCount(0)
  await expect(page.getByTestId('branch-legal-name')).toHaveCount(0)
  await expect(page.getByTestId('branch-rnc')).toHaveCount(0)
  await page.getByTestId('branch-submit').click()

  await expect.poll(() => calls.creates.length).toBe(1)
  expect(calls.creates[0].legalEntityAssignment).toEqual({
    type: 'existing',
    legalEntityId: ids.entityShared,
  })
  expect(calls.workspaceGets).toBe(0)
  expect(calls.entityGets).toBe(0)
})

test('modo demo conserva formulario fiscal legacy sin controles de assignment API', async ({ page }) => {
  await page.route('**/api-backend/**', (route) => route.abort('failed'))
  await page.goto('http://127.0.0.1:3101/configuracion/sucursales')
  await page.getByTestId('sucursal-new').click()
  await page.getByTestId('branch-tab-fiscal').click()

  await expect(page.getByTestId('branch-legal-name')).toBeEnabled()
  await expect(page.getByTestId('branch-rnc')).toBeEnabled()
  await expect(page.getByTestId('branch-entity-mode')).toHaveCount(0)
  await expect(page.getByTestId('branch-entity-action')).toHaveCount(0)
  await expect(page.getByTestId('branch-fiscal-change')).toHaveCount(0)
})
