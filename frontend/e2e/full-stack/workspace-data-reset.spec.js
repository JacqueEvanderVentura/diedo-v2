import { expect, test } from '@playwright/test'

const password = process.env.FULL_STACK_ADMIN_PASSWORD || 'full-stack-test-password-not-a-secret-2026'
const api = '/api-backend/api/v1'
const adminEmail = 'demo.alex.admin@example.com'

async function auth(request, email = adminEmail) {
  const response = await request.post(`${api}/auth/login`, { data: { email, password } })
  expect(response.ok()).toBeTruthy()
  return { Authorization: `Bearer ${(await response.json()).accessToken}` }
}

async function login(page, email = adminEmail) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test('workspace_admin reinicia data operativa desde configuración y conserva identidad', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000)

  const headers = await auth(request)
  const me = await (await request.get(`${api}/auth/me`, { headers })).json()
  const slug = me.workspace.slug
  expect(slug).toBeTruthy()

  const customersBefore = await (
    await request.get(`${api}/customers?pageSize=1`, { headers })
  ).json()
  const branchesBefore = await (await request.get(`${api}/branches`, { headers })).json()
  const usersBefore = await (
    await request.get(`${api}/users/summary`, { headers })
  ).json()
  const paymentMethodsBefore = await (
    await request.get(`${api}/payment-methods`, { headers })
  ).json()
  const salesBefore = await (
    await request.get(`${api}/pos/sales?pageSize=1`, { headers })
  ).json()
  const employeesBefore = await (
    await request.get(`${api}/employees?pageSize=1`, { headers })
  ).json()
  const itemsBefore = await (
    await request.get(`${api}/inventory/items?pageSize=1`, { headers })
  ).json()

  const countItems = (payload) => payload.totalItems ?? payload.items?.length ?? 0

  expect(countItems(customersBefore)).toBeGreaterThan(0)
  expect(countItems(salesBefore)).toBeGreaterThan(0)
  expect(countItems(employeesBefore)).toBeGreaterThan(0)
  expect(countItems(itemsBefore)).toBeGreaterThan(0)
  expect(branchesBefore.length).toBeGreaterThan(0)
  expect(usersBefore.totalUsers ?? 0).toBeGreaterThan(0)
  const systemPaymentMethods = paymentMethodsBefore.filter((method) => method.isSystem)
  expect(systemPaymentMethods.length).toBeGreaterThan(0)

  await login(page)
  await page.goto('/configuracion?open=zona-peligro')
  await expect(page.getByTestId('config-hub-zona-peligro')).toBeVisible()
  await page.getByTestId('config-hub-zona-peligro').click()
  await page.getByTestId('config-data-reset-trigger').click()

  const resetResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/workspace/data-reset') && response.request().method() === 'POST'
  )
  await page.getByTestId('config-data-reset-dialog-phrase-input').fill(slug)
  await page.getByRole('button', { name: 'Reiniciar data', exact: true }).click()
  const resetResult = await resetResponse
  expect(resetResult.status()).toBe(200)
  const resetBody = await resetResult.json()
  expect(resetBody.deletedCounts?.customers ?? 0).toBeGreaterThan(0)

  await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 })

  const headersAfter = await auth(request)
  const customersAfter = await (
    await request.get(`${api}/customers?pageSize=50`, { headers: headersAfter })
  ).json()
  const branchesAfter = await (await request.get(`${api}/branches`, { headers: headersAfter })).json()
  const usersAfter = await (
    await request.get(`${api}/users/summary`, { headers: headersAfter })
  ).json()
  const paymentMethodsAfter = await (
    await request.get(`${api}/payment-methods`, { headers: headersAfter })
  ).json()
  const leadsAfter = await (
    await request.get(`${api}/crm/leads?pageSize=1`, { headers: headersAfter })
  ).json()
  const salesAfter = await (
    await request.get(`${api}/pos/sales?pageSize=1`, { headers: headersAfter })
  ).json()
  const employeesAfter = await (
    await request.get(`${api}/employees?pageSize=1`, { headers: headersAfter })
  ).json()
  const itemsAfter = await (
    await request.get(`${api}/inventory/items?pageSize=1`, { headers: headersAfter })
  ).json()

  const customerCount = countItems(customersAfter)
  const leadCount = countItems(leadsAfter)
  const memberCount = usersAfter.totalUsers ?? 0
  const systemAfter = paymentMethodsAfter.filter((method) => method.isSystem)

  expect(customerCount).toBe(0)
  expect(leadCount).toBe(0)
  expect(countItems(salesAfter)).toBe(0)
  expect(countItems(employeesAfter)).toBe(0)
  expect(countItems(itemsAfter)).toBe(0)
  expect(branchesAfter.length).toBe(branchesBefore.length)
  expect(memberCount).toBeGreaterThan(0)
  expect(systemAfter.length).toBeGreaterThanOrEqual(systemPaymentMethods.length)

  await page.screenshot({ path: test.info().outputPath('workspace-reset-post-login.png') })
})
