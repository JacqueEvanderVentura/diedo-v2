import { expect, test } from '@playwright/test'

const api = '/api-backend/api/v1'
const password = process.env.FULL_STACK_ADMIN_PASSWORD || 'full-stack-test-password-not-a-secret-2026'

async function choose(page, testId, label) {
  await page.getByTestId(testId).click()
  await page.getByRole('option', { name: label, exact: true }).click()
}

test('enlace por correo, reserva pública y gestión desde otro navegador', async ({ page, browser }) => {
  test.setTimeout(90_000)
  const origin = test.info().project.use.baseURL
  await page.goto('/login')
  const loginResult = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/auth/login'))
  await page.getByTestId('login-email').fill('demo.alex.admin@example.com')
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  const auth = await (await loginResult).json()
  await expect(page).toHaveURL(/\/dashboard$/)
  const headers = { Authorization: `Bearer ${auth.accessToken}` }
  const me = await (await page.request.get(`${api}/auth/me`, { headers })).json()
  const branch = me.visibleBranches[0]
  const employeeResponse = await page.request.post(`${api}/employees`, { headers, data: {
    firstName: 'Especialista', lastName: 'PruebaBooking', position: 'Especialista',
    hireDate: '2026-01-01', branchIds: [branch.id], onlineBookingSelectable: true,
    schedule: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [day, [{ start: '09:00', end: '18:00' }]])),
  } })
  expect(employeeResponse.status()).toBe(201)
  const context = await (await page.request.get(`${api}/public/booking/branches/${branch.id}/context`)).json()
  expect(context.services.length).toBeGreaterThan(0)
  expect(context.hasResources).toBe(true)
  const service = context.services[0]

  await page.goto('/agenda/calendario')
  await choose(page, 'calendar-branch', branch.name)
  await page.getByTestId('calendar-booking-link').click()
  await page.getByTestId('booking-link-name').fill('Cliente prueba Booking')
  await page.getByTestId('booking-link-email').fill('booking-ui@example.com')
  await page.getByTestId('booking-link-send-email').click()
  await expect(page.getByTestId('booking-link-email-result')).toContainText('desactivado')
  await expect(page.getByTestId('booking-link-phone')).toHaveValue('')

  const guestContext = await browser.newContext()
  const guest = await guestContext.newPage()
  const bookingUrl = `${origin}/agendar?branch=${branch.id}`
  await guest.goto(bookingUrl)
  await choose(guest, 'self-doc-type', 'Pasaporte')
  const document = `QA${Date.now()}`
  await guest.getByTestId('self-doc-lookup').fill(document)
  await guest.getByRole('button', { name: 'Continuar', exact: true }).click()
  await guest.getByTestId('self-name').fill('Cliente prueba Booking')
  await guest.getByTestId('self-email').fill('booking-ui@example.com')
  await guest.getByTestId('self-phone').fill('8294220141')
  await guest.getByTestId('self-save-profile').click()
  await guest.getByTestId('self-service').click()
  await guest.getByRole('option').filter({ hasText: service.name }).first().click()
  await choose(guest, 'self-duration', '45 Minutos')
  await choose(guest, 'self-specialist', 'Especialista PruebaBooking')
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: context.branch.timezone })
  await guest.getByTestId('self-booking-date-trigger').click()
  if (!(await guest.getByTestId(`self-booking-date-calendar-day-${tomorrow}`).count())) await guest.getByTestId('self-booking-date-calendar-next').click()
  await guest.getByTestId(`self-booking-date-calendar-day-${tomorrow}`).click()
  await guest.getByTestId('self-slot-10:00').click()
  const bookingResponse = guest.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/appointments'))
  await guest.getByTestId('self-confirm').click()
  const response = await bookingResponse
  expect(response.status()).toBe(201)
  const appointment = (await response.json()).appointment
  expect(appointment.durationMinutes).toBe(45)
  await expect(guest.getByRole('heading', { name: '¡Cita confirmada!' })).toBeVisible()
  await expect(guest.getByText('La cita está guardada. El envío de correo está desactivado.')).toBeVisible()
  const management = await guest.getByRole('link', { name: 'Gestionar mi cita' }).getAttribute('href')
  await guestContext.close()

  await page.goto('/agenda/calendario')
  await choose(page, 'calendar-branch', branch.name)
  await page.getByTestId('calendar-goto').fill(tomorrow)
  await expect(page.getByTestId(`calendar-apt-${appointment.id}`).first()).toContainText('Cliente prueba Booking')

  const freshContext = await browser.newContext()
  const managementPage = await freshContext.newPage()
  await managementPage.goto(`${origin}${management}`)
  await expect(managementPage.getByTestId('managed-appointment-time')).toContainText('45 minutos')
  await choose(managementPage, 'manage-duration', '1 Hora')
  await choose(managementPage, 'manage-time', '13:00')
  await managementPage.getByTestId('manage-reschedule').click()
  await expect(managementPage.getByTestId('managed-appointment-time')).toContainText('13:00 · 60 minutos')
  await managementPage.getByTestId('manage-cancel').click()
  await managementPage.getByTestId('manage-confirm-cancel').click()
  await expect(managementPage.getByTestId('managed-appointment-status')).toHaveText('Cancelada')
  const calendar = await (await page.request.get(`${api}/appointments`, { headers, params: { branchId: branch.id, dateFrom: tomorrow, dateTo: tomorrow } })).json()
  expect(calendar.items.find((item) => item.id === appointment.id)?.status).toBe('cancelled')

  // The same customer returns through identification, without creating a duplicate profile.
  await managementPage.goto(bookingUrl)
  await choose(managementPage, 'self-doc-type', 'Pasaporte')
  await managementPage.getByTestId('self-doc-lookup').fill(document)
  await managementPage.getByRole('button', { name: 'Continuar', exact: true }).click()
  await managementPage.getByTestId('self-service').click()
  await managementPage.getByRole('option').filter({ hasText: service.name }).first().click()
  await choose(managementPage, 'self-specialist', 'Especialista PruebaBooking')
  await managementPage.getByTestId('self-booking-date-trigger').click()
  if (!(await managementPage.getByTestId(`self-booking-date-calendar-day-${tomorrow}`).count())) await managementPage.getByTestId('self-booking-date-calendar-next').click()
  await managementPage.getByTestId(`self-booking-date-calendar-day-${tomorrow}`).click()
  await managementPage.getByTestId('self-slot-14:00').click()
  const returningResponse = managementPage.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/appointments'))
  await managementPage.getByTestId('self-confirm').click()
  const returning = await returningResponse
  expect(returning.status()).toBe(201)
  expect((await returning.json()).appointment.customerId).toBe(appointment.customerId)
  await expect(managementPage.getByRole('heading', { name: '¡Cita confirmada!' })).toBeVisible()
  await freshContext.close()
})
