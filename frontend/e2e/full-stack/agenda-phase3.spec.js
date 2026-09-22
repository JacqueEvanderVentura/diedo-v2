import { expect, test } from '@playwright/test'

const api = '/api-backend/api/v1'
const password = process.env.FULL_STACK_ADMIN_PASSWORD || 'full-stack-test-password-not-a-secret-2026'

async function choose(page, testId, label) {
  await page.getByTestId(testId).click()
  await page.getByRole('option', { name: label, exact: true }).click()
}

async function openDay(page, branchName, date) {
  await page.goto('/agenda/calendario')
  await choose(page, 'calendar-branch', branchName)
  await page.getByTestId('calendar-view-day').click()
  await page.getByTestId('calendar-goto').fill(date)
}

test('notas cortas, columna fija y menú de WhatsApp en la vista Día', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/login')
  const loginResult = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/auth/login')
  )
  await page.getByTestId('login-email').fill('demo.alex.admin@example.com')
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  const auth = await (await loginResult).json()
  await expect(page).toHaveURL(/\/dashboard$/)

  const headers = { Authorization: `Bearer ${auth.accessToken}` }
  const session = await (await page.request.get(`${api}/auth/me`, { headers })).json()
  const branch = session.visibleBranches[0]
  const suffix = Date.now().toString(36)
  const resourceResponse = await page.request.post(`${api}/appointment-resources`, {
    headers,
    data: { branchId: branch.id, name: `Cabina Agenda ${suffix}` },
  })
  expect(resourceResponse.status()).toBe(201)
  const resource = await resourceResponse.json()
  const bookingContext = await (
    await page.request.get(`${api}/public/booking/branches/${branch.id}/context`)
  ).json()
  const service = bookingContext.services[0]
  expect(service).toBeTruthy()
  const date = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', {
    timeZone: bookingContext.branch.timezone,
  })
  const originalNote = 'Confirmar alergia antes de iniciar'
  const createResponse = await page.request.post(`${api}/appointments`, {
    headers: { ...headers, 'Idempotency-Key': `agenda-phase-3-${suffix}` },
    data: {
      branchId: branch.id,
      resourceId: resource.id,
      serviceId: service.id,
      date,
      time: '10:00',
      duration: 30,
      customerName: `Cliente Agenda ${suffix}`,
      customerPhone: '8294220141',
      serviceName: service.name,
      price: service.price,
      status: 'confirmed',
      notes: originalNote,
      recurrence: 'none',
      repeatCount: 1,
    },
  })
  expect(createResponse.status()).toBe(201)
  const appointment = (await createResponse.json()).items[0]

  await page.setViewportSize({ width: 1280, height: 900 })
  await openDay(page, branch.name, date)
  const card = page.getByTestId(`calendar-apt-${appointment.id}`)
  await expect(card).toContainText('Confirmar aler…')
  await expect(card).not.toContainText('10:00')

  await page.setViewportSize({ width: 390, height: 844 })

  await card.click()
  const sixtyCharacters = 'N'.repeat(60)
  await page.getByTestId('appointment-field-notes').fill(sixtyCharacters)
  await expect(page.getByTestId('appointment-notes-count')).toHaveText('60/60')
  const patchResult = page.waitForResponse(
    (response) => response.request().method() === 'PATCH'
      && response.url().endsWith(`/appointments/${appointment.id}`)
  )
  await page.getByTestId('appointment-form-save').click()
  expect((await patchResult).status()).toBe(200)
  await expect(page.getByTestId('appointment-form-modal')).toHaveCount(0)
  await expect(card).toContainText(`${'N'.repeat(14)}…`)

  await card.click()
  await page.getByTestId('appointment-field-notes').fill('Nota preservada')
  const appointmentUrl = `${api}/appointments/${appointment.id}`
  await page.route(`**${appointmentUrl}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'API temporalmente no disponible.', parameter: null }),
    })
  }, { times: 1 })
  await page.getByTestId('appointment-form-save').click()
  await expect(page.getByTestId('appointment-form-error')).toHaveText('API temporalmente no disponible.')
  await expect(page.getByTestId('appointment-field-notes')).toHaveValue('Nota preservada')
  await page.getByTestId('appointment-form-cancel').click()

  await page.reload()
  await choose(page, 'calendar-branch', branch.name)
  await page.getByTestId('calendar-view-day').click()
  await page.getByTestId('calendar-goto').fill(date)
  await expect(page.getByTestId(`calendar-apt-${appointment.id}`)).toContainText(`${'N'.repeat(14)}…`)

  const scroll = page.getByTestId('calendar-day-scroll')
  const timeHeading = page.getByTestId('calendar-time-heading')
  const headingBefore = await timeHeading.boundingBox()
  await scroll.evaluate((element) => { element.scrollLeft = element.scrollWidth })
  const headingAfter = await timeHeading.boundingBox()
  expect(Math.abs(headingAfter.x - headingBefore.x)).toBeLessThan(2)

  const whatsapp = page.getByTestId(`calendar-apt-wa-${appointment.id}`)
  await whatsapp.click()
  const menu = page.getByTestId(`calendar-apt-wa-${appointment.id}-menu`)
  await expect(menu).toBeVisible()
  const buttonBox = await whatsapp.boundingBox()
  const menuBox = await menu.boundingBox()
  expect(menuBox.x).toBeGreaterThanOrEqual(8)
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(382)
  expect(Math.abs(menuBox.x + menuBox.width - (buttonBox.x + buttonBox.width))).toBeLessThan(12)
  const verticallyAdjacent = menuBox.y >= buttonBox.y + buttonBox.height
    || menuBox.y + menuBox.height <= buttonBox.y
  expect(verticallyAdjacent).toBe(true)
  await page.getByTestId(`calendar-apt-wa-${appointment.id}-option-recordatorio`).click()
  await expect(page.getByTestId(`calendar-apt-wa-${appointment.id}-preview`)).toBeVisible()

  const current = await (
    await page.request.get(`${api}/appointments`, {
      headers,
      params: { branchId: branch.id, dateFrom: date, dateTo: date },
    })
  ).json()
  const persisted = current.items.find((item) => item.id === appointment.id)
  expect(persisted.notes).toBe(sixtyCharacters)
  const rejected = await page.request.patch(`${api}/appointments/${appointment.id}`, {
    headers,
    data: { version: persisted.version, notes: 'X'.repeat(61) },
  })
  expect(rejected.status()).toBe(400)
  expect((await rejected.json()).parameter).toBe('notes')
})
