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
}

test('directorio crea con UUID reales y overview se refresca desde su endpoint', async ({ page }) => {
  await login(page)
  await page.goto('/rrhh/directorio')
  await expect(page.getByText('Datos sincronizados con la API.')).toBeVisible()

  await page.getByTestId('new-employee-btn').click()
  await page.getByPlaceholder('Nombre').fill('Empleado')
  await page.getByPlaceholder('Apellido').fill('Full Stack')
  await page.getByPlaceholder('correo@empresa.com').fill('employee.hr.fullstack@example.com')
  await page.getByPlaceholder('Ej. Especialista Laser').fill('Especialista QA')
  await page.locator('[data-testid="employee-modal"] label')
    .filter({ hasText: 'Sucursal Norte' })
    .getByRole('checkbox')
    .check()

  const createResponsePromise = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname
    return response.request().method() === 'POST' && pathname.endsWith('/api/v1/employees')
  })
  await page.getByRole('button', { name: 'Crear empleado' }).click()
  const createResponse = await createResponsePromise
  expect(createResponse.status()).toBe(201)
  const payload = createResponse.request().postDataJSON()
  expect(payload.branchIds).toHaveLength(1)
  expect(payload.branchIds[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i)
  expect(payload.branchIds).not.toContain('charm-dn')
  await expect(
    page.locator('[data-testid^="employee-card-"]').filter({ hasText: 'Empleado Full Stack' })
  ).toBeVisible()

  const overviewResponsePromise = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname
    return response.request().method() === 'GET' && pathname.endsWith('/api/v1/hr/overview')
  })
  await page.goto('/rrhh')
  expect((await overviewResponsePromise).status()).toBe(200)
  await expect(page.getByText('Datos sincronizados con la API.')).toBeVisible()
  await expect(page.getByText('Cuentas por cobrar', { exact: true })).toBeVisible()
  await expect(page.getByText('Incidencias / Reportes')).toHaveCount(0)
})
