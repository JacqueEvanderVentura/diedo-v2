import { expect, test } from '@playwright/test'

const password =
  process.env.FULL_STACK_ADMIN_PASSWORD || 'full-stack-test-password-not-a-secret-2026'
const ownerPassword = 'Backoffice-e2e!password-2026'

async function login(page, email, secret = password) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(secret)
  await page.getByTestId('login-submit').click()
}

async function createCompany(page, slug, ownerEmail, existing = false) {
  await page.goto('/backoffice/companias')
  await page.getByRole('button', { name: 'Nueva compañía' }).click()
  if (existing) await page.getByLabel('Tipo de cuenta del propietario').selectOption('existing')
  await page.getByLabel('Nombre de compañía').fill(slug)
  await page.getByLabel('Slug', { exact: true }).fill(slug)
  await page.getByLabel('Email del propietario').fill(ownerEmail)
  if (!existing) {
    await page.getByLabel('Nombre del propietario').fill('Owner Backoffice E2E')
    await page.getByLabel('Contraseña inicial').fill(ownerPassword)
  } else {
    await expect(page.getByLabel('Contraseña inicial')).toBeDisabled()
  }
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/backoffice/workspaces') &&
      response.request().method() === 'POST'
  )
  await page.getByRole('button', { name: 'Crear compañía', exact: true }).click()
  const response = await created
  expect(response.status()).toBe(201)
  const data = await response.json()
  await expect(page).toHaveURL(new RegExp(`/backoffice/companias/${data.workspaceId}$`))
  await expect(page.getByRole('heading', { name: slug, exact: true })).toBeVisible()
  return data.workspaceId
}

test('operador crea compañías, conserva owner existente, cambia plan y administra accesos', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await login(page, 'backoffice@erp.dev')
  await expect(page).toHaveURL(/\/backoffice$/)
  const suffix = Date.now()
  const owner = `owner-bo-${suffix}@example.com`
  const firstId = await createCompany(page, `bo-first-${suffix}`, owner)
  await createCompany(page, `bo-second-${suffix}`, owner, true)
  await page.goto(`/backoffice/companias/${firstId}`)
  await page.getByLabel('Plan comercial').selectOption('basico')
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/workspaces/${firstId}`) && response.request().method() === 'PATCH'
  )
  await page.getByRole('button', { name: 'Guardar plan y módulos' }).click()
  const planResult = await saved
  expect(planResult.status()).toBe(200)
  const planData = await planResult.json()
  expect(planData.planCode).toBe('basico')
  expect(planData.configuredModules).not.toContain('finance')
  await page.reload()
  await expect(page.getByLabel('Plan comercial')).toHaveValue('basico')
  await page.getByRole('link', { name: 'Gestionar usuarios' }).click()
  await page.getByRole('button', { name: 'Registrar usuario', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const memberEmail = `staff-bo-${suffix}@example.com`
  await dialog.getByLabel('Nombre', { exact: true }).fill('Staff Backoffice E2E')
  await dialog.getByLabel('Email', { exact: true }).fill(memberEmail)
  await dialog.getByLabel('Contraseña', { exact: true }).fill(ownerPassword)
  await dialog.getByLabel('Rol 1', { exact: true }).selectOption({ label: 'Vendedor' })
  await dialog.getByLabel('Sucursal 1').selectOption({ label: 'Principal' })
  const memberCreated = page.waitForResponse(
    (response) =>
      response.url().endsWith('/backoffice/users') && response.request().method() === 'POST'
  )
  await dialog.getByRole('button', { name: 'Registrar', exact: true }).click()
  expect((await memberCreated).status()).toBe(201)
  const row = page.getByRole('row').filter({ hasText: memberEmail })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Suspender acceso', exact: true }).click()
  await expect(row.getByText('Suspendido', { exact: true })).toBeVisible()
  await expect(row.getByText('Activa', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: 'Reactivar acceso', exact: true }).click()
  await expect(row.getByText('Activo', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: 'Deshabilitar cuenta global' }).click()
  await page.getByRole('button', { name: 'Confirmar cambio global' }).click()
  await expect(row.getByText('Deshabilitada', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Compañía', exact: true })).toHaveValue(firstId)
  await page.goto(`/backoffice/companias/${firstId}`)
  await expect(page.getByRole('heading', { name: 'Actividad del Backoffice' })).toBeVisible()
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Cuenta global actualizada' })
  ).toBeVisible()
  await page.screenshot({ path: 'test-results/backoffice-company.png', fullPage: true })
  expect(errors).toEqual([])
})

test('suscripción cancelada bloquea al owner y reactivación recupera módulos', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000)
  await login(page, 'backoffice@erp.dev')
  await expect(page).toHaveURL(/\/backoffice$/)
  const suffix = Date.now()
  const ownerEmail = `subscription-bo-${suffix}@example.com`
  const wid = await createCompany(page, `bo-subscription-${suffix}`, ownerEmail)
  const ownerContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  try {
    await login(owner, ownerEmail, ownerPassword)
    await expect(owner).toHaveURL(/\/dashboard$/)
    await page.getByLabel('Estado de suscripción').selectOption('cancelled')
    await page.getByRole('button', { name: 'Guardar vigencia' }).click()
    await expect(page.getByText('Vigencia actualizada', { exact: true })).toBeVisible()
    await owner.reload()
    await expect(
      owner.getByRole('heading', { name: 'Suscripción sin acceso vigente' })
    ).toBeVisible()
    await page.getByLabel('Estado de suscripción').selectOption('active')
    await page.getByRole('button', { name: 'Guardar vigencia' }).click()
    await expect(page.getByText('Estado efectivo: Activa.', { exact: false })).toBeVisible()
    await owner.reload()
    await expect(
      owner.getByRole('heading', { name: 'Suscripción sin acceso vigente' })
    ).toHaveCount(0)
    await page.goto(`/backoffice/companias/${wid}`)
    await page.getByTestId('companias-toggle-status').click()
    await expect(page.getByText('Compañía suspendida', { exact: true })).toBeVisible()
    await owner.reload()
    await expect(owner.getByTestId('login-page')).toBeVisible()
  } finally {
    await ownerContext.close()
  }
})
