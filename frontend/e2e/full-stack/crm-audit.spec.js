import { expect, test } from '@playwright/test'

const password = process.env.FULL_STACK_ADMIN_PASSWORD || 'full-stack-test-password-not-a-secret-2026'
const api = '/api-backend/api/v1'

async function login(page, email = 'demo.alex.admin@example.com') {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

async function auth(request, email = 'demo.alex.admin@example.com') {
  const response = await request.post(`${api}/auth/login`, { data: { email, password } })
  expect(response.ok()).toBeTruthy()
  return { Authorization: `Bearer ${(await response.json()).accessToken}` }
}

test('CRM-04: lead creado en pantalla convierte inmediatamente sin recargar', async ({ page }) => {
  await login(page)
  await page.goto('/crm/leads')
  await expect(page.getByText('Sincronizando con la API…')).toHaveCount(0)
  await page.getByTestId('lead-new').click()
  const company = `QA FIX Lead ${Date.now()}`
  await page.getByTestId('lead-name').fill('QA Conversión inmediata')
  await page.getByTestId('lead-company').fill(company)
  await page.getByTestId('lead-submit').click()
  await expect(page.getByTestId('lead-form-modal')).toHaveCount(0)
  await page.getByPlaceholder('Buscar leads...').fill(company)
  const converted = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/convert'))
  await page.getByRole('button', { name: 'Convertir', exact: true }).click()
  expect((await converted).ok()).toBeTruthy()
  await expect(page.getByText('El registro cambió desde la última lectura')).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('lead-converted.png') })
})

test('CRM-01/09/13: vendedor no edita scoring global ni carga cajas o RRHH ajenos', async ({ page, request }) => {
  const headers = await auth(request, 'demo.rio.seller@example.com')
  const scoring = await (await request.get(`${api}/crm/settings/scoring`, { headers })).json()
  const denied = await request.patch(`${api}/crm/settings/scoring`, { headers,
    data: { version: scoring.version, weights: scoring.weights } })
  expect(denied.status()).toBe(403)
  const errors = []
  page.on('response', r => { if (r.status() >= 400 && /pos\/registers|leave-requests\/me/.test(r.url())) errors.push(r.url()) })
  await login(page, 'demo.rio.seller@example.com')
  await page.goto('/crm/leads')
  await page.getByRole('button', { name: 'Criterios', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Guardar criterios' })).toBeDisabled()
  expect(errors).toEqual([])
})

test('CRM-05/12: ficha directa muestra el historial persistido en una sesión limpia', async ({ page, request }) => {
  const headers = await auth(request)
  const response = await request.get(`${api}/crm/customers?pageSize=200`, { headers })
  const customer = (await response.json()).items.find(c => Number(c.purchaseCount) > 0)
  expect(customer).toBeTruthy()
  await login(page)
  await page.goto(`/crm/clientes?customerId=${customer.id}`)
  await expect(page.getByTestId('customer-detail-modal')).toBeVisible()
  await expect(page.getByTestId('customer-detail-name')).toHaveText(customer.displayName)
  await expect.poll(async () => {
    const text = await page.getByTestId('customer-detail-total').innerText()
    return Number(text.replace(/[^\d.]/g, ''))
  }).toBe(Number(customer.totalSpent))
  await page.screenshot({ path: test.info().outputPath('customer-cold.png') })
})

test('CRM-09: supervisor no puede abrir creación de cotización sin permiso', async ({ page }) => {
  await login(page, 'demo.luz.supervisor@example.com')
  await page.goto('/crm/cotizaciones')
  await expect(page.getByTestId('cotizaciones-new-quote')).toBeDisabled()
})

test('CRM-08: cerrar desde pipeline reutiliza la factura existente', async ({ page, request }) => {
  const headers = await auth(request)
  const quotes = (await (await request.get(`${api}/crm/quotes?pageSize=200`, { headers })).json()).items
  const opportunities = (await (await request.get(`${api}/crm/opportunities?pageSize=200`, { headers })).json()).items
  const quote = quotes.find(q => (q.convertedSaleId || q.quote?.convertedSaleId)
    && opportunities.some(o => o.id === q.opportunityId && o.stage !== 'cerrado'))
  // Make the fixture independent of prior runs: a won opportunity can be reopened for this local test.
  const selected = quote || quotes.find(q => (q.convertedSaleId || q.quote?.convertedSaleId) && q.opportunityId)
  expect(selected).toBeTruthy()
  const opportunity = opportunities.find(o => o.id === selected.opportunityId)
  const reopened = await request.patch(`${api}/crm/opportunities/${opportunity.id}`, {
    headers, data: { version: opportunity.version, stage: 'nuevo' },
  })
  expect(reopened.ok()).toBeTruthy()
  await login(page)
  await page.setViewportSize({ width: 2200, height: 1100 })
  await page.goto('/crm/pipeline')
  const card = page.getByTestId(`pipeline-opportunity-${opportunity.id}`)
  await card.scrollIntoViewIfNeeded()
  const from = await card.boundingBox()
  const to = await page.locator('[data-pipeline-stage-header="cerrado"]').boundingBox()
  await page.mouse.move(from.x + 60, from.y + 25)
  await page.mouse.down()
  await page.mouse.move(to.x + 130, to.y + 150, { steps: 25 })
  await page.mouse.up()
  const modal = page.getByTestId('pipeline-close-invoice-modal')
  await expect(modal).toBeVisible()
  await expect(modal.getByText('Se vinculará la factura existente', { exact: false })).toBeVisible()
  const invoiceRequests = []
  page.on('request', r => { if (r.method() === 'POST' && /\/checkout$|\/invoice$/.test(r.url())) invoiceRequests.push(r.url()) })
  await page.getByTestId('pipeline-close-confirm').click()
  await expect(modal).toHaveCount(0)
  expect(invoiceRequests).toEqual([])
  const saved = await (await request.get(`${api}/crm/opportunities/${opportunity.id}`, { headers })).json()
  expect(saved.stage).toBe('cerrado')
})

test('CRM-06: búsqueda encuentra un lead fuera de la primera página de 200', async ({ page, request }) => {
  test.setTimeout(90_000)
  const headers = await auth(request)
  const me = await (await request.get(`${api}/auth/me`, { headers })).json()
  const branchId = me.visibleBranches[0].id
  const marker = `QA FIX volumen ${Date.now()}`
  for (let batch = 0; batch < 3; batch++) {
    const size = batch === 2 ? 5 : 100
    const response = await request.post(`${api}/crm/leads/import`, {
      headers: { ...headers, 'Idempotency-Key': `${marker}-${batch}` },
      data: { branchId, source: 'import', items: Array.from({ length: size }, (_, i) => ({
        branchId, company: `${marker} ${batch * 100 + i}`, name: 'QA volumen', status: 'descartado',
      })) },
    })
    expect(response.status()).toBe(201)
  }
  await login(page)
  await page.goto('/crm/leads')
  await expect(page.getByText('Sincronizando con la API…')).toHaveCount(0)
  await page.getByPlaceholder('Buscar leads...').fill(`${marker} 0`)
  await expect(page.getByRole('heading', { name: `${marker} 0`, exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('volume-search.png') })
})
