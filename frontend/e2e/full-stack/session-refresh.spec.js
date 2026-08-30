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

function branchCard(page, name) {
  return page.locator('[data-testid^="sucursal-card-"]').filter({ hasText: name })
}

async function openBranch(page, name) {
  const card = branchCard(page, name)
  await expect(card).toBeVisible()
  await card.locator('[data-testid^="sucursal-edit-"]').click()
  await expect(page.getByTestId('sucursal-modal')).toBeVisible()
}

test('login, reload y refresh conservan la sesión a través del proxy real', async ({ page, context }) => {
  await login(page)

  const refreshCookie = (await context.cookies()).find((cookie) => cookie.name === 'erp_refresh')
  expect(refreshCookie).toMatchObject({
    httpOnly: true,
    path: '/api-backend/api/v1/auth',
  })

  await page.reload()

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: /Alex Demo/ })).toBeVisible()
  await expect(page.getByTestId('login-page')).toHaveCount(0)
})

test('dos pestañas rotan refresh de forma serial y sobreviven reload concurrente', async ({ page, context }) => {
  await login(page)
  const secondPage = await context.newPage()
  await secondPage.goto('/dashboard')
  await expect(secondPage.getByRole('heading', { name: /Alex Demo/ })).toBeVisible()

  await Promise.all([page.reload(), secondPage.reload()])

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(secondPage).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: /Alex Demo/ })).toBeVisible()
  await expect(secondPage.getByRole('heading', { name: /Alex Demo/ })).toBeVisible()
  await expect(page.getByTestId('login-page')).toHaveCount(0)
  await expect(secondPage.getByTestId('login-page')).toHaveCount(0)
})

test('general, perfil fiscal compartido, separación y creación atómica persisten tras reload real', async ({ page }) => {
  await login(page)
  await page.goto('/configuracion/sucursales')
  await expect(page.getByText('Estado: ready · fuente: api')).toBeVisible()

  await openBranch(page, 'Sucursal Norte')
  await page.getByTestId('branch-address').fill('Av. Fiscal Full Stack 2026')
  await page.getByTestId('branch-phone').fill('809-555-0266')
  await page.getByTestId('branch-schedule').fill('07:30 - 16:30')
  await page.getByTestId('branch-submit').click()
  await expect(page.getByTestId('sucursal-modal')).toHaveCount(0)

  await page.reload()
  await expect(page.getByText('Estado: ready · fuente: api')).toBeVisible()
  await openBranch(page, 'Sucursal Norte')
  await expect(page.getByTestId('branch-address')).toHaveValue('Av. Fiscal Full Stack 2026')
  await expect(page.getByTestId('branch-phone')).toHaveValue('809-555-0266')
  await expect(page.getByTestId('branch-schedule')).toHaveValue('07:30 - 16:30')

  await page.getByTestId('branch-tab-fiscal').click()
  await expect(page.getByTestId('branch-shared-warning')).toContainText('sucursales')
  await page.getByTestId('branch-legal-name').fill('Entidad Fiscal Full Stack SRL')
  await page.getByTestId('branch-display-name').fill('Entidad Fiscal Full Stack')
  await page.getByTestId('branch-rnc').fill('132908907')
  await page.getByTestId('branch-submit').click()
  await expect(page.getByTestId('sucursal-modal')).toHaveCount(0)

  await page.reload()
  await expect(page.getByText('Estado: ready · fuente: api')).toBeVisible()
  await openBranch(page, 'Sucursal Norte')
  await page.getByTestId('branch-tab-fiscal').click()
  await expect(page.getByTestId('branch-legal-name')).toHaveValue('Entidad Fiscal Full Stack SRL')
  await expect(page.getByTestId('branch-rnc')).toHaveValue('132908907')
  await page.getByTestId('modal-close').click()

  await openBranch(page, 'Sucursal Centro')
  await page.getByTestId('branch-tab-fiscal').click()
  await expect(page.getByTestId('branch-legal-name')).toHaveValue('Entidad Fiscal Full Stack SRL')
  await expect(page.getByTestId('branch-rnc')).toHaveValue('132908907')
  await expect(page.getByText('Relación fiscal')).toHaveCount(0)
  await page.getByTestId('branch-fiscal-change').click()
  await page.getByTestId('branch-fiscal-create-own').click()
  await page.getByTestId('branch-legal-name').fill('Entidad Centro Independiente SRL')
  await page.getByTestId('branch-display-name').fill('Centro Independiente')
  await page.getByTestId('branch-rnc').fill('132908908')
  await page.getByTestId('branch-submit').click()
  await expect(page.getByTestId('sucursal-modal')).toHaveCount(0)

  await page.reload()
  await expect(page.getByText('Estado: ready · fuente: api')).toBeVisible()
  await openBranch(page, 'Sucursal Centro')
  await page.getByTestId('branch-tab-fiscal').click()
  await expect(page.getByTestId('branch-legal-name')).toHaveValue('Entidad Centro Independiente SRL')
  await expect(page.getByTestId('branch-rnc')).toHaveValue('132908908')
  await page.getByTestId('modal-close').click()

  await page.getByTestId('sucursal-new').click()
  await page.getByTestId('branch-name').fill('Sucursal Atómica Full Stack')
  await page.getByTestId('branch-address').fill('Av. Atómica Full Stack 1')
  await page.getByTestId('branch-tab-fiscal').click()
  await page.getByTestId('branch-fiscal-create-own').click()
  await page.getByTestId('branch-legal-name').fill('Entidad Atómica Full Stack SRL')
  await page.getByTestId('branch-display-name').fill('Entidad Atómica Full Stack')
  await page.getByTestId('branch-rnc').fill('132908909')
  await page.getByTestId('branch-submit').click()
  await expect(page.getByTestId('sucursal-modal')).toHaveCount(0)

  await page.reload()
  await expect(page.getByText('Estado: ready · fuente: api')).toBeVisible()
  await expect(branchCard(page, 'Sucursal Atómica Full Stack')).toContainText('Entidad Atómica Full Stack SRL')
  await expect(branchCard(page, 'Sucursal Atómica Full Stack')).toContainText('132908909')
})
