import { expect, test } from '@playwright/test'

const email = 'demo.alex.admin@example.com'
const password = process.env.FULL_STACK_ADMIN_PASSWORD
  || 'full-stack-test-password-not-a-secret-2026'

async function login(page) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: /Alex Demo/ })).toBeVisible()
}

async function choose(page, testId, label) {
  await page.getByTestId(testId).click()
  await page.getByRole('option').filter({ hasText: label }).getByRole('button').click()
}

function grantedClass(granted) {
  return granted ? /bg-emerald-50/ : /bg-red-50/
}

test('batch real persiste dos roles sucios con una sola llamada tras reload', async ({ page }) => {
  const batchRequests = []
  const individualRequests = []
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname
    if (request.method() === 'PUT' && pathname.endsWith('/api/v1/roles/permissions:batch')) {
      batchRequests.push(request.postDataJSON())
    }
    if (request.method() === 'PUT' && /\/api\/v1\/roles\/[^/]+\/permissions$/.test(pathname)) {
      individualRequests.push(request.postDataJSON())
    }
  })

  await login(page)
  await page.goto('/configuracion/permisos')
  const module = page.locator('[data-testid^="api-perm-module-"]').first()
  await expect(module).toBeVisible()

  const headers = (await module.locator('thead th').allTextContents()).map((value) => value.trim())
  const managerButtonIndex = headers.indexOf('Gerente') - 1
  const supervisorButtonIndex = headers.indexOf('Supervisor') - 1
  expect(managerButtonIndex).toBeGreaterThanOrEqual(0)
  expect(supervisorButtonIndex).toBeGreaterThanOrEqual(0)

  const rowButtons = module.locator('tbody tr').first().locator('button')
  const managerButton = rowButtons.nth(managerButtonIndex)
  const supervisorButton = rowButtons.nth(supervisorButtonIndex)
  const managerTestId = await managerButton.getAttribute('data-testid')
  const supervisorTestId = await supervisorButton.getAttribute('data-testid')
  const managerWasGranted = (await managerButton.getAttribute('class')).includes('bg-emerald-50')
  const supervisorWasGranted = (await supervisorButton.getAttribute('class')).includes('bg-emerald-50')

  await managerButton.click()
  await supervisorButton.click()
  await page.getByTestId('permisos-save').click()
  await expect(page.getByText('Permisos IAM guardados')).toBeVisible()

  expect(batchRequests).toHaveLength(1)
  expect(batchRequests[0].roles).toHaveLength(2)
  expect(new Set(batchRequests[0].roles.map((role) => role.roleId)).size).toBe(2)
  expect(individualRequests).toEqual([])

  await page.reload()
  await expect(page.locator('[data-testid^="api-perm-module-"]').first()).toBeVisible()
  await expect(page.getByTestId(managerTestId)).toHaveClass(grantedClass(!managerWasGranted))
  await expect(page.getByTestId(supervisorTestId)).toHaveClass(grantedClass(!supervisorWasGranted))
})

test('categoría real se crea por POST y persiste tras reload', async ({ page }) => {
  const categoryName = 'Categoría Full Stack Scope'
  const createRequests = []
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname
    if (request.method() === 'POST' && pathname.endsWith('/api/v1/catalog/categories')) {
      createRequests.push(request.postDataJSON())
    }
  })

  await login(page)
  await page.goto('/configuracion/categorias')
  await expect(page.getByTestId('categoria-new-btn')).toBeEnabled()
  await page.getByTestId('categoria-new-btn').click()
  await page.getByTestId('categoria-field-name').fill(categoryName)
  await page.getByTestId('categoria-field-description').fill('Creada contra API y PostgreSQL reales')

  const createResponse = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname
    return response.request().method() === 'POST'
      && pathname.endsWith('/api/v1/catalog/categories')
  })
  await page.getByTestId('categoria-save').click()
  expect((await createResponse).status()).toBe(201)

  await expect(page.getByTestId('categoria-modal')).toHaveCount(0)
  await expect(page.getByText('Categoría creada')).toBeVisible()
  await expect(page.getByText(categoryName, { exact: true })).toBeVisible()
  expect(createRequests).toEqual([{
    name: categoryName,
    description: 'Creada contra API y PostgreSQL reales',
    status: 'active',
  }])

  await page.reload()
  await expect(page.getByText(categoryName, { exact: true })).toBeVisible()
})

test('usuario real crea y edita múltiples roleAssignments/scopes persistentes', async ({ page }) => {
  const createRequests = []
  const updateRequests = []
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname
    if (request.method() === 'POST' && pathname.endsWith('/api/v1/users')) {
      createRequests.push(request.postDataJSON())
    }
    if (request.method() === 'PATCH' && /\/api\/v1\/users\/[^/]+$/.test(pathname)) {
      updateRequests.push(request.postDataJSON())
    }
  })

  await login(page)
  await page.goto('/configuracion/usuarios')
  await expect(page.getByTestId('usuario-new-btn')).toBeEnabled()
  await page.getByTestId('usuario-new-btn').click()

  await page.getByTestId('usuario-name').fill('Persona Full Stack IAM')
  await page.getByTestId('usuario-email').fill('persona.full.stack.iam@example.com')
  await page.getByTestId('usuario-password-input').fill('password-full-stack-iam-2026')
  await choose(page, 'usuario-assignment-role-0', 'Vendedor')
  await choose(page, 'usuario-assignment-target-0', 'Sucursal Norte')
  await page.getByTestId('usuario-assignment-add').click()
  await choose(page, 'usuario-assignment-role-1', 'Supervisor')
  await choose(page, 'usuario-assignment-scope-1', 'Workspace completo (global)')
  await page.getByTestId('usuario-submit').click()

  await expect(page.getByTestId('usuario-modal')).toHaveCount(0)
  const createdRow = page.locator('[data-testid^="usuario-row-"]').filter({ hasText: 'persona.full.stack.iam@example.com' })
  await expect(createdRow).toContainText('Vendedor · Sucursal: Sucursal Norte')
  await expect(createdRow).toContainText('Supervisor · Workspace completo')
  expect(createRequests).toHaveLength(1)
  expect(createRequests[0].roleAssignments).toHaveLength(2)
  expect(createRequests[0].roleAssignments.map((assignment) => assignment.scopeType)).toEqual(['branch', 'workspace'])

  await page.reload()
  const persistedRow = page.locator('[data-testid^="usuario-row-"]').filter({ hasText: 'persona.full.stack.iam@example.com' })
  await expect(persistedRow).toContainText('Vendedor · Sucursal: Sucursal Norte')
  await expect(persistedRow).toContainText('Supervisor · Workspace completo')
  await persistedRow.locator('[data-testid^="usuario-edit-"]').click()
  await expect(page.getByTestId('usuario-assignment-0')).toBeVisible()
  await expect(page.getByTestId('usuario-assignment-1')).toBeVisible()
  await expect(page.getByTestId('usuario-assignment-0')).toContainText('Supervisor')
  await expect(page.getByTestId('usuario-assignment-1')).toContainText('Vendedor')

  await choose(page, 'usuario-assignment-scope-0', 'Entidad legal específica')
  await choose(page, 'usuario-assignment-target-0', 'Local ERP')
  await page.getByTestId('usuario-submit').click()
  await expect(page.getByTestId('usuario-modal')).toHaveCount(0)

  expect(updateRequests).toHaveLength(1)
  expect(updateRequests[0].roleAssignments).toHaveLength(2)
  expect(updateRequests[0].roleAssignments.map((assignment) => assignment.scopeType)).toEqual(['legalEntity', 'branch'])

  await page.reload()
  const editedRow = page.locator('[data-testid^="usuario-row-"]').filter({ hasText: 'persona.full.stack.iam@example.com' })
  await expect(editedRow).toContainText('Vendedor · Sucursal: Sucursal Norte')
  await expect(editedRow).toContainText('Supervisor · Entidad legal: Local ERP')
})
