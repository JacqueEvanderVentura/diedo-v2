import { expect, test } from '@playwright/test'

const adminEmail = 'demo.alex.admin@example.com'
const adminPassword = process.env.FULL_STACK_ADMIN_PASSWORD
  || 'full-stack-test-password-not-a-secret-2026'

function matchesApi(response, method, suffix) {
  return response.request().method() === method
    && new URL(response.url()).pathname.endsWith(suffix)
}

function readCurrency(value) {
  const numericValue = String(value ?? '').replace(/[^\d.-]/g, '')
  return Number(numericValue || 0)
}

async function login(page) {
  await page.goto('/login')

  const loginResponsePromise = page.waitForResponse((response) => (
    matchesApi(response, 'POST', '/api/v1/auth/login')
  ))

  await page.getByTestId('login-email').fill(adminEmail)
  await page.getByTestId('login-password').fill(adminPassword)
  await page.getByTestId('login-submit').click()

  const loginResponse = await loginResponsePromise
  expect(loginResponse.ok()).toBe(true)
  await expect(page).toHaveURL(/\/dashboard$/)
}

async function readSalesKpi(page) {
  const salesCard = page.getByText('Total Ventas', { exact: true }).locator('..')
  await expect(salesCard).toBeVisible()
  return readCurrency(await salesCard.locator('p').nth(1).textContent())
}

test.describe('Terminal POS full stack', () => {
  test('abre caja, cobra un servicio en efectivo y refleja la venta en Caja y CxC', async ({ page }) => {
    await login(page)

    const initialStatePromise = page.waitForResponse((response) => (
      matchesApi(response, 'GET', '/api/v1/pos/state')
      && response.ok()
    ))
    await page.goto('/pos/caja')
    const initialStateResponse = await initialStatePromise
    expect(initialStateResponse.ok()).toBe(true)
    await expect(page.getByTestId('pos-sync-status')).toBeHidden()

    const closedRegister = page.getByTestId('caja-open-card')
    const openRegister = page.getByTestId('caja-page')
    await expect(closedRegister.or(openRegister)).toBeVisible()

    if (await closedRegister.isVisible()) {
      const createRegisterResponsePromise = page.waitForResponse((response) => (
        matchesApi(response, 'POST', '/api/v1/pos/registers')
      ))
      const refreshedStatePromise = page.waitForResponse((response) => (
        matchesApi(response, 'GET', '/api/v1/pos/state') && response.ok()
      ))

      await page.getByTestId('caja-opening-input').fill('1000')
      await page.getByTestId('caja-open-btn').click()

      const createRegisterResponse = await createRegisterResponsePromise
      expect(createRegisterResponse.status()).toBe(201)
      await refreshedStatePromise
    }

    await expect(openRegister).toBeVisible()
    const salesBeforeCheckout = await readSalesKpi(page)

    await page.goto('/pos')
    const productGrid = page.getByTestId('pos-product-grid')
    await expect(productGrid).toBeVisible()

    const serviceCard = productGrid
      .locator('[data-testid^="pos-product-"]')
      .filter({ hasText: 'Servicio' })
      .first()
    await expect(serviceCard).toBeVisible()
    await expect(serviceCard).toBeEnabled()
    await serviceCard.click()

    await expect(page.locator('div[data-testid^="cart-item-"]')).toHaveCount(1)
    await page.getByTestId('cart-mode-invoice').click()
    await expect(page.getByTestId('pos-payment-section')).toBeVisible()
    await page.getByTestId('pos-payment-efectivo').click()

    const cartTotal = readCurrency(await page.getByTestId('cart-total').textContent())
    expect(cartTotal).toBeGreaterThan(0)

    const checkoutResponsePromise = page.waitForResponse((response) => (
      matchesApi(response, 'POST', '/api/v1/pos/checkout')
    ))
    const refreshedStatePromise = page.waitForResponse((response) => (
      matchesApi(response, 'GET', '/api/v1/pos/state') && response.ok()
    ))

    await page.getByTestId('pos-checkout-btn').click()

    const checkoutResponse = await checkoutResponsePromise
    expect(checkoutResponse.status()).toBe(201)
    const checkoutPayload = await checkoutResponse.json()
    const sale = checkoutPayload.sale ?? checkoutPayload
    expect(sale.id).toBeTruthy()
    expect(Number(sale.total)).toBeCloseTo(cartTotal, 2)
    await refreshedStatePromise
    await expect(page.locator('div[data-testid^="cart-item-"]')).toHaveCount(0)

    await page.getByTestId('pos-caja-shortcut').click()
    await expect(page).toHaveURL(/\/pos\/caja$/)
    await expect(openRegister).toBeVisible()

    await expect.poll(() => readSalesKpi(page)).toBeGreaterThanOrEqual(
      salesBeforeCheckout + Number(sale.total) - 0.01,
    )

    const saleMovement = page
      .getByTestId('caja-movements')
      .getByTestId(`caja-void-sale-${sale.id}`)
    await expect(saleMovement).toBeVisible()

    const receivablesNavigation = page.getByTestId('nav-sub-/pos/cuentas-por-cobrar')
    await expect(receivablesNavigation).toBeVisible()
    await receivablesNavigation.click()

    await expect(page).toHaveURL(/\/pos\/cuentas-por-cobrar$/)
    await expect(page.getByTestId('cxc-summary-total')).toBeVisible()
    await expect(page.getByTestId('cxc-summary-count')).toBeVisible()
  })
})
